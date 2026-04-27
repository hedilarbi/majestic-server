const mongoose = require("mongoose");

const SubscriptionSale = require("../models/SubscriptionSale");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const {
  enqueueSubscriptionSaleEmail,
} = require("./subscriptionSaleDeliveryService");
const { registerPayment } = require("./paymentService");

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

const parseHistoryDate = (value, label, boundary = "start") => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      const error = new Error(`${label} invalide`);
      error.status = 400;
      throw error;
    }

    return value;
  }

  if (typeof value !== "string") {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const dateOnlyMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return boundary === "end"
      ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
      : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  return parsed;
};

const buildSalesDateFilter = ({ dateFrom, dateTo } = {}) => {
  const fromDate = parseHistoryDate(dateFrom, "dateFrom", "start");
  const toDate = parseHistoryDate(dateTo, "dateTo", "end");

  if (!fromDate && !toDate) {
    return null;
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    const error = new Error("dateFrom must be before dateTo");
    error.status = 400;
    throw error;
  }

  return {
    ...(fromDate ? { $gte: fromDate } : {}),
    ...(toDate ? { $lte: toDate } : {}),
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

const normalizeText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const isValidEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const assertVerifiedCustomer = async ({ userId, userRole, dbSession }) => {
  if (userRole !== "customer") {
    return null;
  }

  const query = User.findById(userId).select("role emailVerified");
  if (dbSession) {
    query.session(dbSession);
  }

  const user = await query;
  if (!user || user.role !== "customer") {
    const error = new Error("Compte client introuvable.");
    error.status = 404;
    throw error;
  }

  if (user.emailVerified !== true) {
    const error = new Error(
      "Vous devez vérifier votre adresse email avant de finaliser un achat."
    );
    error.status = 403;
    error.code = "EMAIL_NOT_VERIFIED";
    throw error;
  }

  return user;
};

const normalizeCustomerContact = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const firstName = normalizeText(value.firstName || value.prenom);
  const lastName = normalizeText(value.lastName || value.nom);
  const email = normalizeEmail(value.email);

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email,
  };
};

const serializeCustomerContact = (contact) => {
  if (!contact || typeof contact !== "object") {
    return null;
  }

  const firstName = normalizeText(contact.firstName);
  const lastName = normalizeText(contact.lastName);
  const email = normalizeEmail(contact.email);

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email,
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

const withSession = (query, dbSession) => {
  if (dbSession) {
    return query.session(dbSession);
  }

  return query;
};

const resolveNumeric = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const listSubscriptionSales = async ({ page, limit, soldBy, dateFrom, dateTo }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = {};
  if (soldBy) {
    if (!mongoose.isValidObjectId(soldBy)) {
      const error = new Error("Invalid soldBy id");
      error.status = 400;
      throw error;
    }
    query.soldBy = soldBy;
  }
  const createdAtFilter = buildSalesDateFilter({ dateFrom, dateTo });
  if (createdAtFilter) {
    query.createdAt = createdAtFilter;
  }
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
    customerContact: serializeCustomerContact(sale.customerContact),
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

const listSubscriptionSalesForUser = async ({ userId, page, limit, dateFrom, dateTo }) => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  return listSubscriptionSales({
    page,
    limit,
    soldBy: userId,
    dateFrom,
    dateTo,
  });
};

const ALLOWED_PAYMENT_METHODS = new Set(["online", "cash", "card"]);
const ALLOWED_SOURCES = new Set(["web", "mobile", "ticket_office"]);

const normalizeSource = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "mobile") {
    return "web";
  }
  return ALLOWED_SOURCES.has(normalized) ? normalized : "";
};

const syncSubscriptionSalesForCustomer = async ({
  userId,
  email,
  dbSession = null,
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!userId || !mongoose.isValidObjectId(userId) || !normalizedEmail) {
    return { linkedCount: 0 };
  }

  const linkResult = await withSession(
    SubscriptionSale.updateMany(
      {
        $or: [{ userId: null }, { userId: { $exists: false } }],
        "customerContact.email": normalizedEmail,
      },
      { $set: { userId } },
    ),
    dbSession,
  );

  const latestSale = await withSession(
    SubscriptionSale.findOne({
      $or: [{ userId }, { "customerContact.email": normalizedEmail }],
      status: "confirmed",
      paymentStatus: "completed",
    })
      .sort({ createdAt: -1 })
      .select("subscriptionId"),
    dbSession,
  );

  if (latestSale?.subscriptionId) {
    await withSession(
      User.updateOne(
        { _id: userId },
        { $set: { subscriptionId: latestSale.subscriptionId } },
      ),
      dbSession,
    );
  }

  return {
    linkedCount: Number(
      linkResult?.modifiedCount ?? linkResult?.nModified ?? 0,
    ),
  };
};

