const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const SeatLock = require("../models/SeatLock");
const SeatReservation = require("../models/SeatReservation");
const Session = require("../models/Session");
const Pricing = require("../models/Pricing");
const SubscriptionSale = require("../models/SubscriptionSale");
const promoCodeService = require("./promoCodeService");
const guestService = require("./guestService");
const { enqueueBookingTicketEmail } = require("./ticketDeliveryService");
const auditLogService = require("./auditLogService");
const { registerPayment } = require("./paymentService");
const { seatKey } = require("../utils/seatKey");
const {
  resolveRoom,
  buildPricingOverrideMap,
  validateSeatsAgainstLayout,
  buildSeatOrFilters
} = require("../utils/seatHelpers");

const ACTIVE_BOOKING_STATUSES = ["confirmed", "used"];

const mergeUniqueSeats = (seats = []) => {
  const byKey = new Map();

  seats.forEach((seat) => {
    if (!seat || seat.row === undefined || seat.col === undefined) {
      return;
    }

    const key = seatKey(seat.row, seat.col);
    const existing = byKey.get(key);
    const pricingOverrideId =
    seat.pricingOverrideId ?? (
    existing ? existing.pricingOverrideId : null);

    byKey.set(key, {
      row: String(seat.row),
      col: Number(seat.col),
      pricingOverrideId
    });
  });

  return Array.from(byKey.values());
};

const sortSeats = (seats = []) =>
[...seats].sort((a, b) => {
  const rowCompare = String(a.row).localeCompare(String(b.row));
  if (rowCompare !== 0) {
    return rowCompare;
  }
  return Number(a.col) - Number(b.col);
});

const normalizePrice = (value) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeContactText = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeCustomerContact = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const firstName = normalizeContactText(value.firstName || value.prenom);
  const lastName = normalizeContactText(value.lastName || value.nom);
  const email = normalizeContactText(value.email).toLowerCase();

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email
  };
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

const normalizeBookingSource = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "mobile") {
    return "web";
  }

  if (normalized === "web") {
    return "web";
  }

  return "";
};

const normalizeSubscriptionCode = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) {
    return "";
  }

  if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) {
    return "";
  }

  return normalized;
};

const resolveTicketStatus = (ticket) => {
  const rawStatus = String(ticket?.status || "").
  trim().
  toLowerCase();

  if (rawStatus === "cancelled") {
    return "cancelled";
  }

  if (rawStatus === "scanned" || ticket?.isScanned === true) {
    return "scanned";
  }

  return "active";
};

const isTicketActive = (ticket) => resolveTicketStatus(ticket) === "active";
const isTicketScanned = (ticket) => resolveTicketStatus(ticket) === "scanned";
const isTicketCancelled = (ticket) => resolveTicketStatus(ticket) === "cancelled";

const roundCurrency = (value) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
};

const buildPricingKey = (name, price) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedPrice = Number(price);
  return `${normalizedName}|${Number.isFinite(normalizedPrice) ? normalizedPrice : ""}`;
};

const groupTicketCountsByPricing = (tickets = []) => {
  const grouped = new Map();

  tickets.forEach((ticket) => {
    const key = buildPricingKey(ticket?.pricingName, ticket?.price);
    const current = grouped.get(key);

    if (current) {
      current.quantity += 1;
      return;
    }

    grouped.set(key, {
      pricingName: ticket?.pricingName || "",
      price: roundCurrency(ticket?.price),
      quantity: 1
    });
  });

  return Array.from(grouped.values());
};

const applyPricingLimitDeltas = async ({
  sessionId,
  pricingItems = [],
  dbSession
}) => {
  for (const item of pricingItems) {
    const quantity = Number.parseInt(item?.quantity, 10);
    const price = roundCurrency(item?.price);
    const pricingName = String(item?.pricingName || "").trim();

    if (!pricingName || !Number.isFinite(price) || !quantity) {
      continue;
    }

    await Session.updateOne(
      {
        _id: sessionId,
        "pricingLimits.name": pricingName,
        "pricingLimits.price": price
      },
      {
        $inc: { "pricingLimits.$.soldCount": quantity }
      }
    ).session(dbSession);
  }
};

const normalizePricingLimits = (session) => {
  const limits = Array.isArray(session?.pricingLimits) ?
  session.pricingLimits :
  [];
  const byId = new Map();
  const byKey = new Map();

  limits.forEach((limit) => {
    if (!limit) {
      return;
    }

    const pricingSource =
    limit.pricingId && typeof limit.pricingId === "object" ?
    limit.pricingId :
    null;

    const id = pricingSource?._id ?? (
    typeof limit.pricingId === "string" ? limit.pricingId : null);
    const name = pricingSource?.name || limit.name;
    const price = normalizePrice(pricingSource?.price ?? limit.price);

    if (!name || price === null) {
      return;
    }

    const entry = {
      id: id ? String(id) : null,
      name,
      price,
      maxTickets: Number.isFinite(limit.maxTickets) ?
      Number(limit.maxTickets) :
      null,
      soldCount: Number.isFinite(limit.soldCount) ?
      Number(limit.soldCount) :
      0
    };

    const key = buildPricingKey(entry.name, entry.price);
    byKey.set(key, entry);
    if (entry.id) {
      byId.set(entry.id, entry);
    }
  });

  return { byId, byKey };
};

const normalizePricingSelections = ({ selections, pricingLimits }) => {
  const { byId, byKey } = pricingLimits;

  const normalized = new Map();

  (Array.isArray(selections) ? selections : []).forEach((selection) => {
    if (!selection) {
      return;
    }

    const quantity = Number.parseInt(
      selection.quantity ?? selection.count ?? 0,
      10
    );
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const rawId = selection.pricingId ?? selection.id ?? null;
    const rawName = selection.name ?? selection.label ?? null;
    const rawPrice = selection.price ?? selection.amount ?? null;

    let resolved = null;
    if (rawId && byId.has(String(rawId))) {
      resolved = byId.get(String(rawId));
    }

    if (!resolved) {
      const name = rawName ? String(rawName).trim() : "";
      const price = normalizePrice(rawPrice);
      if (name && price !== null) {
        const key = buildPricingKey(name, price);
        if (byKey.has(key)) {
          resolved = byKey.get(key);
        }
      }
    }

    if (!resolved) {
      const error = new Error("Tarif invalide dans la selection");
      error.status = 400;
      throw error;
    }

    const key = buildPricingKey(resolved.name, resolved.price);
    const existing = normalized.get(key) || {
      name: resolved.name,
      price: resolved.price,
      quantity: 0
    };

    existing.quantity += quantity;
    normalized.set(key, existing);
  });

  return Array.from(normalized.values());
};

