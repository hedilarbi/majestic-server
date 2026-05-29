const mongoose = require("mongoose");

const Ticket = require("../models/Ticket");
const Booking = require("../models/Booking");
const Session = require("../models/Session");

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

const serializeSessionDetails = (session) => {
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
    status: session.status || "",
    event: event ?
    {
      id: event._id ? String(event._id) : null,
      name: event.name || ""
    } :
    null
  };
};

const serializeScanTicket = (ticket) => ({
  id: ticket._id ? String(ticket._id) : null,
  code: ticket.code || "",
  seat: ticket.seat || null,
  pricingName: ticket.pricingName || "",
  price: ticket.price,
  status: resolveTicketStatus(ticket),
  isScanned: resolveTicketStatus(ticket) === "scanned",
  scannedAt: ticket.scannedAt || null,
  cancelledAt: ticket.cancelledAt || null
});

const listTickets = async ({ page, limit }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit
  );

  const query = {};
  const [total, tickets] = await Promise.all([
  Ticket.countDocuments(query),
  Ticket.find(query).
  sort({ createdAt: -1 }).
  skip(skip).
  limit(safeLimit).
  select(
    "code status isScanned seat pricingName price cancelledAt scannedAt bookingId sessionId userId createdAt"
  ).
  populate({ path: "bookingId", select: "bookingNumber" }).
  populate({
    path: "sessionId",
    select: "date sessionTime roomId eventId",
    populate: { path: "eventId", select: "name" }
  }).
  populate({ path: "userId", select: "firstName lastName email" }).
  lean()]
  );

  const items = tickets.map((ticket) => ({
    id: ticket._id ? String(ticket._id) : null,
    code: ticket.code,
    status: resolveTicketStatus(ticket),
    isScanned: resolveTicketStatus(ticket) === "scanned",
    seat: ticket.seat || null,
    pricingName: ticket.pricingName,
    price: ticket.price,
    booking: ticket.bookingId ?
    {
      id: ticket.bookingId._id ?
      String(ticket.bookingId._id) :
      null,
      bookingNumber: ticket.bookingId.bookingNumber || ""
    } :
    null,
    session: serializeSession(ticket.sessionId),
    user: serializeUser(ticket.userId),
    scannedAt: ticket.scannedAt || null,
    cancelledAt: ticket.cancelledAt || null,
    createdAt: ticket.createdAt || null
  }));

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit
  };
};

