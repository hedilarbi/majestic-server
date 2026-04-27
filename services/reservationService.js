const mongoose = require("mongoose");

const SeatLock = require("../models/SeatLock");
const SeatReservation = require("../models/SeatReservation");
const Session = require("../models/Session");
const Booking = require("../models/Booking");
const { seatKey } = require("../utils/seatKey");
const {
  resolveRoom,
  buildPricingOverrideMap,
  normalizeSeats,
  validateSeatsAgainstLayout,
  buildSeatOrFilters
} = require("../utils/seatHelpers");

const HOLD_DURATION_MS = 60 * 1000;
const ALLOWED_ACTIONS = new Set(["reserve", "release"]);

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

const applyActionOnSeats = ({ currentSeats, targetSeats, action }) => {
  const byKey = new Map(
    currentSeats.map((seat) => [seatKey(seat.row, seat.col), seat])
  );

  if (action === "release") {
    targetSeats.forEach((seat) => {
      byKey.delete(seatKey(seat.row, seat.col));
    });
  } else {
    targetSeats.forEach((seat) => {
      byKey.set(seatKey(seat.row, seat.col), seat);
    });
  }

  return Array.from(byKey.values());
};

const buildReservationPayload = (reservation) => {
  if (!reservation) {
    return null;
  }

  return {
    reservationId: String(reservation._id),
    expiresAt: reservation.expiresAt,
    seats: reservation.seats || []
  };
};

const resolveReservationSeatsWithOverrides = ({
  seats = [],
  sessionPricingOverrides,
  roomPricingOverrides
}) => {
  if (!seats.length) {
    return [];
  }

  return seats.map((seat) => {
    const key = seatKey(seat.row, seat.col);
    const pricingOverrideId =
    seat.pricingOverrideId ??
    sessionPricingOverrides.get(key) ??
    roomPricingOverrides.get(key) ??
    null;

    return pricingOverrideId ?
    { ...seat, pricingOverrideId } :
    { ...seat, pricingOverrideId: null };
  });
};

const getReservationForSession = async ({ sessionId, userId }) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }
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

  const session = await Session.findById(sessionId).
  select(
    "roomId overrides pricingOverrides eventId date sessionTime version pricingLimits"
  ).
  populate("eventId").
  populate({ path: "pricingOverrides.pricingId", select: "name price" });

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

  const now = new Date();
  const reservations = await SeatReservation.find({
    sessionId,
    userId,
    status: "pending",
    expiresAt: { $gt: now }
  }).sort({ updatedAt: -1, createdAt: -1 });
  await SeatReservation.populate(reservations, {
    path: "seats.pricingOverrideId",
    select: "name price"
  });

  if (!reservations.length) {
    const sessionInfo = session.toObject({ versionKey: false });
    sessionInfo.room = {
      _id: room._id,
      name: room.name,
      pricingOverrides: Array.isArray(room.pricingOverrides) ?
      room.pricingOverrides :
      []
    };
    return {
      session: sessionInfo,
      event: session.eventId || null,
      reservation: null
    };
  }

  const mergedSeats = mergeUniqueSeats(
    reservations.flatMap((reservation) => reservation.seats || [])
  );
  const primaryReservation = reservations[0];

  const sessionPricingOverrides = buildPricingOverrideMap(
    session.pricingOverrides
  );
  const roomPricingOverrides = buildPricingOverrideMap(room.pricingOverrides);
  const seatsWithOverrides = resolveReservationSeatsWithOverrides({
    seats: mergedSeats,
    sessionPricingOverrides,
    roomPricingOverrides
  });

  const sessionInfo = session.toObject({ versionKey: false });
  sessionInfo.room = {
    _id: room._id,
    name: room.name,
    pricingOverrides: Array.isArray(room.pricingOverrides) ?
    room.pricingOverrides :
    []
  };

  return {
    session: sessionInfo,
    event: session.eventId || null,
    reservation: {
      reservationId: String(primaryReservation._id),
      expiresAt: primaryReservation.expiresAt,
      seats: seatsWithOverrides
    }
  };
};