const resolvePricingMeta = (raw) => {
  if (!raw) {
    return null;
  }

  if (typeof raw === "object") {
    const id = raw._id ?? raw.id ?? null;
    const name = raw.name ?? raw.nom ?? "";
    const price = normalizePrice(raw.price ?? raw.prix);
    return {
      id: id ? String(id) : null,
      name,
      price
    };
  }

  if (mongoose.isValidObjectId(raw)) {
    return { id: String(raw), name: "", price: null };
  }

  return null;
};

const resolvePagination = (page, limit) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit =
  Number.isFinite(parsedLimit) && parsedLimit > 0 ?
  Math.min(parsedLimit, 200) :
  50;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit
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
    return boundary === "end" ?
    new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999) :
    new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  return parsed;
};

const buildBookingsDateFilter = ({ dateFrom, dateTo } = {}) => {
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
    ...(toDate ? { $lte: toDate } : {})
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
    email: user.email || ""
  };
};

const serializeSession = (session) => {
  if (!session || typeof session !== "object") {
    return null;
  }

  const event =
  session.eventId && typeof session.eventId === "object" ?
  session.eventId :
  null;

  return {
    id: session._id ? String(session._id) : null,
    date: session.date || null,
    sessionTime: session.sessionTime || "",
    roomId: session.roomId || "",
    event: event ?
    {
      id: event._id ? String(event._id) : null,
      name: event.name || event.nom || event.title || ""
    } :
    null
  };
};

const serializeCustomerContact = (contact) => {
  if (!contact || typeof contact !== "object") {
    return null;
  }

  const firstName = normalizeContactText(contact.firstName);
  const lastName = normalizeContactText(contact.lastName);
  const email = normalizeContactText(contact.email).toLowerCase();

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email
  };
};

const serializeBooking = (booking) => ({
  id: booking._id ? String(booking._id) : null,
  bookingNumber: booking.bookingNumber || "",
  totalAmount: booking.totalAmount,
  paymentMethod: booking.paymentMethod,
  paymentStatus: booking.paymentStatus,
  bookingSource: booking.bookingSource,
  status: booking.status,
  seats: Array.isArray(booking.seats) ? booking.seats : [],
  seatsCount: Array.isArray(booking.seats) ? booking.seats.length : 0,
  printCount: Number.isFinite(booking.printCount) ? booking.printCount : 0,
  createdAt: booking.createdAt || null,
  bookedBy: serializeUser(booking.bookedBy),
  customer: serializeUser(booking.userId),
  customerContact: serializeCustomerContact(booking.customerContact),
  session: serializeSession(booking.sessionId),
  promotion:
  booking.promotion && typeof booking.promotion === "object" ?
  {
    code: booking.promotion.code || "",
    reductionType: booking.promotion.reductionType || "",
    reductionValue: Number.isFinite(booking.promotion.reductionValue) ?
    Number(booking.promotion.reductionValue) :
    null,
    discountAmount: Number.isFinite(booking.promotion.discountAmount) ?
    Number(booking.promotion.discountAmount) :
    0,
    amountBeforeDiscount: Number.isFinite(
      booking.promotion.amountBeforeDiscount
    ) ?
    Number(booking.promotion.amountBeforeDiscount) :
    null
  } :
  null,
  subscriptionTransaction:
  booking.subscriptionTransaction &&
  typeof booking.subscriptionTransaction === "object" ?
  {
    subscriptionId: booking.subscriptionTransaction.subscriptionId ?
    String(booking.subscriptionTransaction.subscriptionId) :
    null,
    subscriptionSaleId: booking.subscriptionTransaction.subscriptionSaleId ?
    String(booking.subscriptionTransaction.subscriptionSaleId) :
    null,
    subscriptionCode: booking.subscriptionTransaction.subscriptionCode || "",
    creditsUsed: Number.isFinite(booking.subscriptionTransaction.creditsUsed) ?
    Number(booking.subscriptionTransaction.creditsUsed) :
    0
  } :
  null
});

const serializeTicket = (ticket) => ({
  status: resolveTicketStatus(ticket),
  id: ticket._id ? String(ticket._id) : null,
  code: ticket.code || "",
  isScanned: isTicketScanned(ticket),
  seat: ticket.seat || null,
  pricingName: ticket.pricingName || "",
  price: ticket.price,
  printCount: Number.isFinite(ticket.printCount) ? Number(ticket.printCount) : 0,
  qrCodeUrl: ticket.qrCodeUrl || null,
  scannedAt: ticket.scannedAt || null,
  cancelledAt: ticket.cancelledAt || null,
  createdAt: ticket.createdAt || null
});

const buildBookingsQuery = ({
  bookedBy,
  dateFrom,
  dateTo,
  paymentMethod,
  paymentStatus,
  bookingSource,
  status,
} = {}) => {
  const query = {};
  const createdAtFilter = buildBookingsDateFilter({ dateFrom, dateTo });
  if (bookedBy) {
    if (!mongoose.isValidObjectId(bookedBy)) {
      const error = new Error("Invalid bookedBy id");
      error.status = 400;
      throw error;
    }
    query.bookedBy = bookedBy;
  }
  if (createdAtFilter) {
    query.createdAt = createdAtFilter;
  }
  if (paymentMethod) {
    query.paymentMethod = String(paymentMethod);
  }
  if (paymentStatus) {
    query.paymentStatus = String(paymentStatus);
  }
  if (bookingSource) {
    query.bookingSource = String(bookingSource);
  }
  if (status) {
    query.status = String(status);
  }

  return query;
};

const buildBookingsFindQuery = (query, { skip = 0, limit = 200 } = {}) =>
  Booking.find(query).
  sort({ createdAt: -1 }).
  skip(skip).
  limit(limit).
  select(
    "bookingNumber sessionId userId customerContact seats totalAmount paymentMethod paymentStatus promotion bookedBy bookingSource status subscriptionTransaction printCount createdAt"
  ).
  populate({ path: "bookedBy", select: "firstName lastName email" }).
  populate({ path: "userId", select: "firstName lastName email" }).
  populate({
    path: "sessionId",
    select: "date sessionTime roomId eventId",
    populate: { path: "eventId", select: "name" }
  }).
  lean();