const scanTicket = async ({ userId, userRole, payload }) => {
  if (!userId) {
    const error = new Error("Utilisateur non authentifié.");
    error.status = 401;
    throw error;
  }

  if (userRole !== "door_staff") {
    const error = new Error("Accès door_staff requis.");
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
    payload?.qrText || payload?.qrPayload || payload?.code || ""
  );

  const expectedSession = await Session.findById(expectedSessionId).
  select("eventId date sessionTime roomId status").
  populate({ path: "eventId", select: "name" }).
  lean();

  if (!expectedSession) {
    const error = new Error("Session introuvable.");
    error.status = 404;
    throw error;
  }

  if (qrSessionId && String(qrSessionId) !== String(expectedSessionId)) {
    const error = new Error("Ce ticket appartient a une autre séance.");
    error.status = 409;
    error.code = "WRONG_SESSION";
    throw error;
  }

  const ticket = await Ticket.findOne({ code: ticketCode }).
  populate({ path: "bookingId", select: "bookingNumber status paymentStatus" }).
  lean();

  if (!ticket) {
    const error = new Error("Ticket introuvable.");
    error.status = 404;
    error.code = "TICKET_NOT_FOUND";
    throw error;
  }

  if (String(ticket.sessionId) !== String(expectedSessionId)) {
    const error = new Error("Ce ticket appartient a une autre séance.");
    error.status = 409;
    error.code = "WRONG_SESSION";
    throw error;
  }

  const ticketStatus = resolveTicketStatus(ticket);

  if (ticketStatus === "cancelled") {
    const error = new Error("Ticket annulé.");
    error.status = 409;
    error.code = "CANCELLED_TICKET";
    error.details = {
      ticket: serializeScanTicket(ticket)
    };
    throw error;
  }

  const scanType = (payload?.type || payload?.scanType || "entry").trim().toLowerCase();
  const isExit = scanType === "exit";

  // Check current presence for logic
  const currentPresence = ticket.currentPresence || (ticketStatus === "scanned" ? "in" : "out");

  if (isExit) {
    if (currentPresence === "out") {
      const error = new Error("Le client est déjà sorti ou n'est pas encore entré.");
      error.status = 409;
      error.code = "ALREADY_OUT";
      error.details = { ticket: serializeScanTicket(ticket) };
      throw error;
    }
  } else {
    // Entry logic
    if (currentPresence === "in") {
      const error = new Error("Le client est déjà à l'intérieur.");
      error.status = 409;
      error.code = "ALREADY_IN";
      error.details = { ticket: serializeScanTicket(ticket) };
      throw error;
    }
  }

  const booking =
  ticket.bookingId && typeof ticket.bookingId === "object" ?
  ticket.bookingId :
  null;
  if (!booking || !["confirmed", "used"].includes(String(booking.status || ""))) {
    const error = new Error("Ticket invalide: réservation non confirmée.");
    error.status = 409;
    error.code = "BOOKING_NOT_CONFIRMED";
    throw error;
  }

  if (booking.paymentStatus !== "completed") {
    const error = new Error("Ticket invalide: paiement non finalisé.");
    error.status = 409;
    error.code = "PAYMENT_NOT_COMPLETED";
    throw error;
  }

  const now = new Date();
  const updateData = {
    $set: {
      currentPresence: isExit ? "out" : "in",
    },
    $push: {
      scanHistory: {
        type: isExit ? "exit" : "entry",
        scannedAt: now,
        scannedBy: userId
      }
    }
  };

  // If first entry
  if (!isExit && !ticket.isScanned) {
    updateData.$set.isScanned = true;
    updateData.$set.status = "scanned";
    updateData.$set.scannedAt = now;
    updateData.$set.scannedBy = userId;
  }

  const scannedTicket = await Ticket.findOneAndUpdate(
    { _id: ticket._id, status: { $ne: "cancelled" } },
    updateData,
    { new: true }
  ).lean();

  if (!scannedTicket) {
    const error = new Error("Une erreur est survenue lors du scan.");
    error.status = 500;
    throw error;
  }

  const remainingTickets = await Ticket.countDocuments({
    bookingId: ticket.bookingId && ticket.bookingId._id ?
    ticket.bookingId._id :
    ticket.bookingId,
    status: { $nin: ["cancelled", "scanned"] },
    isScanned: false
  });

  if (!isExit && remainingTickets === 0) {
    const bookingIdValue =
    ticket.bookingId && ticket.bookingId._id ? ticket.bookingId._id : ticket.bookingId;
    if (bookingIdValue) {
      await Booking.updateOne(
        { _id: bookingIdValue, status: "confirmed" },
        { $set: { status: "used" } }
      );
    }
  }

  // Get current presence count for the session
  const presenceCount = await Ticket.countDocuments({
    sessionId: expectedSessionId,
    currentPresence: "in"
  });

  return {
    status: "accepted",
    message: isExit ? "Sortie validée." : "Entrée validée.",
    ticket: {
      ...serializeScanTicket(scannedTicket),
      currentPresence: scannedTicket.currentPresence
    },
    booking: {
      bookingNumber: booking.bookingNumber || "",
      status: remainingTickets === 0 ? "used" : booking.status || "confirmed",
      paymentStatus: booking.paymentStatus || ""
    },
    session: {
      ...serializeSessionDetails(expectedSession),
      presenceCount
    },
    remainingTicketsInBooking: remainingTickets
  };
};

