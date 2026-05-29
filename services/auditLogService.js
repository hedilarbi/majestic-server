const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const Session = require("../models/Session");
const User = require("../models/User");
const { hasDashboardPermission } = require("../config/dashboardPermissions");

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const resolvePage = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveLimit = (value, fallback = 50, max = 200) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const parseDateFilter = (value, label) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  return parsed;
};

const buildDateRange = ({ dateFrom, dateTo } = {}) => {
  const from = parseDateFilter(dateFrom, "dateFrom");
  const to = parseDateFilter(dateTo, "dateTo");

  if (!from && !to) {
    return null;
  }

  if (from && to && from > to) {
    const error = new Error("dateFrom doit être antérieure à dateTo");
    error.status = 400;
    throw error;
  }

  const range = {};
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
};

const formatPrice = (value) => {
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
};

const buildSeatLabel = (ticket) => {
  const row = ticket?.seat?.row;
  const col = ticket?.seat?.col;
  if (row === undefined || row === null || col === undefined || col === null) {
    return "";
  }
  return `${row}${col}`;
};

const buildPricingBreakdown = (tickets = []) => {
  const groups = new Map();

  tickets.forEach((ticket) => {
    const name = normalizeText(ticket?.pricingName) || "Tarif";
    const unitPrice = formatPrice(ticket?.price);
    const key = `${name}::${unitPrice}`;
    const current = groups.get(key) || {
      name,
      quantity: 0,
      unitPrice,
    };
    current.quantity += 1;
    groups.set(key, current);
  });

  return Array.from(groups.values());
};

const resolveActorSnapshot = async ({ actorId, actorRole }) => {
  const normalizedRole = normalizeText(actorRole);

  if (!actorId || !mongoose.isValidObjectId(actorId)) {
    return {
      name: "",
      email: "",
      role: normalizedRole,
    };
  }

  const actor = await User.findById(actorId)
    .select("firstName lastName email role")
    .lean();

  if (!actor) {
    return {
      name: "",
      email: "",
      role: normalizedRole,
    };
  }

  const name = [actor.firstName, actor.lastName]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  return {
    name,
    email: normalizeText(actor.email).toLowerCase(),
    role: normalizeText(actor.role) || normalizedRole,
  };
};

const resolveSessionSnapshot = async (sessionId) => {
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
    return {
      sessionId: null,
      eventName: "",
      sessionDate: null,
      sessionTime: "",
    };
  }

  const session = await Session.findById(sessionId)
    .select("date sessionTime eventId")
    .populate({ path: "eventId", select: "name" })
    .lean();

  if (!session) {
    return {
      sessionId: String(sessionId),
      eventName: "",
      sessionDate: null,
      sessionTime: "",
    };
  }

  const event =
    session.eventId && typeof session.eventId === "object" ? session.eventId : null;

  return {
    sessionId: String(session._id),
    eventName: normalizeText(event?.name),
    sessionDate: session.date || null,
    sessionTime: normalizeText(session.sessionTime),
  };
};

const normalizeActionType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return ["ticket_cancellation", "ticket_print", "ticket_print_cancelled"].includes(normalized)
    ? normalized
    : "";
};

const serializeAuditLog = (item) => ({
  id: item._id ? String(item._id) : null,
  actionType: item.actionType || "",
  createdAt: item.createdAt || null,
  actor: {
    id: item.actorId ? String(item.actorId) : null,
    name: item.actorSnapshot?.name || "",
    email: item.actorSnapshot?.email || "",
    role: item.actorSnapshot?.role || "",
  },
  booking: {
    id: item.bookingId ? String(item.bookingId) : null,
    bookingNumber: item.bookingNumber || "",
  },
  session: {
    id: item.sessionId ? String(item.sessionId) : null,
    eventName: item.eventName || "",
    date: item.sessionDate || null,
    sessionTime: item.sessionTime || "",
  },
  ticketsCount: Number.isFinite(item.ticketsCount) ? Number(item.ticketsCount) : 0,
  ticketCodes: Array.isArray(item.ticketCodes) ? item.ticketCodes : [],
  seatLabels: Array.isArray(item.seatLabels) ? item.seatLabels : [],
  pricingBreakdown: Array.isArray(item.pricingBreakdown) ? item.pricingBreakdown : [],
  details: item.details && typeof item.details === "object" ? item.details : {},
});

const createAuditLog = async ({
  actionType,
  actorId,
  actorRole,
  bookingId,
  bookingNumber,
  sessionId,
  tickets,
  details,
}) => {
  const [actorSnapshot, sessionSnapshot] = await Promise.all([
    resolveActorSnapshot({ actorId, actorRole }),
    resolveSessionSnapshot(sessionId),
  ]);

  const safeTickets = Array.isArray(tickets) ? tickets.filter(Boolean) : [];

  return AuditLog.create({
    actionType,
    actorId: actorId && mongoose.isValidObjectId(actorId) ? actorId : null,
    actorSnapshot,
    bookingId: bookingId && mongoose.isValidObjectId(bookingId) ? bookingId : null,
    sessionId:
      sessionSnapshot.sessionId && mongoose.isValidObjectId(sessionSnapshot.sessionId)
        ? sessionSnapshot.sessionId
        : sessionId && mongoose.isValidObjectId(sessionId)
          ? sessionId
          : null,
    bookingNumber: normalizeText(bookingNumber),
    eventName: sessionSnapshot.eventName,
    sessionDate: sessionSnapshot.sessionDate,
    sessionTime: sessionSnapshot.sessionTime,
    ticketsCount: safeTickets.length,
    ticketIds: safeTickets
      .map((ticket) => ticket?._id)
      .filter((ticketId) => ticketId && mongoose.isValidObjectId(ticketId)),
    ticketCodes: safeTickets
      .map((ticket) => normalizeText(ticket?.code))
      .filter(Boolean),
    seatLabels: safeTickets.map(buildSeatLabel).filter(Boolean),
    pricingBreakdown: buildPricingBreakdown(safeTickets),
    details: details && typeof details === "object" ? details : {},
  });
};