const listBookings = async ({
  page,
  limit,
  bookedBy,
  dateFrom,
  dateTo,
  paymentMethod,
  paymentStatus,
  bookingSource,
  status,
}) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit
  );

  const query = buildBookingsQuery({
    bookedBy,
    dateFrom,
    dateTo,
    paymentMethod,
    paymentStatus,
    bookingSource,
    status,
  });

  const [total, bookings] = await Promise.all([
  Booking.countDocuments(query),
  buildBookingsFindQuery(query, { skip, limit: safeLimit })]
  );

  return {
    items: bookings.map(serializeBooking),
    total,
    page: safePage,
    limit: safeLimit
  };
};

const listBookingsForExport = async ({
  bookedBy,
  dateFrom,
  dateTo,
  paymentMethod,
  paymentStatus,
  bookingSource,
  status,
} = {}) => {
  const query = buildBookingsQuery({
    bookedBy,
    dateFrom,
    dateTo,
    paymentMethod,
    paymentStatus,
    bookingSource,
    status,
  });
  const bookings = await buildBookingsFindQuery(query, { skip: 0, limit: 5000 });
  return bookings.map(serializeBooking);
};

const listBookingsForUser = async ({ userId, page, limit, dateFrom, dateTo }) => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  return listBookings({ page, limit, bookedBy: userId, dateFrom, dateTo });
};

const getBookingById = async ({ bookingId, requesterId, requesterRole }) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Invalid booking id");
    error.status = 400;
    throw error;
  }

  if (
  requesterRole !== "admin" &&
  requesterRole !== "super_admin" &&
  requesterRole !== "ticket_office")
  {
    const error = new Error("Accès guichet requis");
    error.status = 403;
    throw error;
  }

  const query = { _id: bookingId };
  if (requesterRole === "ticket_office") {
    if (!requesterId || !mongoose.isValidObjectId(requesterId)) {
      const error = new Error("Invalid user id");
      error.status = 401;
      throw error;
    }
    query.bookedBy = requesterId;
  }

  const booking = await Booking.findOne(query).
  select(
    "bookingNumber sessionId userId customerContact seats totalAmount paymentMethod paymentStatus promotion bookedBy bookingSource status subscriptionTransaction createdAt"
  ).
  populate({ path: "bookedBy", select: "firstName lastName email" }).
  populate({ path: "userId", select: "firstName lastName email" }).
  populate({
    path: "sessionId",
    select: "date sessionTime roomId eventId",
    populate: { path: "eventId", select: "name" }
  }).
  lean();

  if (!booking) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  const tickets = await Ticket.find({ bookingId: booking._id }).
  sort({ "seat.row": 1, "seat.col": 1, createdAt: 1 }).
  select(
    "code status isScanned seat pricingName price printCount qrCodeUrl scannedAt cancelledAt createdAt"
  ).
  lean();

  return {
    booking: {
      ...serializeBooking(booking),
      paymentFormUrl: booking.paymentFormUrl || null,
      ticketCount: tickets.length,
      tickets: tickets.map(serializeTicket)
    }
  };
};

