const mongoose = require("mongoose");

const SubscriptionSale = require("../models/SubscriptionSale");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

const resolvePagination = (page, limit) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

const serializeUser = (user) => {
  if (!user || typeof user !== "object") {
    return null;
  }

  return {
    id: user._id ? String(user._id) : null,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    phone: user.phone || "",
  };
};

const serializeSubscription = (subscription) => {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  return {
    id: subscription._id ? String(subscription._id) : null,
    name: subscription.name || "",
    price: subscription.price,
    totalCredits: subscription.totalCredits,
    expirationDate: subscription.expirationDate || null,
    isActive: subscription.isActive !== false,
  };
};

const resolveNumeric = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const listSubscriptionSales = async ({ page, limit }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = {};
  const [total, sales] = await Promise.all([
    SubscriptionSale.countDocuments(query),
    SubscriptionSale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({ path: "userId", select: "firstName lastName email phone" })
      .populate({
        path: "subscriptionId",
        select: "name price totalCredits expirationDate isActive",
      })
      .populate({ path: "soldBy", select: "firstName lastName email" })
      .lean(),
  ]);

  const items = sales.map((sale) => ({
    id: sale._id ? String(sale._id) : null,
    subscriptionCode: sale.subscriptionCode || "",
    user: serializeUser(sale.userId),
    subscription: serializeSubscription(sale.subscriptionId),
    price: sale.price,
    totalCredits: sale.totalCredits,
    usedCredits: resolveNumeric(sale.usedCredits, 0),
    remainingCredits: resolveNumeric(
      sale.remainingCredits,
      Math.max(
        resolveNumeric(sale.totalCredits, 0) - resolveNumeric(sale.usedCredits, 0),
        0,
      ),
    ),
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    status: sale.status,
    source: sale.source,
    lastUsedAt: sale.lastUsedAt || null,
    soldBy: serializeUser(sale.soldBy),
    createdAt: sale.createdAt || null,
  }));

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const ALLOWED_PAYMENT_METHODS = new Set(["online", "cash", "card"]);
const ALLOWED_SOURCES = new Set(["web", "mobile", "ticket_office"]);

const normalizeSource = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  return ALLOWED_SOURCES.has(normalized) ? normalized : "";
};

const createSubscriptionSale = async ({ payload, userId, userRole }) => {
  const { customerId, subscriptionId, paymentMethod, source } = payload || {};
  const isTicketOfficeFlow =
    userRole === "ticket_office" || userRole === "admin";
  const isCustomerFlow = userRole === "customer";

  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  if (!isTicketOfficeFlow && !isCustomerFlow) {
    const error = new Error("Access denied");
    error.status = 403;
    throw error;
  }

  const resolvedCustomerId = isCustomerFlow ? userId : customerId;
  if (!mongoose.isValidObjectId(resolvedCustomerId)) {
    const error = new Error("Invalid customer id");
    error.status = 400;
    throw error;
  }

  if (!mongoose.isValidObjectId(subscriptionId)) {
    const error = new Error("Invalid subscription id");
    error.status = 400;
    throw error;
  }

  const dbSession = await mongoose.startSession();
  let sale = null;

  try {
    await dbSession.withTransaction(async () => {
      const subscription = await Subscription.findById(subscriptionId).session(
        dbSession,
      );
      if (!subscription) {
        const error = new Error("Subscription not found");
        error.status = 404;
        throw error;
      }

      const now = new Date();
      if (subscription.isActive === false) {
        const error = new Error("Subscription is not active");
        error.status = 409;
        throw error;
      }

      if (
        subscription.expirationDate &&
        new Date(subscription.expirationDate).getTime() < now.getTime()
      ) {
        const error = new Error("Subscription is expired");
        error.status = 409;
        throw error;
      }

      const customer = await User.findById(resolvedCustomerId).session(dbSession);
      if (!customer) {
        const error = new Error("Customer not found");
        error.status = 404;
        throw error;
      }

      const defaultPaymentMethod = isTicketOfficeFlow ? "cash" : "online";
      const resolvedPaymentMethod =
        paymentMethod && ALLOWED_PAYMENT_METHODS.has(paymentMethod)
          ? paymentMethod
          : defaultPaymentMethod;
      const resolvedSource = isTicketOfficeFlow
        ? "ticket_office"
        : normalizeSource(source) || "web";

      sale = await SubscriptionSale.create(
        [
          {
            userId: resolvedCustomerId,
            subscriptionId,
            price: subscription.price,
            totalCredits: subscription.totalCredits,
            usedCredits: 0,
            remainingCredits: subscription.totalCredits,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: "completed",
            status: "confirmed",
            soldBy: userId,
            source: resolvedSource,
          },
        ],
        { session: dbSession },
      );

      await User.updateOne(
        { _id: resolvedCustomerId },
        { $set: { subscriptionId } },
      ).session(dbSession);
    });
  } finally {
    dbSession.endSession();
  }

  if (!sale || !sale.length) {
    const error = new Error("Unable to create subscription sale");
    error.status = 500;
    throw error;
  }

  const createdSale = sale[0];
  return {
    sale: {
      id: createdSale._id,
      subscriptionCode: createdSale.subscriptionCode || "",
      price: createdSale.price,
      totalCredits: createdSale.totalCredits,
      remainingCredits: createdSale.remainingCredits,
      createdAt: createdSale.createdAt,
    },
  };
};

module.exports = {
  listSubscriptionSales,
  createSubscriptionSale,
};