const recordTicketCancellation = async ({
  actorId,
  actorRole,
  bookingId,
  bookingNumber,
  sessionId,
  tickets,
  result,
}) => {
  return createAuditLog({
    actionType: "ticket_cancellation",
    actorId,
    actorRole,
    bookingId,
    bookingNumber,
    sessionId,
    tickets,
    details: {
      cancelledTicketsCount: Number(result?.cancelledTicketsCount || 0),
      cancelledGrossAmount: formatPrice(result?.cancelledGrossAmount),
      cancelledNetAmount: formatPrice(result?.cancelledNetAmount),
      bookingStatus: normalizeText(result?.bookingStatus),
      totalAmount: formatPrice(result?.totalAmount),
    },
  });
};

const recordTicketPrint = async ({ bookingId, actorId, actorRole }) => {
  if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Booking invalide.");
    error.status = 400;
    throw error;
  }

  const normalizedRole = normalizeText(actorRole);
  if (!["ticket_office", "admin", "super_admin"].includes(normalizedRole)) {
    const error = new Error("Accès refusé.");
    error.status = 403;
    throw error;
  }

  const bookingQuery = { _id: bookingId };
  if (normalizedRole === "ticket_office") {
    if (!actorId || !mongoose.isValidObjectId(actorId)) {
      const error = new Error("Utilisateur invalide.");
      error.status = 401;
      throw error;
    }

    bookingQuery.bookedBy = actorId;
  }

  const booking = await Booking.findOne(bookingQuery)
    .select("bookingNumber sessionId bookedBy")
    .lean();

  if (!booking) {
    const error = new Error("Booking introuvable.");
    error.status = 404;
    throw error;
  }

  const tickets = await Ticket.find({
    bookingId: booking._id,
    status: { $ne: "cancelled" },
  })
    .sort({ createdAt: 1, "seat.row": 1, "seat.col": 1 })
    .select("code seat pricingName price")
    .lean();

  if (!tickets.length) {
    const error = new Error("Aucun billet à imprimer.");
    error.status = 409;
    throw error;
  }

  await Booking.updateOne(
    { _id: booking._id },
    { $inc: { printCount: 1 } },
  );

  return createAuditLog({
    actionType: "ticket_print",
    actorId,
    actorRole: normalizedRole,
    bookingId: booking._id,
    bookingNumber: booking.bookingNumber || "",
    sessionId: booking.sessionId,
    tickets,
    details: {
      printedTicketsCount: tickets.length,
      printCount: (booking.printCount || 0) + 1,
    },
  });
};

const recordTicketPrintCancelled = async ({ bookingId, actorId, actorRole }) => {
  if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Booking invalide.");
    error.status = 400;
    throw error;
  }

  const normalizedRole = normalizeText(actorRole);
  if (!["ticket_office", "admin", "super_admin"].includes(normalizedRole)) {
    const error = new Error("Accès refusé.");
    error.status = 403;
    throw error;
  }

  const booking = await Booking.findById(bookingId)
    .select("bookingNumber sessionId printCount")
    .lean();

  if (!booking) {
    const error = new Error("Booking introuvable.");
    error.status = 404;
    throw error;
  }

  return createAuditLog({
    actionType: "ticket_print_cancelled",
    actorId,
    actorRole: normalizedRole,
    bookingId: booking._id,
    bookingNumber: booking.bookingNumber || "",
    sessionId: booking.sessionId,
    tickets: [],
    details: {
      printCount: booking.printCount || 0,
    },
  });
};

const listAuditLogs = async ({ page, limit, type, dateFrom, dateTo, requester }) => {
  if (!requester || !hasDashboardPermission(requester, "audit_logs", "list")) {
    const error = new Error("Permission insuffisante");
    error.status = 403;
    throw error;
  }

  const safePage = resolvePage(page, 1);
  const safeLimit = resolveLimit(limit, 50, 200);
  const skip = (safePage - 1) * safeLimit;

  const query = {};
  const actionType = normalizeActionType(type);
  if (actionType) {
    query.actionType = actionType;
  }

  const createdAtRange = buildDateRange({ dateFrom, dateTo });
  if (createdAtRange) {
    query.createdAt = createdAtRange;
  }

  const [total, items] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
  ]);

  return {
    items: items.map(serializeAuditLog),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

module.exports = {
  listAuditLogs,
  recordTicketCancellation,
  recordTicketPrint,
  recordTicketPrintCancelled,
};
