const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const SeatLock = require("../models/SeatLock");
const SeatReservation = require("../models/SeatReservation");
const Session = require("../models/Session");
const Pricing = require("../models/Pricing");
const SubscriptionSale = require("../models/SubscriptionSale");
const promoCodeService = require("./promoCodeService");
const { enqueueBookingTicketEmail } = require("./ticketDeliveryService");
const { seatKey } = require("../utils/seatKey");
const {
  resolveRoom,
  buildPricingOverrideMap,
  validateSeatsAgainstLayout,
  buildSeatOrFilters,
} = require("../utils/seatHelpers");

const mergeUniqueSeats = (seats = []) => {
  const byKey = new Map();

  seats.forEach((seat) => {
    if (!seat || seat.row === undefined || seat.col === undefined) {
      return;
    }

    const key = seatKey(seat.row, seat.col);
    const existing = byKey.get(key);
    const pricingOverrideId =
      seat.pricingOverrideId ??
      (existing ? existing.pricingOverrideId : null);

    byKey.set(key, {
      row: String(seat.row),
      col: Number(seat.col),
      pricingOverrideId,
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
    email,
  };
};

const isValidEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const normalizeBookingSource = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "mobile" || normalized === "web") {
    return normalized;
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

const buildPricingKey = (name, price) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedPrice = Number(price);
  return `${normalizedName}|${Number.isFinite(normalizedPrice) ? normalizedPrice : ""}`;
};

const normalizePricingLimits = (session) => {
  const limits = Array.isArray(session?.pricingLimits)
    ? session.pricingLimits
    : [];
  const byId = new Map();
  const byKey = new Map();

  limits.forEach((limit) => {
    if (!limit) {
      return;
    }

    const pricingSource =
      limit.pricingId && typeof limit.pricingId === "object"
        ? limit.pricingId
        : null;

    const id = pricingSource?._id ??
      (typeof limit.pricingId === "string" ? limit.pricingId : null);
    const name = pricingSource?.name || limit.name;
    const price = normalizePrice(pricingSource?.price ?? limit.price);

    if (!name || price === null) {
      return;
    }

    const entry = {
      id: id ? String(id) : null,
      name,
      price,
      maxTickets: Number.isFinite(limit.maxTickets)
        ? Number(limit.maxTickets)
        : null,
      soldCount: Number.isFinite(limit.soldCount)
        ? Number(limit.soldCount)
        : 0,
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
      10,
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
      quantity: 0,
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
      price,
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
    email,
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
  createdAt: booking.createdAt || null,
  bookedBy: serializeUser(booking.bookedBy),
  customer: serializeUser(booking.userId),
  customerContact: serializeCustomerContact(booking.customerContact),
  session: serializeSession(booking.sessionId),
  promotion:
    booking.promotion && typeof booking.promotion === "object"
      ? {
          code: booking.promotion.code || "",
          reductionType: booking.promotion.reductionType || "",
          reductionValue: Number.isFinite(booking.promotion.reductionValue)
            ? Number(booking.promotion.reductionValue)
            : null,
          discountAmount: Number.isFinite(booking.promotion.discountAmount)
            ? Number(booking.promotion.discountAmount)
            : 0,
          amountBeforeDiscount: Number.isFinite(
            booking.promotion.amountBeforeDiscount,
          )
            ? Number(booking.promotion.amountBeforeDiscount)
            : null,
        }
      : null,
  subscriptionTransaction:
    booking.subscriptionTransaction &&
    typeof booking.subscriptionTransaction === "object"
      ? {
          subscriptionId: booking.subscriptionTransaction.subscriptionId
            ? String(booking.subscriptionTransaction.subscriptionId)
            : null,
          subscriptionSaleId: booking.subscriptionTransaction.subscriptionSaleId
            ? String(booking.subscriptionTransaction.subscriptionSaleId)
            : null,
          subscriptionCode: booking.subscriptionTransaction.subscriptionCode || "",
          creditsUsed: Number.isFinite(booking.subscriptionTransaction.creditsUsed)
            ? Number(booking.subscriptionTransaction.creditsUsed)
            : 0,
        }
      : null,
});

const serializeTicket = (ticket) => ({
  id: ticket._id ? String(ticket._id) : null,
  code: ticket.code || "",
  isScanned:
    typeof ticket.isScanned === "boolean"
      ? ticket.isScanned
      : String(ticket.status || "").toLowerCase() === "scanned",
  seat: ticket.seat || null,
  pricingName: ticket.pricingName || "",
  price: ticket.price,
  qrCodeUrl: ticket.qrCodeUrl || null,
  scannedAt: ticket.scannedAt || null,
  createdAt: ticket.createdAt || null,
});

const listBookings = async ({ page, limit, bookedBy }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(
    page,
    limit,
  );

  const query = {};
  if (bookedBy) {
    if (!mongoose.isValidObjectId(bookedBy)) {
      const error = new Error("Invalid bookedBy id");
      error.status = 400;
      throw error;
    }
    query.bookedBy = bookedBy;
  }

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(query),
    Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "bookingNumber sessionId userId customerContact seats totalAmount paymentMethod paymentStatus promotion bookedBy bookingSource status subscriptionTransaction createdAt",
      )
      .populate({ path: "bookedBy", select: "firstName lastName email" })
      .populate({ path: "userId", select: "firstName lastName email" })
      .populate({
        path: "sessionId",
        select: "date sessionTime roomId eventId",
        populate: { path: "eventId", select: "name" },
      })
      .lean(),
  ]);

  return {
    items: bookings.map(serializeBooking),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const listBookingsForUser = async ({ userId, page, limit }) => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  return listBookings({ page, limit, bookedBy: userId });
};

const getBookingById = async ({ bookingId, requesterId, requesterRole }) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Invalid booking id");
    error.status = 400;
    throw error;
  }

  if (requesterRole !== "admin" && requesterRole !== "ticket_office") {
    const error = new Error("Acces guichet requis");
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

  const booking = await Booking.findOne(query)
    .select(
      "bookingNumber sessionId userId customerContact seats totalAmount paymentMethod paymentStatus promotion bookedBy bookingSource status subscriptionTransaction createdAt",
    )
    .populate({ path: "bookedBy", select: "firstName lastName email" })
    .populate({ path: "userId", select: "firstName lastName email" })
    .populate({
      path: "sessionId",
      select: "date sessionTime roomId eventId",
      populate: { path: "eventId", select: "name" },
    })
    .lean();

  if (!booking) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  const tickets = await Ticket.find({ bookingId: booking._id })
    .sort({ "seat.row": 1, "seat.col": 1, createdAt: 1 })
    .select("code isScanned seat pricingName price qrCodeUrl scannedAt createdAt")
    .lean();

  return {
    booking: {
      ...serializeBooking(booking),
      ticketCount: tickets.length,
      tickets: tickets.map(serializeTicket),
    },
  };
};

const createBooking = async ({ payload, userId, userRole, io }) => {
  const {
    sessionId,
    reservationId,
    pricingSelections,
    customerId,
    customerContact,
    customer,
    bookingSource,
    subscriptionCode,
    promoCode,
  } = payload || {};
  const isTicketOfficeFlow =
    userRole === "ticket_office" || userRole === "admin";
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
    customerContact || customer,
  );

  if (isGuestFlow) {
    const firstName = normalizedCustomerContact?.firstName || "";
    const lastName = normalizedCustomerContact?.lastName || "";
    const email = normalizedCustomerContact?.email || "";

    if (!firstName || !lastName || !isValidEmail(email)) {
      const error = new Error(
        "Le nom, le prenom et un email valide sont requis pour finaliser la reservation invite.",
      );
      error.status = 400;
      throw error;
    }
  }

  const dbSession = await mongoose.startSession();
  let booking = null;
  let bookedSeats = [];

  try {
    await dbSession.withTransaction(async () => {
      const now = new Date();
      const session = await Session.findById(sessionId)
        .select(
          "roomId overrides pricingOverrides eventId date sessionTime version pricingLimits",
        )
        .populate({ path: "pricingOverrides.pricingId", select: "name price" })
        .session(dbSession);

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
        select: "name price",
      });

      const reservations = await SeatReservation.find({
        sessionId,
        userId,
        status: "pending",
        expiresAt: { $gt: now },
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .session(dbSession);

      if (!reservations.length) {
        const error = new Error("Reservation not found");
        error.status = 404;
        throw error;
      }

      if (reservationId) {
        const hasReservation = reservations.some(
          (reservation) => String(reservation._id) === String(reservationId),
        );
        if (!hasReservation) {
          const error = new Error("Reservation not found");
          error.status = 404;
          throw error;
        }
      }

      const mergedSeats = mergeUniqueSeats(
        reservations.flatMap((reservation) => reservation.seats || []),
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
        seats: { $elemMatch: { $or: seatOrFilters } },
      })
        .select("_id")
        .session(dbSession);

      if (existingBookings.length > 0) {
        const error = new Error("Some seats are already booked");
        error.status = 409;
        throw error;
      }

      const pricingLimits = normalizePricingLimits(session);

      const sessionPricingOverrides = buildPricingOverrideMap(
        session.pricingOverrides,
      );
      const roomPricingOverrides = buildPricingOverrideMap(
        room.pricingOverrides,
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
      const missingIds = fixedSeats
        .map((item) => item.override)
        .filter((meta) => meta && meta.id && (!meta.name || meta.price === null))
        .map((meta) => meta.id);

      if (missingIds.length > 0) {
        const pricingDocs = await Pricing.find({
          _id: { $in: missingIds },
        })
          .select("name price")
          .session(dbSession);
        pricingDocs.forEach((doc) => {
          pricingById.set(String(doc._id), {
            name: doc.name,
            price: doc.price,
          });
        });
      }

      const fixedTicketItems = fixedSeats.map(({ seat, override }) => {
        const resolvedMeta = pricingById.get(override.id) || {};
        const pricingName = override.name || resolvedMeta.name;
        const price =
          override.price !== null && override.price !== undefined
            ? override.price
            : resolvedMeta.price;

        if (!pricingName || price === null || price === undefined) {
          const error = new Error("Tarif fixe invalide");
          error.status = 400;
          throw error;
        }

        return {
          seat: { row: seat.row, col: seat.col },
          pricingName,
          price,
        };
      });

      const normalizedSelections = normalizePricingSelections({
        selections: pricingSelections,
        pricingLimits,
      });

      const assignableSeatsCount = Math.max(
        mergedSeats.length - fixedTicketItems.length,
        0,
      );
      const assignedCount = normalizedSelections.reduce(
        (sum, selection) => sum + selection.quantity,
        0,
      );

      if (assignedCount !== assignableSeatsCount) {
        const error = new Error(
          `Ticket quantities mismatch (expected ${assignableSeatsCount}, received ${assignedCount})`,
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
          (pricingTotals.get(key) || 0) + selection.quantity,
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
            price: selection.price,
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
          price: assignment.price,
        };
      });

      const ticketItems = [...fixedTicketItems, ...variableTicketItems];
      const totalAmount = ticketItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0),
        0,
      );

      let bookingCustomerId = isCustomerFlow
        ? userId
        : isGuestFlow
          ? null
          : customerId && mongoose.isValidObjectId(customerId)
            ? customerId
            : null;

      let resolvedTotalAmount = totalAmount;
      let resolvedPaymentMethod = isTicketOfficeFlow ? "cash" : "online";
      let resolvedPromotion = undefined;
      let resolvedSubscriptionTransaction = undefined;

      if (requestedPromoCode) {
        if (requestedSubscriptionCode) {
          const error = new Error(
            "Le code promo n'est pas applicable avec un paiement abonnement.",
          );
          error.status = 409;
          throw error;
        }

        if (isTicketOfficeFlow) {
          resolvedPaymentMethod = "online";
        }

        if (resolvedPaymentMethod !== "online") {
          const error = new Error(
            "Le code promo est applicable uniquement pour les paiements en ligne.",
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
          dbSession,
        });

        const amountBeforeDiscount = Number.isFinite(
          Number(promoValidation?.pricing?.amountBeforeDiscount),
        )
          ? Number(promoValidation.pricing.amountBeforeDiscount)
          : totalAmount;
        const discountAmount = Number.isFinite(
          Number(promoValidation?.pricing?.discountAmount),
        )
          ? Number(promoValidation.pricing.discountAmount)
          : 0;
        const amountAfterDiscount = Number.isFinite(
          Number(promoValidation?.pricing?.amountAfterDiscount),
        )
          ? Number(promoValidation.pricing.amountAfterDiscount)
          : Math.max(amountBeforeDiscount - discountAmount, 0);

        resolvedTotalAmount = amountAfterDiscount;
        resolvedPromotion = {
          code: promoValidation?.promo?.code || requestedPromoCode,
          reductionType: promoValidation?.promo?.reductionType || "",
          reductionValue: promoValidation?.promo?.reductionValue,
          discountAmount,
          amountBeforeDiscount,
        };
      }

      if (requestedSubscriptionCode) {
        if (!isCustomerFlow && !isTicketOfficeFlow) {
          const error = new Error(
            "L'utilisation d'un abonnement necessite un compte client connecte.",
          );
          error.status = 403;
          throw error;
        }

        const subscriptionSaleQuery = {
          subscriptionCode: requestedSubscriptionCode,
          status: "confirmed",
          paymentStatus: "completed",
        };
        if (isCustomerFlow) {
          subscriptionSaleQuery.userId = bookingCustomerId;
        }

        const subscriptionSale = await SubscriptionSale.findOne(subscriptionSaleQuery)
          .populate({
            path: "subscriptionId",
            select: "isActive expirationDate",
          })
          .session(dbSession);

        if (!subscriptionSale) {
          const error = new Error("Code abonnement invalide.");
          error.status = 404;
          throw error;
        }

        const linkedSubscription =
          subscriptionSale.subscriptionId &&
          typeof subscriptionSale.subscriptionId === "object"
            ? subscriptionSale.subscriptionId
            : null;
        const subscriptionOwnerId = subscriptionSale.userId
          ? String(subscriptionSale.userId)
          : "";

        if (isTicketOfficeFlow && !subscriptionOwnerId) {
          const error = new Error("Abonnement invalide.");
          error.status = 409;
          throw error;
        }

        if (isTicketOfficeFlow && bookingCustomerId) {
          if (String(bookingCustomerId) !== subscriptionOwnerId) {
            const error = new Error(
              "Le client selectionne ne correspond pas au code abonnement.",
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
            new Date(linkedSubscription.expirationDate).getTime() < now.getTime()
          ) {
            const error = new Error("Cet abonnement est expire.");
            error.status = 409;
            throw error;
          }
        }

        const hasPersistedRemaining = Number.isFinite(subscriptionSale.remainingCredits);
        const currentRemaining = hasPersistedRemaining
          ? Number(subscriptionSale.remainingCredits)
          : Math.max(
              Number(subscriptionSale.totalCredits || 0) -
                Number(subscriptionSale.usedCredits || 0),
              0,
            );
        const currentUsed = Number.isFinite(subscriptionSale.usedCredits)
          ? Number(subscriptionSale.usedCredits)
          : 0;
        const creditsNeeded = mergedSeats.length;

        if (currentRemaining < creditsNeeded) {
          const error = new Error("Credits abonnement insuffisants.");
          error.status = 409;
          throw error;
        }

        if (!hasPersistedRemaining) {
          await SubscriptionSale.updateOne(
            { _id: subscriptionSale._id },
            {
              $set: {
                remainingCredits: currentRemaining,
                usedCredits: currentUsed,
              },
            },
          ).session(dbSession);
        }

        const updated = await SubscriptionSale.updateOne(
          {
            _id: subscriptionSale._id,
            remainingCredits: { $gte: creditsNeeded },
          },
          {
            $inc: { usedCredits: creditsNeeded, remainingCredits: -creditsNeeded },
            $set: { lastUsedAt: now },
          },
        ).session(dbSession);

        if (!updated || updated.modifiedCount !== 1) {
          const error = new Error(
            "Impossible d'utiliser cet abonnement. Merci de reessayer.",
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
          creditsUsed: creditsNeeded,
        };
      }

      const resolvedBookingSource = isTicketOfficeFlow
        ? "ticket_office"
        : requestedBookingSource || "web";

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
        paymentStatus: "completed",
        promotion: resolvedPromotion,
        bookedBy: userId,
        bookingSource: resolvedBookingSource,
        subscriptionTransaction: resolvedSubscriptionTransaction,
        status: "confirmed",
      });
      bookingDoc.$session(dbSession);
      await bookingDoc.save();
      booking = bookingDoc;
      bookedSeats = booking.seats || [];

      await SeatLock.deleteMany({
        sessionId,
        reservedBy: userId,
      }).session(dbSession);

      await SeatReservation.deleteMany({
        sessionId,
        userId,
        status: "pending",
      }).session(dbSession);
    });
  } finally {
    dbSession.endSession();
  }

  if (io && bookedSeats.length > 0) {
    io.to(`session-${sessionId}`).emit("seats-booked", {
      seats: bookedSeats,
      userId: String(userId),
    });
  }

  if (!booking) {
    const error = new Error("Unable to create booking");
    error.status = 500;
    throw error;
  }

  try {
    enqueueBookingTicketEmail({ bookingId: booking._id });
  } catch (error) {
    console.error(
      "[ticket-email] unable to enqueue email delivery",
      error && error.stack ? error.stack : error,
    );
  }

  return {
    booking: {
      id: booking._id,
      bookingNumber: booking.bookingNumber,
      totalAmount: booking.totalAmount,
      seats: booking.seats,
      ticketCount: booking.seats ? booking.seats.length : 0,
      createdAt: booking.createdAt,
      paymentMethod: booking.paymentMethod,
      promotion: booking.promotion || null,
      subscriptionTransaction: booking.subscriptionTransaction || null,
    },
  };
};

module.exports = {
  createBooking,
  getBookingById,
  listBookings,
  listBookingsForUser,
};