const TarifCorrection = require("../models/TarifCorrection");

// ─────────────────────────────────────────────────────────────
// Recherche d'un billet par code (TK-...) ou numéro de booking
// ─────────────────────────────────────────────────────────────
const searchTicket = async ({ q }) => {
  const raw = typeof q === "string" ? q.trim().toUpperCase() : "";

  if (!raw) {
    const error = new Error("Code ou numéro de réservation requis.");
    error.status = 400;
    throw error;
  }

  let ticket = null;

  if (raw.startsWith("TK-")) {
    ticket = await Ticket.findOne({ code: raw })
      .populate({ path: "bookingId", select: "bookingNumber totalAmount paymentMethod status paymentStatus" })
      .populate({
        path: "sessionId",
        select: "date sessionTime pricingLimits eventId roomId",
        populate: { path: "eventId", select: "name poster" },
      })
      .populate({ path: "userId", select: "firstName lastName email" })
      .lean();
  } else if (raw.startsWith("BK-")) {
    const booking = await Booking.findOne({ bookingNumber: raw })
      .select("_id bookingNumber totalAmount paymentMethod status paymentStatus")
      .lean();

    if (booking) {
      const tickets = await Ticket.find({ bookingId: booking._id, status: { $ne: "cancelled" } })
        .populate({
          path: "sessionId",
          select: "date sessionTime pricingLimits eventId roomId",
          populate: { path: "eventId", select: "name poster" },
        })
        .populate({ path: "userId", select: "firstName lastName email" })
        .lean();

      // Return first active ticket if multiple; the UI can list them
      if (tickets.length > 0) {
        tickets[0].bookingId = booking;
        ticket = tickets[0];
        ticket._allTickets = tickets.map((t) => ({
          id: String(t._id),
          code: t.code,
          seat: t.seat,
          pricingName: t.pricingName,
          price: t.price,
          status: resolveTicketStatus(t),
        }));
      }
    }
  }

  if (!ticket) {
    const error = new Error("Aucun billet trouvé pour ce code.");
    error.status = 404;
    throw error;
  }

  const booking = ticket.bookingId && typeof ticket.bookingId === "object" ? ticket.bookingId : null;
  const session = ticket.sessionId && typeof ticket.sessionId === "object" ? ticket.sessionId : null;
  const event = session?.eventId && typeof session.eventId === "object" ? session.eventId : null;

  const availablePricings = Array.isArray(session?.pricingLimits)
    ? session.pricingLimits
        .filter((p) => Number(p.price) > 0)
        .map((p) => ({ name: p.name, price: Number(p.price) }))
    : [];

  return {
    id: String(ticket._id),
    code: ticket.code,
    status: resolveTicketStatus(ticket),
    seat: ticket.seat,
    pricingName: ticket.pricingName,
    price: ticket.price,
    allTickets: ticket._allTickets || null,
    booking: booking
      ? {
          id: String(booking._id),
          bookingNumber: booking.bookingNumber,
          totalAmount: booking.totalAmount,
          paymentMethod: booking.paymentMethod,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
        }
      : null,
    session: session
      ? {
          id: String(session._id),
          date: session.date,
          sessionTime: session.sessionTime,
          eventName: event?.name || "",
          availablePricings,
        }
      : null,
    user: serializeUser(ticket.userId),
  };
};

