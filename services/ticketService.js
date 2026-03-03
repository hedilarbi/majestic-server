const mongoose = require("mongoose");

const Ticket = require("../models/Ticket");
const Booking = require("../models/Booking");
const Session = require("../models/Session");

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
  };
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
        }
      : null,
  };
};

const normalizeScanText = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const parseQrPayload = (scanText) => {
  const raw = normalizeScanText(scanText);
  if (!raw) {
    const error = new Error("Code QR invalide.");
    error.status = 400;
    throw error;
  }

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const ticketCode =
        typeof parsed?.ticketCode === "string" ? parsed.ticketCode.trim() : "";
      const sessionId =
        typeof parsed?.sessionId === "string" ? parsed.sessionId.trim() : "";

      if (!ticketCode) {
        const error = new Error("Code ticket manquant dans le QR.");
        error.status = 400;
        throw error;
      }

      return { ticketCode, qrSessionId: sessionId || null, raw };
    } catch (error) {
      if (error && error.status) {
        throw error;
      }
      const parsingError = new Error("QR non reconnu.");
      parsingError.status = 400;
      throw parsingError;
    }
  }

  return { ticketCode: raw, qrSessionId: null, raw };
};

const serializeSessionDetails = (session) => {
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
    status: session.status || "",
    event: event
      ? {
          id: event._id ? String(event._id) : null,
          name: event.name || "",
        }
      : null,
  };
};

const serializeScanTicket = (ticket) => ({
  id: ticket._id ? String(ticket._id) : null,
  code: ticket.code || "",
  seat: ticket.seat || null,
  pricingName: ticket.pricingName || "",
  price: ticket.price,
  isScanned: Boolean(ticket.isScanned),
  scannedAt: ticket.scannedAt || null,
});

const listTickets = async ({ page, limit }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = {};
  const [total, tickets] = await Promise.all([
    Ticket.countDocuments(query),
    Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({ path: "bookingId", select: "bookingNumber" })
      .populate({
        path: "sessionId",
        select: "date sessionTime roomId eventId",
        populate: { path: "eventId", select: "name" },
      })
      .populate({ path: "userId", select: "firstName lastName email" })
      .lean(),
  ]);

  const items = tickets.map((ticket) => ({
    id: ticket._id ? String(ticket._id) : null,
    code: ticket.code,
    isScanned:
      typeof ticket.isScanned === "boolean"
        ? ticket.isScanned
        : String(ticket.status || "").toLowerCase() === "scanned",
    seat: ticket.seat || null,
    pricingName: ticket.pricingName,
    price: ticket.price,
    booking: ticket.bookingId
      ? {
          id: ticket.bookingId._id
            ? String(ticket.bookingId._id)
            : null,
          bookingNumber: ticket.bookingId.bookingNumber || "",
        }
      : null,
    session: serializeSession(ticket.sessionId),
    user: serializeUser(ticket.userId),
    scannedAt: ticket.scannedAt || null,
    createdAt: ticket.createdAt || null,
  }));

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const scanTicket = async ({ userId, userRole, payload }) => {
  if (!userId) {
    const error = new Error("Utilisateur non authentifie.");
    error.status = 401;
    throw error;
  }

  if (userRole !== "door_staff" && userRole !== "admin") {
    const error = new Error("Acces portier requis.");
    error.status = 403;
    throw error;
  }

  const expectedSessionId =
    typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!expectedSessionId || !mongoose.isValidObjectId(expectedSessionId)) {
    const error = new Error("Session de scan invalide.");
    error.status = 400;
    throw error;
  }

  const { ticketCode, qrSessionId } = parseQrPayload(
    payload?.qrText || payload?.qrPayload || payload?.code || "",
  );

  const expectedSession = await Session.findById(expectedSessionId)
    .select("eventId date sessionTime roomId status")
    .populate({ path: "eventId", select: "name" })
    .lean();

  if (!expectedSession) {
    const error = new Error("Session introuvable.");
    error.status = 404;
    throw error;
  }

  if (qrSessionId && String(qrSessionId) !== String(expectedSessionId)) {
    const error = new Error("Ce billet n'appartient pas a la session selectionnee.");
    error.status = 409;
    error.code = "WRONG_SESSION";
    throw error;
  }

  const ticket = await Ticket.findOne({ code: ticketCode })
    .populate({ path: "bookingId", select: "bookingNumber status paymentStatus" })
    .lean();

  if (!ticket) {
    const error = new Error("Ticket introuvable.");
    error.status = 404;
    error.code = "TICKET_NOT_FOUND";
    throw error;
  }

  if (String(ticket.sessionId) !== String(expectedSessionId)) {
    const error = new Error("Ce billet n'appartient pas a cette session.");
    error.status = 409;
    error.code = "WRONG_SESSION";
    throw error;
  }

  if (ticket.isScanned) {
    const error = new Error("Ticket deja scanne.");
    error.status = 409;
    error.code = "ALREADY_SCANNED";
    error.details = {
      ticket: serializeScanTicket(ticket),
    };
    throw error;
  }

  const booking =
    ticket.bookingId && typeof ticket.bookingId === "object"
      ? ticket.bookingId
      : null;
  if (!booking || !["confirmed", "used"].includes(String(booking.status || ""))) {
    const error = new Error("Ticket invalide: reservation non confirmee.");
    error.status = 409;
    error.code = "BOOKING_NOT_CONFIRMED";
    throw error;
  }

  if (booking.paymentStatus !== "completed") {
    const error = new Error("Ticket invalide: paiement non finalise.");
    error.status = 409;
    error.code = "PAYMENT_NOT_COMPLETED";
    throw error;
  }

  const now = new Date();
  const scannedTicket = await Ticket.findOneAndUpdate(
    { _id: ticket._id, isScanned: false },
    { $set: { isScanned: true, scannedAt: now, scannedBy: userId } },
    { new: true },
  ).lean();

  if (!scannedTicket) {
    const alreadyScannedTicket = await Ticket.findById(ticket._id)
      .select("code seat pricingName price isScanned scannedAt")
      .lean();
    const error = new Error("Ticket deja scanne.");
    error.status = 409;
    error.code = "ALREADY_SCANNED";
    error.details = {
      ticket: serializeScanTicket(alreadyScannedTicket || ticket),
    };
    throw error;
  }

  const remainingTickets = await Ticket.countDocuments({
    bookingId: ticket.bookingId && ticket.bookingId._id
      ? ticket.bookingId._id
      : ticket.bookingId,
    isScanned: false,
  });

  if (remainingTickets === 0) {
    const bookingIdValue =
      ticket.bookingId && ticket.bookingId._id ? ticket.bookingId._id : ticket.bookingId;
    if (bookingIdValue) {
      await Booking.updateOne(
        { _id: bookingIdValue, status: "confirmed" },
        { $set: { status: "used" } },
      );
    }
  }

  return {
    status: "accepted",
    message: "Ticket valide. Acces autorise.",
    ticket: serializeScanTicket(scannedTicket),
    booking: {
      bookingNumber: booking.bookingNumber || "",
      status: remainingTickets === 0 ? "used" : booking.status || "confirmed",
      paymentStatus: booking.paymentStatus || "",
    },
    session: serializeSessionDetails(expectedSession),
    remainingTicketsInBooking: remainingTickets,
  };
};

module.exports = {
  listTickets,
  scanTicket,
};