const cancelBookingTickets = async ({
  bookingId,
  requesterId,
  requesterRole,
  ticketIds,
  io
}) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Invalid booking id");
    error.status = 400;
    throw error;
  }

  if (
  requesterRole !== "admin" &&
  requesterRole !== "super_admin" &&
  requesterRole !== "ticket_office")
  {
    const error = new Error("Accès guichet requis");
    error.status = 403;
    throw error;
  }

  const normalizedTicketIds = Array.from(
    new Set(
      (Array.isArray(ticketIds) ? ticketIds : []).
      map((value) => String(value || "").trim()).
      filter(Boolean)
    )
  );

  if (
  normalizedTicketIds.some((ticketId) => !mongoose.isValidObjectId(ticketId)))
  {
    const error = new Error("Ticket invalide.");
    error.status = 400;
    throw error;
  }

  const dbSession = await mongoose.startSession();
  let releasedSeats = [];
  let releasedSessionId = "";
  let cancellationResult = null;

  try {
    await dbSession.withTransaction(async () => {
      const bookingQuery = { _id: bookingId };

      if (requesterRole === "ticket_office") {
        if (!requesterId || !mongoose.isValidObjectId(requesterId)) {
          const error = new Error("Invalid user id");
          error.status = 401;
          throw error;
        }

        bookingQuery.bookedBy = requesterId;
      }

      const booking = await Booking.findOne(bookingQuery).session(dbSession);

      if (!booking) {
        const error = new Error("Booking not found");
        error.status = 404;
        throw error;
      }

      if (!ACTIVE_BOOKING_STATUSES.includes(String(booking.status || ""))) {
        const error = new Error("Ce booking ne peut plus être annulé.");
        error.status = 409;
        throw error;
      }

      const tickets = await Ticket.find({ bookingId: booking._id }).
      sort({ createdAt: 1, "seat.row": 1, "seat.col": 1 }).
      session(dbSession);

      const activeTickets = tickets.filter(isTicketActive);
      const scannedTickets = tickets.filter(isTicketScanned);
      const bookedTicketsBeforeCancellation = tickets.filter(
        (ticket) => !isTicketCancelled(ticket)
      );

      if (activeTickets.length === 0) {
        const error = new Error("Aucun billet annulable dans ce booking.");
        error.status = 409;
        throw error;
      }

      const requestedTickets =
      normalizedTicketIds.length > 0 ?
      tickets.filter((ticket) =>
      normalizedTicketIds.includes(String(ticket._id))
      ) :
      activeTickets;

      if (normalizedTicketIds.length > 0 && requestedTickets.length !== normalizedTicketIds.length) {
        const error = new Error("Certains billets sont introuvables.");
        error.status = 404;
        throw error;
      }

      const alreadyCancelled = requestedTickets.filter(isTicketCancelled);
      if (alreadyCancelled.length > 0) {
        const error = new Error("Certains billets sont déjà annulés.");
        error.status = 409;
        throw error;
      }

      const alreadyScanned = requestedTickets.filter(isTicketScanned);
      if (alreadyScanned.length > 0) {
        const error = new Error("Impossible d'annuler un billet déjà scanné.");
        error.status = 409;
        throw error;
      }

      const ticketsToCancel = requestedTickets.filter(isTicketActive);
      if (ticketsToCancel.length === 0) {
        const error = new Error("Aucun billet annulable sélectionné.");
        error.status = 409;
        throw error;
      }

      const now = new Date();
      const bookedGrossAmount = roundCurrency(
        bookedTicketsBeforeCancellation.reduce(
          (sum, ticket) => sum + roundCurrency(ticket.price),
          0
        )
      );
      const cancelledGrossAmount = roundCurrency(
        ticketsToCancel.reduce((sum, ticket) => sum + roundCurrency(ticket.price), 0)
      );
      const currentBookingTotal = roundCurrency(booking.totalAmount);

      let cancelledNetAmount = cancelledGrossAmount;
      if (String(booking.paymentMethod || "") === "subscription") {
        cancelledNetAmount = 0;
      } else if (bookedTicketsBeforeCancellation.length === ticketsToCancel.length) {
        cancelledNetAmount = currentBookingTotal;
      } else if (bookedGrossAmount > 0) {
        cancelledNetAmount = roundCurrency(
          currentBookingTotal * cancelledGrossAmount / bookedGrossAmount
        );
      } else {
        cancelledNetAmount = 0;
      }

      cancelledNetAmount = Math.min(cancelledNetAmount, currentBookingTotal);

      await Ticket.updateMany(
        {
          _id: { $in: ticketsToCancel.map((ticket) => ticket._id) }
        },
        {
          $set: {
            status: "cancelled",
            isScanned: false,
            scannedAt: null,
            scannedBy: null,
            cancelledAt: now,
            cancelledBy: requesterId || null
          }
        }
      ).session(dbSession);

      const remainingActiveTickets = activeTickets.filter(
        (ticket) =>
        !ticketsToCancel.some(
          (cancelledTicket) =>
          String(cancelledTicket._id) === String(ticket._id)
        )
      );
      const remainingBookedTickets = tickets.filter((ticket) => {
        const ticketId = String(ticket._id);
        const willBeCancelled = ticketsToCancel.some(
          (cancelledTicket) => String(cancelledTicket._id) === ticketId
        );
        return !willBeCancelled && !isTicketCancelled(ticket);
      });

      const nextSeats = sortSeats(
        remainingBookedTickets.map((ticket) => ({
          row: ticket.seat?.row,
          col: ticket.seat?.col
        }))
      );
      const nextTotalAmount =
      String(booking.paymentMethod || "") === "subscription" ?
      0 :
      roundCurrency(currentBookingTotal - cancelledNetAmount);
      let nextBookingStatus = "confirmed";
      let nextPaymentStatus = booking.paymentStatus;

      if (remainingActiveTickets.length === 0) {
        nextBookingStatus = scannedTickets.length > 0 ? "used" : "cancelled";
        if (scannedTickets.length === 0) {
          nextPaymentStatus = "refunded";
        }
      }

      const bookingUpdate = {
        seats: nextSeats,
        totalAmount: nextTotalAmount,
        status: nextBookingStatus,
        paymentStatus: nextPaymentStatus
      };

      if (booking.subscriptionTransaction) {
        const subscriptionTransaction =
        typeof booking.subscriptionTransaction.toObject === "function" ?
        booking.subscriptionTransaction.toObject() :
        { ...booking.subscriptionTransaction };

        bookingUpdate.subscriptionTransaction = {
          ...subscriptionTransaction,
          creditsUsed:
          String(booking.paymentMethod || "") === "subscription" ?
          remainingBookedTickets.length :
          subscriptionTransaction.creditsUsed
        };
      }

      await Booking.updateOne(
        { _id: booking._id },
        { $set: bookingUpdate }
      ).session(dbSession);

      await Session.updateOne(
        { _id: booking.sessionId },
        { $inc: { availableSeats: ticketsToCancel.length } }
      ).session(dbSession);

      const pricingDeltas = groupTicketCountsByPricing(ticketsToCancel).map((item) => ({
        ...item,
        quantity: -Math.abs(item.quantity)
      }));

      await applyPricingLimitDeltas({
        sessionId: booking.sessionId,
        pricingItems: pricingDeltas,
        dbSession
      });

      if (
      String(booking.paymentMethod || "") === "subscription" &&
      booking.subscriptionTransaction?.subscriptionSaleId)
      {
        const subscriptionSale = await SubscriptionSale.findById(
          booking.subscriptionTransaction.subscriptionSaleId
        ).session(dbSession);

        if (subscriptionSale) {
          const restoreCount = ticketsToCancel.length;
          const currentUsed = Number.isFinite(subscriptionSale.usedCredits) ?
          Number(subscriptionSale.usedCredits) :
          0;
          const currentRemaining = Number.isFinite(subscriptionSale.remainingCredits) ?
          Number(subscriptionSale.remainingCredits) :
          Math.max(
            Number(subscriptionSale.totalCredits || 0) - currentUsed,
            0
          );
          const totalCredits = Number.isFinite(subscriptionSale.totalCredits) ?
          Number(subscriptionSale.totalCredits) :
          currentUsed + currentRemaining;

          subscriptionSale.usedCredits = Math.max(currentUsed - restoreCount, 0);
          subscriptionSale.remainingCredits = Math.min(
            currentRemaining + restoreCount,
            totalCredits
          );
          await subscriptionSale.save({
            session: dbSession,
            validateBeforeSave: false
          });
        }
      }

      releasedSeats = ticketsToCancel.
      map((ticket) => ticket.seat).
      filter((seat) => seat && seat.row !== undefined && seat.col !== undefined);
      releasedSessionId = String(booking.sessionId);
      cancellationResult = {
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber || "",
        sessionId: booking.sessionId ? String(booking.sessionId) : "",
        cancelledTickets: ticketsToCancel.map((ticket) => ({
          _id: ticket._id,
          code: ticket.code || "",
          seat: ticket.seat || null,
          pricingName: ticket.pricingName || "",
          price: ticket.price,
          printCount: Number.isFinite(ticket.printCount) ? Number(ticket.printCount) : 0,
        })),
        cancelledTicketsCount: ticketsToCancel.length,
        cancelledGrossAmount,
        cancelledNetAmount,
        bookingStatus: nextBookingStatus,
        totalAmount: nextTotalAmount
      };
    });
  } finally {
    dbSession.endSession();
  }

  if (io && releasedSessionId && releasedSeats.length > 0) {
    io.to(`session-${releasedSessionId}`).emit("seats-released", {
      seats: releasedSeats,
      userId: String(requesterId || ""),
      reason: "booking-cancelled"
    });
  }

  if (!cancellationResult) {
    const error = new Error("Impossible d'annuler ce booking.");
    error.status = 500;
    throw error;
  }

  try {
    await auditLogService.recordTicketCancellation({
      actorId: requesterId,
      actorRole: requesterRole,
      bookingId: cancellationResult.bookingId,
      bookingNumber: cancellationResult.bookingNumber,
      sessionId: cancellationResult.sessionId,
      tickets: cancellationResult.cancelledTickets,
      result: cancellationResult,
    });
  } catch (error) {
    console.error(
      "[audit] ticket cancellation log failed",
      error?.message || error,
    );
  }

  return cancellationResult;
};