// ─────────────────────────────────────────────────────────────
// Modification de tarif + enregistrement caisse
// ─────────────────────────────────────────────────────────────
const repriceTicket = async ({ ticketId, newPricingName, paymentMethod = "cash", actorId }) => {
  if (!mongoose.isValidObjectId(ticketId)) {
    const error = new Error("Identifiant de billet invalide.");
    error.status = 400;
    throw error;
  }
  if (!actorId || !mongoose.isValidObjectId(actorId)) {
    const error = new Error("Utilisateur non authentifié.");
    error.status = 401;
    throw error;
  }
  if (!newPricingName || typeof newPricingName !== "string") {
    const error = new Error("Nouveau tarif requis.");
    error.status = 400;
    throw error;
  }

  const ticket = await Ticket.findById(ticketId)
    .populate({ path: "bookingId", select: "totalAmount paymentMethod status paymentStatus" })
    .populate({
      path: "sessionId",
      select: "date sessionTime pricingLimits eventId",
      populate: { path: "eventId", select: "name" },
    })
    .lean();

  if (!ticket) {
    const error = new Error("Billet introuvable.");
    error.status = 404;
    throw error;
  }

  const ticketStatus = resolveTicketStatus(ticket);
  if (ticketStatus !== "active") {
    const error = new Error(`Ce billet ne peut pas être modifié (statut : ${ticketStatus}).`);
    error.status = 409;
    throw error;
  }

  // Trouver le nouveau tarif dans les pricingLimits de la séance
  const session = ticket.sessionId && typeof ticket.sessionId === "object" ? ticket.sessionId : null;
  const pricingLimits = Array.isArray(session?.pricingLimits) ? session.pricingLimits : [];
  const targetPricing = pricingLimits.find(
    (p) => p.name.trim().toLowerCase() === newPricingName.trim().toLowerCase()
  );

  if (!targetPricing) {
    const error = new Error(`Tarif "${newPricingName}" introuvable pour cette séance.`);
    error.status = 404;
    throw error;
  }

  const oldPrice = Number(ticket.price);
  const newPrice = Number(targetPricing.price);
  const priceDiff = Math.round((newPrice - oldPrice) * 100) / 100;

  if (priceDiff < 0) {
    const error = new Error(
      `Le nouveau tarif (${newPrice} DT) est inférieur au tarif actuel (${oldPrice} DT). Le remboursement n'est pas autorisé au guichet.`
    );
    error.status = 400;
    throw error;
  }

  const oldPricingName = ticket.pricingName;

  // Mettre à jour le ticket
  await Ticket.updateOne(
    { _id: ticketId },
    { $set: { pricingName: newPricingName.trim(), price: newPrice } }
  );

  // Mettre à jour le montant total du booking
  const booking = ticket.bookingId && typeof ticket.bookingId === "object" ? ticket.bookingId : null;
  if (booking && booking._id) {
    const newTotal = Math.round(((Number(booking.totalAmount) || 0) + priceDiff) * 100) / 100;
    await Booking.updateOne({ _id: booking._id }, { $set: { totalAmount: Math.max(newTotal, 0) } });
  }

  // Enregistrer la correction si différence de prix > 0
  let correction = null;
  if (priceDiff > 0) {
    correction = await TarifCorrection.create({
      ticketId,
      bookingId: booking?._id || ticket.bookingId,
      sessionId: ticket.sessionId?._id || ticket.sessionId,
      ticketOfficeId: actorId,
      seat: ticket.seat,
      oldPricingName,
      oldPrice,
      newPricingName: newPricingName.trim(),
      newPrice,
      priceDifference: priceDiff,
      paymentMethod,
    });
  }

  const updatedTicket = await Ticket.findById(ticketId).lean();

  return {
    ticket: {
      id: String(updatedTicket._id),
      code: updatedTicket.code,
      seat: updatedTicket.seat,
      pricingName: updatedTicket.pricingName,
      price: updatedTicket.price,
      status: resolveTicketStatus(updatedTicket),
    },
    correction: correction
      ? {
          id: String(correction._id),
          oldPricingName,
          oldPrice,
          newPricingName: correction.newPricingName,
          newPrice: correction.newPrice,
          priceDifference: correction.priceDifference,
          paymentMethod: correction.paymentMethod,
        }
      : null,
    priceDifference: priceDiff,
    cashRecorded: priceDiff > 0,
  };
};

module.exports = {
  listTickets,
  scanTicket,
  searchTicket,
  repriceTicket,
};