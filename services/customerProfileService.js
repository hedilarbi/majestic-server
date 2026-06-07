const mongoose = require("mongoose");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const SubscriptionSale = require("../models/SubscriptionSale");
const { buildTicketPdfDownload } = require("./ticketDeliveryService");

const CUSTOMER_ROLE = "customer";

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

const assertCustomer = async (payload) => {
  const userId = payload && payload.sub;

  if (!userId) {
    const error = new Error("Missing user id");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId).select("_id role email");
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  if (user.role !== CUSTOMER_ROLE) {
    const error = new Error("Accès client requis");
    error.status = 403;
    throw error;
  }

  return user;
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const buildSubscriptionSaleQuery = (customer) => {
  const normalizedEmail = normalizeEmail(customer?.email);
  if (normalizedEmail) {
    return {
      $or: [{ userId: customer._id }, { "customerContact.email": normalizedEmail }],
    };
  }

  return { userId: customer._id };
};

const serializeSession = (session) => {
  if (!session || typeof session !== "object") {
    return null;
  }

  const event =
    session.eventId && typeof session.eventId === "object"
      ? session.eventId
      : null;

  return {
    id: session._id ? String(session._id) : null,
    date: session.date || null,
    sessionTime: session.sessionTime || "",
    roomId: session.roomId || "",
    event: event
      ? {
          id: event._id ? String(event._id) : null,
          name: event.name || event.nom || event.title || "",
          poster: event.poster || event.affiche || event.image || "",
        }
      : null,
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
    description: subscription.description || "",
    allowedSeatType: subscription.allowedSeatType || "normale",
    maxSeatsPerSession: Number.isFinite(subscription.maxSeatsPerSession)
      ? subscription.maxSeatsPerSession
      : 1,
  };
};

const serializeCustomerContact = (contact) => {
  if (!contact || typeof contact !== "object") {
    return null;
  }

  const firstName = typeof contact.firstName === "string" ? contact.firstName.trim() : "";
  const lastName = typeof contact.lastName === "string" ? contact.lastName.trim() : "";
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

const serializeBookingPayment = (booking) => {
  const session = serializeSession(booking.sessionId);
  const eventName = session?.event?.name || "Séance";
  const datePart = session?.date ? String(session.date).slice(0, 10) : "";
  const timePart = session?.sessionTime || "";

  return {
    id: `booking:${String(booking._id)}`,
    transactionId: booking._id ? String(booking._id) : null,
    kind: "booking",
    title: `Billet - ${eventName}`,
    subtitle:
      datePart || timePart
        ? `${datePart}${timePart ? ` • ${timePart}` : ""}`
        : "Réservation de séance",
    amount: booking.totalAmount,
    paymentMethod: booking.paymentMethod || "",
    paymentStatus: booking.paymentStatus || "",
    source: booking.bookingSource || "",
    status: booking.status || "",
    reference: booking.bookingNumber || "",
    booking: {
      id: booking._id ? String(booking._id) : null,
      bookingNumber: booking.bookingNumber || "",
    },
    createdAt: booking.createdAt || null,
  };
};

const serializeSubscriptionPayment = (sale) => ({
  id: `subscription:${String(sale._id)}`,
  transactionId: sale._id ? String(sale._id) : null,
  kind: "subscription",
  title: `Abonnement - ${sale.subscriptionId?.name || "Abonnement"}`,
  subtitle: Number.isFinite(sale.totalCredits)
    ? `${sale.totalCredits} crédits`
    : "Abonnement client",
  amount: sale.price,
  paymentMethod: sale.paymentMethod || "",
  paymentStatus: sale.paymentStatus || "",
  source: sale.source || "",
  status: sale.status || "",
  reference: sale.subscriptionCode || sale.subscriptionId?.name || "",
  subscription: serializeSubscription(sale.subscriptionId),
  subscriptionCode: sale.subscriptionCode || "",
  customerContact: serializeCustomerContact(sale.customerContact),
  remainingCredits: Number.isFinite(sale.remainingCredits)
    ? sale.remainingCredits
    : sale.totalCredits,
  usedCredits: Number.isFinite(sale.usedCredits) ? sale.usedCredits : 0,
  createdAt: sale.createdAt || null,
});

const serializeSubscriptionSale = (sale) => ({
  id: sale._id ? String(sale._id) : null,
  subscription: serializeSubscription(sale.subscriptionId),
  customerContact: serializeCustomerContact(sale.customerContact),
  price: sale.price,
  totalCredits: sale.totalCredits,
  usedCredits: Number.isFinite(sale.usedCredits) ? sale.usedCredits : 0,
  remainingCredits: Number.isFinite(sale.remainingCredits)
    ? sale.remainingCredits
    : sale.totalCredits,
  subscriptionCode: sale.subscriptionCode || "",
  paymentMethod: sale.paymentMethod || "",
  paymentStatus: sale.paymentStatus || "",
  status: sale.status || "",
  source: sale.source || "",
  createdAt: sale.createdAt || null,
  expiresAt: sale.expiresAt || null,
  // Flat fields for easy access in checkout dropdown
  allowedSeatType: sale.subscriptionId?.allowedSeatType || "normale",
  maxSeatsPerSession: Number.isFinite(sale.subscriptionId?.maxSeatsPerSession)
    ? sale.subscriptionId.maxSeatsPerSession
    : 1,
});

const listCustomerBookings = async ({ tokenPayload, page, limit }) => {
  const customer = await assertCustomer(tokenPayload);
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = { userId: customer._id };
  const [total, items] = await Promise.all([
    Booking.countDocuments(query),
    Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "bookingNumber sessionId seats totalAmount paymentMethod paymentStatus bookingSource status createdAt",
      )
      .populate({
        path: "sessionId",
        select: "date sessionTime roomId eventId",
        populate: { path: "eventId", select: "name poster affiche image" },
      })
      .lean(),
  ]);

  return {
    items: items.map((booking) => ({
      id: booking._id ? String(booking._id) : null,
      bookingNumber: booking.bookingNumber || "",
      session: serializeSession(booking.sessionId),
      seats: Array.isArray(booking.seats) ? booking.seats : [],
      seatsCount: Array.isArray(booking.seats) ? booking.seats.length : 0,
      totalAmount: booking.totalAmount,
      paymentMethod: booking.paymentMethod || "",
      paymentStatus: booking.paymentStatus || "",
      bookingSource: booking.bookingSource || "",
      status: booking.status || "",
      createdAt: booking.createdAt || null,
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const listCustomerTickets = async ({ tokenPayload, page, limit }) => {
  const customer = await assertCustomer(tokenPayload);
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = { userId: customer._id };
  const [total, items] = await Promise.all([
    Ticket.countDocuments(query),
    Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "code status seat pricingName price qrCodeUrl isScanned scannedAt cancelledAt bookingId sessionId createdAt",
      )
      .populate({
        path: "bookingId",
        select: "bookingNumber paymentStatus status bookingSource createdAt",
      })
      .populate({
        path: "sessionId",
        select: "date sessionTime roomId eventId",
        populate: { path: "eventId", select: "name poster affiche image" },
      })
      .lean(),
  ]);

  return {
    items: items.map((ticket) => ({
      id: ticket._id ? String(ticket._id) : null,
      code: ticket.code || "",
      status:
        String(ticket.status || "").toLowerCase() === "cancelled"
          ? "cancelled"
          : typeof ticket.isScanned === "boolean" && ticket.isScanned
            ? "scanned"
            : String(ticket.status || "").toLowerCase() === "scanned"
              ? "scanned"
              : "active",
      seat: ticket.seat || null,
      pricingName: ticket.pricingName || "",
      price: ticket.price,
      qrCodeUrl: ticket.qrCodeUrl || null,
      isScanned:
        typeof ticket.isScanned === "boolean"
          ? ticket.isScanned
          : String(ticket.status || "").toLowerCase() === "scanned",
      scannedAt: ticket.scannedAt || null,
      cancelledAt: ticket.cancelledAt || null,
      booking: ticket.bookingId
        ? {
            id: ticket.bookingId._id ? String(ticket.bookingId._id) : null,
            bookingNumber: ticket.bookingId.bookingNumber || "",
            paymentStatus: ticket.bookingId.paymentStatus || "",
            status: ticket.bookingId.status || "",
            source: ticket.bookingId.bookingSource || "",
            createdAt: ticket.bookingId.createdAt || null,
          }
        : null,
      session: serializeSession(ticket.sessionId),
      createdAt: ticket.createdAt || null,
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const listCustomerSubscriptionSales = async ({ tokenPayload, page, limit }) => {
  const customer = await assertCustomer(tokenPayload);
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = buildSubscriptionSaleQuery(customer);
  const [total, items] = await Promise.all([
    SubscriptionSale.countDocuments(query),
    SubscriptionSale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "subscriptionId subscriptionCode customerContact price totalCredits usedCredits remainingCredits paymentMethod paymentStatus status source expiresAt createdAt",
      )
      .populate({
        path: "subscriptionId",
        select: "name price totalCredits expirationDate isActive description allowedSeatType maxSeatsPerSession",
      })
      .lean(),
  ]);

  return {
    items: items.map(serializeSubscriptionSale),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const getCustomerSubscriptionSaleById = async ({ tokenPayload, saleId }) => {
  const customer = await assertCustomer(tokenPayload);

  if (!saleId || !mongoose.isValidObjectId(saleId)) {
    const error = new Error("Invalid subscription sale id");
    error.status = 400;
    throw error;
  }

  const sale = await SubscriptionSale.findOne({
    _id: saleId,
    ...buildSubscriptionSaleQuery(customer),
  })
    .select(
      "subscriptionId subscriptionCode customerContact price totalCredits usedCredits remainingCredits paymentMethod paymentStatus status source expiresAt createdAt",
    )
    .populate({
      path: "subscriptionId",
      select: "name price totalCredits expirationDate isActive description",
    })
    .lean();

  if (!sale) {
    const error = new Error("Subscription sale not found");
    error.status = 404;
    throw error;
  }

  return {
    sale: serializeSubscriptionSale(sale),
  };
};

const listCustomerPayments = async ({ tokenPayload, page, limit }) => {
  const customer = await assertCustomer(tokenPayload);
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const [bookings, subscriptionSales] = await Promise.all([
    Booking.find({ userId: customer._id })
      .sort({ createdAt: -1 })
      .select(
        "bookingNumber sessionId totalAmount paymentMethod paymentStatus bookingSource status createdAt",
      )
      .populate({
        path: "sessionId",
        select: "date sessionTime roomId eventId",
        populate: { path: "eventId", select: "name poster affiche image" },
      })
      .lean(),
    SubscriptionSale.find(buildSubscriptionSaleQuery(customer))
      .sort({ createdAt: -1 })
      .select(
        "subscriptionId subscriptionCode customerContact price totalCredits usedCredits remainingCredits paymentMethod paymentStatus status source expiresAt createdAt",
      )
      .populate({
        path: "subscriptionId",
        select: "name price totalCredits expirationDate isActive description",
      })
      .lean(),
  ]);

  const merged = [
    ...bookings.map(serializeBookingPayment),
    ...subscriptionSales.map(serializeSubscriptionPayment),
  ].sort((a, b) => {
    const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });

  const total = merged.length;
  const items = merged.slice(skip, skip + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const getCustomerTicketPdf = async ({ tokenPayload, ticketId }) => {
  const customer = await assertCustomer(tokenPayload);

  return buildTicketPdfDownload({
    ticketId,
    customerId: customer._id,
  });
};

module.exports = {
  listCustomerBookings,
  listCustomerTickets,
  getCustomerTicketPdf,
  listCustomerSubscriptionSales,
  getCustomerSubscriptionSaleById,
  listCustomerPayments,
};