const createBooking = async ({ payload, userId, userRole, io }) => {
  const {
    sessionId,
    reservationId,
    pricingSelections: rawPricingSelections,
    customerId,
    customerContact,
    customer,
    bookingSource,
    subscriptionCode,
    promoCode
  } = payload || {};
  let pricingSelections = rawPricingSelections;
  const isTicketOfficeFlow =
  userRole === "ticket_office" ||
  userRole === "admin" ||
  userRole === "super_admin";
  const isCustomerFlow = userRole === "customer";
  const isGuestFlow = userRole === "guest";
  const enforcePricingLimits = !isTicketOfficeFlow;
  const requestedBookingSource = normalizeBookingSource(bookingSource);
  const requestedSubscriptionCode = normalizeSubscriptionCode(subscriptionCode);
  const promoCodeText = typeof promoCode === "string" ? promoCode.trim() : "";
  const requestedPromoCode = promoCodeService.normalizePromoCode(promoCode);

  if (promoCodeText && !requestedPromoCode) {
    const error = new Error("Code promo invalide.");
    error.status = 400;
    throw error;
  }

  if (!mongoose.isValidObjectId(sessionId)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }
  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  if (reservationId && !mongoose.isValidObjectId(reservationId)) {
    const error = new Error("Invalid reservation id");
    error.status = 400;
    throw error;
  }

  if (!isTicketOfficeFlow && !isCustomerFlow && !isGuestFlow) {
    const error = new Error("Access denied");
    error.status = 403;
    throw error;
  }

  const normalizedCustomerContact = normalizeCustomerContact(
    customerContact || customer
  );

  if (isGuestFlow) {
    const firstName = normalizedCustomerContact?.firstName || "";
    const lastName = normalizedCustomerContact?.lastName || "";
    const email = normalizedCustomerContact?.email || "";

    if (!firstName || !lastName || !isValidEmail(email)) {
      const error = new Error(
        "Le nom, le prénom et un email valide sont requis pour finaliser la réservation invitée."
      );
      error.status = 400;
      throw error;
    }
  }

  const dbSession = await mongoose.startSession();
  let booking = null;
  let bookedSeats = [];
  let remainingSubscriptionCredits = null;

  try {
    await dbSession.withTransaction(async () => {
      await assertVerifiedCustomer({
        userId,
        userRole,
        dbSession
      });

      const now = new Date();

      if (isGuestFlow && normalizedCustomerContact) {
        await guestService.updateGuestContact({
          guestId: userId,
          contact: normalizedCustomerContact,
          dbSession
        });
      }

      const session = await Session.findById(sessionId).
      select(
        "roomId overrides pricingOverrides eventId date sessionTime version pricingLimits"
      ).
      populate({ path: "pricingOverrides.pricingId", select: "name price" }).
      session(dbSession);

      if (!session) {
        const error = new Error("Session not found");
        error.status = 404;
        throw error;
      }

      const room = await resolveRoom(session.roomId);
      if (!room) {
        const error = new Error("Room not found");
        error.status = 404;
        throw error;
      }
      await room.populate({
        path: "pricingOverrides.pricingId",
        select: "name price"
      });

      const reservations = await SeatReservation.find({
        sessionId,
        userId,
        status: "pending",
        expiresAt: { $gt: now }
      }).
      sort({ updatedAt: -1, createdAt: -1 }).
      session(dbSession);

      if (!reservations.length) {
        const error = new Error("Réservation not found");
        error.status = 404;
        throw error;
      }

      if (reservationId) {
        const hasReservation = reservations.some(
          (reservation) => String(reservation._id) === String(reservationId)
        );
        if (!hasReservation) {
          const error = new Error("Réservation not found");
          error.status = 404;
          throw error;
        }
      }

      const mergedSeats = mergeUniqueSeats(
        reservations.flatMap((reservation) => reservation.seats || [])
      );

      if (!mergedSeats.length) {
        const error = new Error("No seats to book");
        error.status = 400;
        throw error;
      }

      validateSeatsAgainstLayout({ seats: mergedSeats, room, session });

      const seatOrFilters = buildSeatOrFilters(mergedSeats);
      const existingBookings = await Booking.find({
        sessionId,
        status: { $in: ["confirmed", "used"] },
        seats: { $elemMatch: { $or: seatOrFilters } }
      }).
      select("_id").
      session(dbSession);

      if (existingBookings.length > 0) {
        const error = new Error("Some seats are already booked");
        error.status = 409;
        throw error;
      }

      const pricingLimits = normalizePricingLimits(session);

      const sessionPricingOverrides = buildPricingOverrideMap(
        session.pricingOverrides
      );
      const roomPricingOverrides = buildPricingOverrideMap(
        room.pricingOverrides
      );

      const fixedSeats = [];
      const variableSeats = [];

      mergedSeats.forEach((seat) => {
        const key = seatKey(seat.row, seat.col);
        const overrideRaw =
        seat.pricingOverrideId ||
        sessionPricingOverrides.get(key) ||
        roomPricingOverrides.get(key) ||
        null;
        const meta = resolvePricingMeta(overrideRaw);
        if (meta) {
          fixedSeats.push({ seat, override: meta });
        } else {
          variableSeats.push(seat);
        }
      });

      const pricingById = new Map();
      const missingIds = fixedSeats.
      map((item) => item.override).
      filter((meta) => meta && meta.id && (!meta.name || meta.price === null)).
      map((meta) => meta.id);

      if (missingIds.length > 0) {
        const pricingDocs = await Pricing.find({
          _id: { $in: missingIds }
        }).
        select("name price").
        session(dbSession);
        pricingDocs.forEach((doc) => {
          pricingById.set(String(doc._id), {
            name: doc.name,
            price: doc.price
          });
        });
      }

      const fixedTicketItems = fixedSeats.map(({ seat, override }) => {
        const resolvedMeta = pricingById.get(override.id) || {};
        const pricingName = override.name || resolvedMeta.name;
        const price =
        override.price !== null && override.price !== undefined ?
        override.price :
        resolvedMeta.price;

        if (!pricingName || price === null || price === undefined) {
          const error = new Error("Tarif fixe invalide");
          error.status = 400;
          throw error;
        }

        return {
          seat: { row: seat.row, col: seat.col },
          pricingName,
          price
        };
      });

      // ── Subscription pre-validation & auto-selections ──────────────────────
      // When paying with a subscription code, build selections server-side
      // instead of trusting the client-sent pricingSelections.
      let subscriptionSalePreload = null;
      if (requestedSubscriptionCode) {
        const preloadQuery = {
          subscriptionCode: requestedSubscriptionCode,
          status: "confirmed",
          paymentStatus: "completed"
        };
        if (isCustomerFlow) {
          const preloadBookingCustomerId = isCustomerFlow ? userId : null;
          if (preloadBookingCustomerId) {
            preloadQuery.userId = preloadBookingCustomerId;
          }
        }
        subscriptionSalePreload = await SubscriptionSale.findOne(preloadQuery)
          .populate({
            path: "subscriptionId",
            select: "isActive expirationDate allowedSeatType maxSeatsPerSession"
          })
          .session(dbSession);

        if (!subscriptionSalePreload) {
          const error = new Error("Code abonnement invalide.");
          error.status = 404;
          throw error;
        }

        const subDef = subscriptionSalePreload.subscriptionId &&
          typeof subscriptionSalePreload.subscriptionId === "object"
          ? subscriptionSalePreload.subscriptionId
          : null;

        const allowedSeatType = subDef?.allowedSeatType ||
          subscriptionSalePreload.allowedSeatType ||
          "normale";
        const maxSeatsPerSession = Number.isFinite(
          Number(subDef?.maxSeatsPerSession ?? subscriptionSalePreload.maxSeatsPerSession)
        )
          ? Number(subDef?.maxSeatsPerSession ?? subscriptionSalePreload.maxSeatsPerSession)
          : 1;

        // 1. Validate seat count limit
        if (mergedSeats.length > maxSeatsPerSession) {
          const error = new Error(
            `Cet abonnement est limité à ${maxSeatsPerSession} siège${maxSeatsPerSession > 1 ? "s" : ""} par séance.`
          );
          error.status = 409;
          throw error;
        }

        // 2. Validate seat type compatibility
        // VIP (tarif_fixe) sub: can book ALL seat types
        // Normal sub: cannot book fixed/VIP seats
        if (allowedSeatType === "normale" && fixedSeats.length > 0) {
          const error = new Error(
            "Cet abonnement ne permet pas de réserver des sièges VIP ou à tarif fixe."
          );
          error.status = 409;
          throw error;
        }

        // 3. Auto-build pricingSelections for variable seats
        // Fixed seats always carry their own pricing via fixedTicketItems (no selection needed).
        // For variable seats we must provide a valid tarif from pricingLimits.
        if (variableSeats.length > 0) {
          const firstPricing = Array.from(pricingLimits.byKey.values())[0];
          if (!firstPricing) {
            const error = new Error("Aucun tarif disponible pour cette séance.");
            error.status = 400;
            throw error;
          }
          pricingSelections = [{
            pricingId: firstPricing.id || undefined,
            name: firstPricing.name,
            price: firstPricing.price,
            quantity: variableSeats.length
          }];
        } else {
          // All seats are fixed-price: no variable selections needed
          pricingSelections = [];
        }
      }

      const normalizedSelections = normalizePricingSelections({
        selections: pricingSelections,
        pricingLimits
      });

      const assignableSeatsCount = Math.max(
        mergedSeats.length - fixedTicketItems.length,
        0
      );
      const assignedCount = normalizedSelections.reduce(
        (sum, selection) => sum + selection.quantity,
        0
      );

      if (assignedCount !== assignableSeatsCount) {
        const error = new Error(
          `Ticket quantities mismatch (expected ${assignableSeatsCount}, received ${assignedCount})`
        );
        error.status = 400;
        throw error;
      }

      const pricingTotals = new Map();
      fixedTicketItems.forEach((item) => {
        const key = buildPricingKey(item.pricingName, item.price);
        pricingTotals.set(key, (pricingTotals.get(key) || 0) + 1);
      });

      normalizedSelections.forEach((selection) => {
        const key = buildPricingKey(selection.name, selection.price);
        pricingTotals.set(
          key,
          (pricingTotals.get(key) || 0) + selection.quantity
        );
      });

      if (enforcePricingLimits) {
        pricingLimits.byKey.forEach((limit, key) => {
          if (limit.maxTickets === null || limit.maxTickets === undefined) {
            return;
          }
          const totalRequested = pricingTotals.get(key) || 0;
          if (limit.soldCount + totalRequested > limit.maxTickets) {
            const error = new Error("Pricing limit reached");
            error.status = 409;
            throw error;
          }
        });
      }

      const variableSeatsSorted = sortSeats(variableSeats);
      const assignments = [];
      normalizedSelections.forEach((selection) => {
        for (let i = 0; i < selection.quantity; i += 1) {
          assignments.push({
            pricingName: selection.name,
            price: selection.price
          });
        }
      });

      if (assignments.length !== variableSeatsSorted.length) {
        const error = new Error("Unable to assign all seats");
        error.status = 400;
        throw error;
      }

      const variableTicketItems = variableSeatsSorted.map((seat, index) => {
        const assignment = assignments[index];
        return {
          seat: { row: seat.row, col: seat.col },
          pricingName: assignment.pricingName,
          price: assignment.price
        };
      });

      const ticketItems = [...fixedTicketItems, ...variableTicketItems];
      const totalAmount = ticketItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0),
        0
      );

      let bookingCustomerId = isCustomerFlow ?
      userId :
      isGuestFlow ?
      userId :
      customerId && mongoose.isValidObjectId(customerId) ?
      customerId :
      null;

      let resolvedTotalAmount = totalAmount;
      let resolvedPaymentMethod = isTicketOfficeFlow ? "cash" : "online";
      let resolvedPromotion = undefined;
      let resolvedSubscriptionTransaction = undefined;

      if (requestedPromoCode) {
        if (requestedSubscriptionCode) {
          const error = new Error(
            "Le code promo n'est pas applicable avec un paiement abonnement."
          );
          error.status = 409;
          throw error;
        }

        if (!isTicketOfficeFlow && resolvedPaymentMethod !== "online") {
          const error = new Error(
            "Le code promo est applicable uniquement pour les paiements en ligne."
          );
          error.status = 409;
          throw error;
        }

        const promoValidation = await promoCodeService.validatePromoCodeForCheckout({
          promoCode: requestedPromoCode,
          subtotalAmount: totalAmount,
          userId: bookingCustomerId || userId,
          userRole,
          customerContact: normalizedCustomerContact,
          dbSession
        });

        const amountBeforeDiscount = Number.isFinite(
          Number(promoValidation?.pricing?.amountBeforeDiscount)
        ) ?
        Number(promoValidation.pricing.amountBeforeDiscount) :
        totalAmount;
        const discountAmount = Number.isFinite(
          Number(promoValidation?.pricing?.discountAmount)
        ) ?
        Number(promoValidation.pricing.discountAmount) :
        0;
        const amountAfterDiscount = Number.isFinite(
          Number(promoValidation?.pricing?.amountAfterDiscount)
        ) ?
        Number(promoValidation.pricing.amountAfterDiscount) :
        Math.max(amountBeforeDiscount - discountAmount, 0);

        resolvedTotalAmount = amountAfterDiscount;
        resolvedPromotion = {
          code: promoValidation?.promo?.code || requestedPromoCode,
          reductionType: promoValidation?.promo?.reductionType || "",
          reductionValue: promoValidation?.promo?.reductionValue,
          discountAmount,
          amountBeforeDiscount
        };
      }

      if (requestedSubscriptionCode) {
        if (!isCustomerFlow && !isTicketOfficeFlow) {
          const error = new Error(
            "L'utilisation d'un abonnement necessite un compte client connecte."
          );
          error.status = 403;
          throw error;
        }

        const subscriptionSaleQuery = {
          subscriptionCode: requestedSubscriptionCode,
          status: "confirmed",
          paymentStatus: "completed"
        };
        if (isCustomerFlow) {
          subscriptionSaleQuery.userId = bookingCustomerId;
        }

        const subscriptionSale = subscriptionSalePreload ||
          await SubscriptionSale.findOne(subscriptionSaleQuery)
            .populate({
              path: "subscriptionId",
              select: "isActive expirationDate allowedSeatType maxSeatsPerSession"
            })
            .session(dbSession);

        if (!subscriptionSale) {
          const error = new Error("Code abonnement invalide.");
          error.status = 404;
          throw error;
        }

        const linkedSubscription =
        subscriptionSale.subscriptionId &&
        typeof subscriptionSale.subscriptionId === "object" ?
        subscriptionSale.subscriptionId :
        null;
        const subscriptionOwnerId = subscriptionSale.userId ?
        String(subscriptionSale.userId) :
        "";

        if (isTicketOfficeFlow && !subscriptionOwnerId) {
          const error = new Error("Abonnement invalide.");
          error.status = 409;
          throw error;
        }

        if (isTicketOfficeFlow && bookingCustomerId) {
          if (String(bookingCustomerId) !== subscriptionOwnerId) {
            const error = new Error(
              "Le client sélectionné ne correspond pas au code abonnement."
            );
            error.status = 409;
            throw error;
          }
        }

        if (linkedSubscription) {
          if (linkedSubscription.isActive === false) {
            const error = new Error("Cet abonnement n'est plus actif.");
            error.status = 409;
            throw error;
          }

          if (
          linkedSubscription.expirationDate &&
          new Date(linkedSubscription.expirationDate).getTime() < now.getTime())
          {
            const error = new Error("Cet abonnement est expiré.");
            error.status = 409;
            throw error;
          }

          if (
          subscriptionSale.expiresAt &&
          new Date(subscriptionSale.expiresAt).getTime() < now.getTime())
          {
            const error = new Error("Votre abonnement a expiré.");
            error.status = 409;
            throw error;
          }
        }

        const hasPersistedRemaining = Number.isFinite(subscriptionSale.remainingCredits);
        const currentRemaining = hasPersistedRemaining ?
        Number(subscriptionSale.remainingCredits) :
        Math.max(
          Number(subscriptionSale.totalCredits || 0) -
          Number(subscriptionSale.usedCredits || 0),
          0
        );
        const currentUsed = Number.isFinite(subscriptionSale.usedCredits) ?
        Number(subscriptionSale.usedCredits) :
        0;
        const creditsNeeded = mergedSeats.length;

        if (currentRemaining < creditsNeeded) {
          const error = new Error("Credits abonnement insuffisants.");
          error.status = 409;
          throw error;
        }

        // Check: subscription already used for this specific session
        const existingBookingForSession = await Booking.findOne({
          sessionId,
          "subscriptionTransaction.subscriptionSaleId": subscriptionSale._id,
          status: { $in: ["confirmed", "used"] }
        })
          .select("_id")
          .session(dbSession);

        if (existingBookingForSession) {
          const error = new Error(
            "Cet abonnement a déjà été utilisé pour cette séance."
          );
          error.status = 409;
          throw error;
        }

        // maxSeatsPerSession and seatType already validated in the pre-check above.
        // Skip duplicate validation here to avoid double-counting.

        if (!hasPersistedRemaining) {
          await SubscriptionSale.updateOne(
            { _id: subscriptionSale._id },
            {
              $set: {
                remainingCredits: currentRemaining,
                usedCredits: currentUsed
              }
            }
          ).session(dbSession);
        }

        const updated = await SubscriptionSale.updateOne(
          {
            _id: subscriptionSale._id,
            remainingCredits: { $gte: creditsNeeded }
          },
          {
            $inc: { usedCredits: creditsNeeded, remainingCredits: -creditsNeeded },
            $set: { lastUsedAt: now }
          }
        ).session(dbSession);

        if (!updated || updated.modifiedCount !== 1) {
          const error = new Error(
            "Impossible d'utiliser cet abonnement. Merci de réessayer."
          );
          error.status = 409;
          throw error;
        }

        resolvedPaymentMethod = "subscription";
        resolvedTotalAmount = 0;
        resolvedPromotion = undefined;
        if (isTicketOfficeFlow && !bookingCustomerId) {
          bookingCustomerId = subscriptionSale.userId;
        }
        resolvedSubscriptionTransaction = {
          subscriptionId: linkedSubscription?._id || subscriptionSale.subscriptionId,
          subscriptionSaleId: subscriptionSale._id,
          subscriptionCode: subscriptionSale.subscriptionCode || requestedSubscriptionCode,
          creditsUsed: creditsNeeded
        };
        remainingSubscriptionCredits = Math.max(
          currentRemaining - creditsNeeded,
          0
        );
      }

      const resolvedBookingSource = isTicketOfficeFlow ?
      "ticket_office" :
      requestedBookingSource || "web";

      let finalStatus = "confirmed";
      let finalPaymentStatus = "completed";
      let formUrl = null;
      let paymentDetails = undefined;

      const bookingDoc = new Booking({
        sessionId,
        userId: bookingCustomerId,
        customerContact:
          isGuestFlow && normalizedCustomerContact
            ? normalizedCustomerContact
            : undefined,
        seats: mergedSeats.map((seat) => ({
          row: seat.row,
          col: seat.col,
        })),
        ticketItems,
        totalAmount: resolvedTotalAmount,
        paymentMethod: resolvedPaymentMethod,
        promotion: resolvedPromotion,
        bookedBy: userId,
        bookingSource: resolvedBookingSource,
        subscriptionTransaction: resolvedSubscriptionTransaction,
      });
      bookingDoc.$session(dbSession);

      // Si le paiement est en ligne, on demande l'URL de paiement à ClicToPay
      if (resolvedPaymentMethod === "online" && resolvedTotalAmount > 0) {
        finalStatus = "pending";
        finalPaymentStatus = "pending";
        
        // Générer le bookingNumber via la validation
        await bookingDoc.validate();

        const returnUrl = process.env.FRONTEND_URL 
          ? `${process.env.FRONTEND_URL}/payment-verify` 
          : "http://localhost:3000/payment-verify";

        const paymentRes = await registerPayment({
          amount: resolvedTotalAmount,
          orderNumber: bookingDoc.bookingNumber,
          returnUrl,
          failUrl: returnUrl,
        });

        paymentDetails = {
          transactionId: paymentRes.orderId,
          gateway: "ipay",
        };
        formUrl = paymentRes.formUrl;
        
        // IMPORTANT: Pour un paiement en ligne, on ne supprime PAS les SeatLock / SeatReservation
        // On met à jour l'expiration de la SeatReservation pour donner 20 min au client
        const expirationTime = new Date(Date.now() + 20 * 60000);
        await SeatReservation.updateMany(
          { sessionId, userId, status: "pending" },
          { $set: { expiresAt: expirationTime } }
        ).session(dbSession);
      } else {
        // Flux normal (cash, abo, ou ticket gratuit)
        await SeatLock.deleteMany({
          sessionId,
          reservedBy: userId,
        }).session(dbSession);

        await SeatReservation.deleteMany({
          sessionId,
          userId,
          status: "pending",
        }).session(dbSession);
      }

      bookingDoc.status = finalStatus;
      bookingDoc.paymentStatus = finalPaymentStatus;
      if (paymentDetails) {
        bookingDoc.paymentDetails = paymentDetails;
      }

      await bookingDoc.save();
      booking = bookingDoc;
      bookedSeats = booking.seats || [];
      
      // On attache formUrl à l'objet booking pour que le retour API puisse le renvoyer
      if (formUrl) {
        booking.paymentFormUrl = formUrl;
      }
    });
  } finally {
    dbSession.endSession();
  }

  if (io && bookedSeats.length > 0) {
    io.to(`session-${sessionId}`).emit("seats-booked", {
      seats: bookedSeats,
      userId: String(userId)
    });
  }

  if (!booking) {
    const error = new Error("Unable to create booking");
    error.status = 500;
    throw error;
  }

  if (booking.status === "confirmed") {
    try {
      enqueueBookingTicketEmail({ bookingId: booking._id });
    } catch (error) {
      console.error(
        "[ticket-email] unable to enqueue email delivery",
        error && error.stack ? error.stack : error
      );
    }
  }

  return {
    paymentFormUrl: booking.paymentFormUrl || null,
    booking: {
      id: booking._id,
      bookingNumber: booking.bookingNumber,
      totalAmount: booking.totalAmount,
      seats: booking.seats,
      ticketCount: booking.seats ? booking.seats.length : 0,
      createdAt: booking.createdAt,
      paymentMethod: booking.paymentMethod,
      promotion: booking.promotion || null,
      subscriptionTransaction:
      booking.subscriptionTransaction &&
      typeof booking.subscriptionTransaction === "object" ?
      {
        ...(typeof booking.subscriptionTransaction.toObject === "function" ?
        booking.subscriptionTransaction.toObject() :
        booking.subscriptionTransaction),
        remainingCredits: remainingSubscriptionCredits
      } :
      null
    }
  };
};

const incrementPrintCount = async (bookingId) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new Error("Invalid booking id");
  }

  const booking = await Booking.findByIdAndUpdate(
    bookingId,
    { $inc: { printCount: 1 } },
    { new: true }
  );

  if (!booking) {
    throw new Error("Booking not found");
  }

  await Ticket.updateMany(
    { bookingId: booking._id, status: { $ne: "cancelled" } },
    { $inc: { printCount: 1 } },
  );

  await auditLogService.log({
    action: "BOOKING_PRINTED",
    targetType: "booking",
    targetId: bookingId,
    metadata: { printCount: booking.printCount }
  });

  return { ok: true, printCount: booking.printCount };
};

const logPrintCancelled = async (bookingId) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new Error("Invalid booking id");
  }

  await auditLogService.log({
    action: "BOOKING_PRINT_CANCELLED",
    targetType: "booking",
    targetId: bookingId
  });

  return { ok: true };
};

module.exports = {
  cancelBookingTickets,
  createBooking,
  getBookingById,
  listBookings,
  listBookingsForExport,
  listBookingsForUser,
  incrementPrintCount,
  logPrintCancelled
};