const createReservation = async ({ payload, userId, io }) => {
  const { sessionId, seats, action } = payload || {};
  const normalizedAction = String(action || "reserve").toLowerCase();

  if (!mongoose.isValidObjectId(sessionId)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }
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
  if (!ALLOWED_ACTIONS.has(normalizedAction)) {
    const error = new Error("Invalid action. Expected reserve or release");
    error.status = 400;
    throw error;
  }

  const normalizedSeats = normalizeSeats(seats);
  const session = await Session.findById(sessionId).
  select("roomId overrides pricingOverrides").
  populate({ path: "pricingOverrides.pricingId", select: "name price" });
  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  const room = await resolveRoom(session.roomId);
  if (room) {
    await room.populate({
      path: "pricingOverrides.pricingId",
      select: "name price"
    });
  }
  validateSeatsAgainstLayout({ seats: normalizedSeats, room, session });

  const sessionPricingOverrides = buildPricingOverrideMap(
    session.pricingOverrides
  );
  const roomPricingOverrides = buildPricingOverrideMap(
    room?.pricingOverrides
  );
  const normalizedSeatsWithOverrides = normalizedSeats.map((seat) => {
    if (seat.pricingOverrideId) {
      return seat;
    }
    const key = seatKey(seat.row, seat.col);
    const override =
    sessionPricingOverrides.get(key) || roomPricingOverrides.get(key) || null;
    const overrideId =
    override && typeof override === "object" && override._id ?
    override._id :
    override;
    return { ...seat, pricingOverrideId: overrideId || null };
  });

  const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
  const dbSession = await mongoose.startSession();
  let reservation = null;

  try {
    await dbSession.withTransaction(async () => {
      const now = new Date();
      const seatOrFilters = buildSeatOrFilters(normalizedSeatsWithOverrides);

      await SeatLock.deleteMany({
        sessionId,
        expiresAt: { $lte: now },
        $or: seatOrFilters
      }).session(dbSession);

      if (normalizedAction === "reserve") {
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
      }

      const existingReservations = await SeatReservation.find({
        sessionId,
        userId,
        status: "pending"
      }).
      sort({ createdAt: -1 }).
      session(dbSession);

      const expiredReservationIds = existingReservations.
      filter((item) => item.expiresAt && item.expiresAt <= now).
      map((item) => item._id);

      if (expiredReservationIds.length > 0) {
        await SeatReservation.deleteMany({
          _id: { $in: expiredReservationIds }
        }).session(dbSession);
      }

      const activeReservations = existingReservations.filter(
        (item) => !item.expiresAt || item.expiresAt > now
      );

      const primaryReservation = activeReservations[0] || null;
      const duplicateReservationIds = activeReservations.
      slice(1).
      map((item) => item._id);

      if (duplicateReservationIds.length > 0) {
        await SeatReservation.deleteMany({
          _id: { $in: duplicateReservationIds }
        }).session(dbSession);
      }

      const currentSeats = mergeUniqueSeats(
        activeReservations.flatMap((item) => item.seats || [])
      );

      if (normalizedAction === "reserve") {
        const conflictingLocks = await SeatLock.find({
          sessionId,
          expiresAt: { $gt: now },
          reservedBy: { $ne: userId },
          $or: seatOrFilters
        }).
        select("_id").
        session(dbSession);

        if (conflictingLocks.length > 0) {
          const error = new Error("Seat already reserved by another user");
          error.status = 409;
          throw error;
        }
      }

      const nextSeats = applyActionOnSeats({
        currentSeats,
        targetSeats: normalizedSeatsWithOverrides,
        action: normalizedAction
      });

      await SeatLock.deleteMany({
        sessionId,
        reservedBy: userId
      }).session(dbSession);

      if (nextSeats.length > 0) {
        const lockDocs = nextSeats.map((seat) => ({
          sessionId,
          row: seat.row,
          col: seat.col,
          reservedBy: userId,
          expiresAt
        }));

        await SeatLock.insertMany(lockDocs, {
          ordered: true,
          session: dbSession
        });
      }

      if (!nextSeats.length) {
        if (primaryReservation) {
          await SeatReservation.deleteOne({
            _id: primaryReservation._id
          }).session(dbSession);
        }
        reservation = null;
        return;
      }

      if (primaryReservation) {
        reservation = await SeatReservation.findByIdAndUpdate(
          primaryReservation._id,
          {
            seats: nextSeats,
            expiresAt,
            status: "pending"
          },
          {
            new: true,
            session: dbSession
          }
        );
      } else {
        const created = await SeatReservation.create(
          [
          {
            sessionId,
            userId,
            seats: nextSeats,
            status: "pending",
            expiresAt
          }],

          { session: dbSession }
        );
        reservation = created[0];
      }
    });
  } catch (error) {
    console.error("createReservation error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      sessionId,
      userId
    });
    if (error && error.code === 11000) {
      const conflictError = new Error("Seat already reserved by another user");
      conflictError.status = 409;
      throw conflictError;
    }
    throw error;
  } finally {
    dbSession.endSession();
  }

  if (io) {
    const payload = {
      seats: normalizedSeatsWithOverrides,
      userId: String(userId),
      reservation: buildReservationPayload(reservation)
    };

    if (normalizedAction === "release") {
      io.to(`session-${sessionId}`).emit("seats-released", {
        ...payload,
        reason: "manual"
      });
    } else {
      io.to(`session-${sessionId}`).emit("seats-reserved", {
        ...payload,
        expiresAt: reservation ? reservation.expiresAt : null,
        reservationId: reservation ? reservation._id : null
      });
    }
  }

  if (!reservation) {
    return reservation;
  }

  await reservation.populate({
    path: "seats.pricingOverrideId",
    select: "name price"
  });

  return reservation;
};