const createSubscriptionSale = async ({ payload, userId, userRole }) => {
  const {
    customerId,
    customerContact,
    subscriptionId,
    paymentMethod,
    source,
  } = payload || {};
  const isTicketOfficeFlow =
    userRole === "ticket_office" ||
    userRole === "admin" ||
    userRole === "super_admin";
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

  const normalizedCustomerContact = normalizeCustomerContact(customerContact);
  const resolvedCustomerId = isCustomerFlow ? userId : customerId;

  if (!mongoose.isValidObjectId(subscriptionId)) {
    const error = new Error("Invalid subscription id");
    error.status = 400;
    throw error;
  }

  const dbSession = await mongoose.startSession();
  let sale = null;

  try {
    await dbSession.withTransaction(async () => {
      await assertVerifiedCustomer({
        userId,
        userRole,
        dbSession,
      });

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

      let resolvedCustomerUser = null;
      let resolvedCustomerContact = null;

      if (isCustomerFlow) {
        resolvedCustomerUser = await User.findById(resolvedCustomerId).session(
          dbSession,
        );
        if (!resolvedCustomerUser) {
          const error = new Error("Customer not found");
          error.status = 404;
          throw error;
        }

        resolvedCustomerContact = {
          firstName: normalizeText(resolvedCustomerUser.firstName),
          lastName: normalizeText(resolvedCustomerUser.lastName),
          email: normalizeEmail(resolvedCustomerUser.email),
        };
      } else {
        if (
          !normalizedCustomerContact?.firstName ||
          !normalizedCustomerContact?.lastName ||
          !isValidEmail(normalizedCustomerContact?.email)
        ) {
          const error = new Error(
            "Le nom, le prénom et un email valide sont obligatoires.",
          );
          error.status = 400;
          throw error;
        }

        resolvedCustomerContact = normalizedCustomerContact;

        if (mongoose.isValidObjectId(resolvedCustomerId)) {
          resolvedCustomerUser = await User.findById(resolvedCustomerId).session(
            dbSession,
          );
        }

        if (!resolvedCustomerUser) {
          resolvedCustomerUser = await User.findOne({
            email: resolvedCustomerContact.email,
            role: "customer",
          }).session(dbSession);
        }
      }

      const defaultPaymentMethod = isTicketOfficeFlow ? "cash" : "online";
      const resolvedPaymentMethod =
        paymentMethod && ALLOWED_PAYMENT_METHODS.has(paymentMethod)
          ? paymentMethod
          : defaultPaymentMethod;
      const resolvedSource = isTicketOfficeFlow
        ? "ticket_office"
        : normalizeSource(source) || "web";

      let finalStatus = "confirmed";
      let finalPaymentStatus = "completed";
      let formUrl = null;

      const saleDoc = new SubscriptionSale({
        userId: resolvedCustomerUser?._id || null,
        customerContact: resolvedCustomerContact || undefined,
        subscriptionId,
        price: subscription.price,
        totalCredits: subscription.totalCredits,
        usedCredits: 0,
        remainingCredits: subscription.totalCredits,
        paymentMethod: resolvedPaymentMethod,
        soldBy: userId,
        source: resolvedSource,
      });

      if (resolvedPaymentMethod === "online" && subscription.price > 0) {
        finalStatus = "pending";
        finalPaymentStatus = "pending";
        
        await saleDoc.validate(); // generate subscriptionCode

        const returnUrl = process.env.FRONTEND_URL 
          ? `${process.env.FRONTEND_URL}/payment-verify` 
          : "http://localhost:3000/payment-verify";

        const paymentRes = await registerPayment({
          amount: subscription.price,
          orderNumber: saleDoc.subscriptionCode,
          returnUrl,
          failUrl: returnUrl,
        });

        saleDoc.paymentDetails = {
          transactionId: paymentRes.orderId,
          gateway: "ipay",
        };
        formUrl = paymentRes.formUrl;
      }

      saleDoc.status = finalStatus;
      saleDoc.paymentStatus = finalPaymentStatus;

      saleDoc.$session(dbSession);
      await saleDoc.save();
      sale = [saleDoc];
      
      if (formUrl) {
        sale[0].paymentFormUrl = formUrl;
      }

      if (resolvedCustomerUser?._id) {
        await User.updateOne(
          { _id: resolvedCustomerUser._id },
          { $set: { subscriptionId } },
        ).session(dbSession);
      }
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

  if (createdSale.status === "confirmed") {
    try {
      enqueueSubscriptionSaleEmail({ saleId: createdSale._id });
    } catch (error) {
      console.error(
        "[subscription-email] unable to enqueue email delivery",
        error && error.stack ? error.stack : error,
      );
    }
  }

  return {
    paymentFormUrl: createdSale.paymentFormUrl || null,
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
  listSubscriptionSalesForUser,
  createSubscriptionSale,
  syncSubscriptionSalesForCustomer,
};