const cancelReservation = async ({ reservationId, userId, io }) => {
  if (!mongoose.isValidObjectId(reservationId)) {
    const error = new Error("Invalid reservation id");
    error.status = 400;
    throw error;
  }
  if (!userId || !mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 401;
    throw error;
  }

  const dbSession = await mongoose.startSession();
  let releasedSeats = [];
  let sessionId;
  let reservationOwner = null;

  try {
    await dbSession.withTransaction(async () => {
      const reservation =
      await SeatReservation.findById(reservationId).session(dbSession);
      if (!reservation) {
        const error = new Error("Reservation not found");
        error.status = 404;
        throw error;
      }
      if (reservation.status !== "pending") {
        const error = new Error("Reservation is not pending");
        error.status = 409;
        throw error;
      }
      if (String(reservation.userId) !== String(userId)) {
        const error = new Error("You cannot cancel this reservation");
        error.status = 403;
        throw error;
      }

      releasedSeats = reservation.seats || [];
      sessionId = reservation.sessionId;
      reservationOwner = reservation.userId;

      await SeatLock.deleteMany({
        sessionId: reservation.sessionId,
        reservedBy: reservation.userId,
        $or: buildSeatOrFilters(releasedSeats)
      }).session(dbSession);

      await SeatReservation.deleteOne({ _id: reservationId }).session(
        dbSession
      );
    });
  } finally {
    dbSession.endSession();
  }

  if (io && sessionId) {
    io.to(`session-${sessionId}`).emit("seats-released", {
      seats: releasedSeats,
      userId: reservationOwner ? String(reservationOwner) : null,
      reason: "cancelled",
      reservation: null
    });
  }

  return { message: "Réservation cancelled" };
};

const cancelReservationsForSession = async ({ sessionId, userId, io }) => {
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

  const dbSession = await mongoose.startSession();
  let releasedSeats = [];
  let deletedReservationsCount = 0;
  let deletedLocksCount = 0;

  try {
    await dbSession.withTransaction(async () => {
      const [reservations, locks] = await Promise.all([
      SeatReservation.find({
        sessionId,
        userId,
        status: "pending"
      }).
      select("seats").
      session(dbSession),
      SeatLock.find({ sessionId, reservedBy: userId }).
      select("row col").
      session(dbSession)]
      );

      const reservationSeats = reservations.flatMap(
        (reservation) => reservation.seats || []
      );
      const lockSeats = locks.map((lock) => ({ row: lock.row, col: lock.col }));
      releasedSeats = mergeUniqueSeats([...reservationSeats, ...lockSeats]);

      const lockResult = await SeatLock.deleteMany({
        sessionId,
        reservedBy: userId
      }).session(dbSession);
      deletedLocksCount = lockResult.deletedCount || 0;

      const reservationResult = await SeatReservation.deleteMany({
        sessionId,
        userId,
        status: "pending"
      }).session(dbSession);
      deletedReservationsCount = reservationResult.deletedCount || 0;
    });
  } finally {
    dbSession.endSession();
  }

  if (io && releasedSeats.length > 0) {
    io.to(`session-${sessionId}`).emit("seats-released", {
      seats: releasedSeats,
      userId: String(userId),
      reason: "cancelled",
      reservation: null
    });
  }

  return {
    message: "Réservations cancelled",
    reservationsCancelled: deletedReservationsCount,
    locksCancelled: deletedLocksCount,
    releasedSeats
  };
};

module.exports = {
  createReservation,
  cancelReservation,
  getReservationForSession,
  cancelReservationsForSession
};
