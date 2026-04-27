const mongoose = require("mongoose");

const Session = require("../models/Session");
const Booking = require("../models/Booking");
const SeatLock = require("../models/SeatLock");
const SeatReservation = require("../models/SeatReservation");
const { seatKey } = require("../utils/seatKey");
const {
  resolveRoom,
  buildOverrideMap,
  buildPricingOverrideMap
} = require("../utils/seatHelpers");

const mergeUniqueSeats = (seats = []) => {
  const byKey = new Map();

  seats.forEach((seat) => {
    if (!seat || seat.row === undefined || seat.col === undefined) {
      return;
    }
    byKey.set(seatKey(seat.row, seat.col), {
      row: String(seat.row),
      col: Number(seat.col)
    });
  });

  return Array.from(byKey.values());
};

const getSeatMap = async (sessionId, currentUserId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }

  const session = await Session.findById(sessionId).
  select(
    "roomId overrides pricingOverrides eventId date sessionTime version pricingLimits status"
  ).
  populate("eventId").
  populate({ path: "pricingOverrides.pricingId", select: "name price" });
  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  const sessionStatus = String(session.status || "").
  trim().
  toLowerCase();
  if (sessionStatus !== "in_progress") {
    const error = new Error("Session is not available");
    error.status = 409;
    error.sessionStatus = sessionStatus || "unknown";
    throw error;
  }

  const room = await resolveRoom(session.roomId);
  if (!room) {
    const error = new Error("Room not found");
    error.status = 404;
    throw error;
  }
  if (typeof room.populate === "function") {
    await room.populate({ path: "pricingOverrides.pricingId", select: "name price" });
  }

  const now = new Date();
  const currentUserIdString = currentUserId ? String(currentUserId) : "";
  const [bookings, seatLocks, seatReservations] = await Promise.all([
  Booking.find({
    sessionId,
    status: { $in: ["confirmed", "used"] }
  }).select("seats"),
  SeatLock.find({ sessionId, expiresAt: { $gt: now } }).select(
    "row col reservedBy"
  ),
  SeatReservation.find({
    sessionId,
    status: "pending",
    expiresAt: { $gt: now }
  }).select("_id userId seats expiresAt createdAt updatedAt")]
  );

  const bookedSet = new Set();
  bookings.forEach((booking) => {
    (booking.seats || []).forEach((seat) => {
      bookedSet.add(seatKey(seat.row, seat.col));
    });
  });

  const reservedSet = new Set();
  seatLocks.forEach((lock) => {
    reservedSet.add(seatKey(lock.row, lock.col));
  });
  seatReservations.forEach((reservation) => {
    (reservation.seats || []).forEach((seat) => {
      reservedSet.add(seatKey(seat.row, seat.col));
    });
  });

  let myReservation = null;
  if (currentUserIdString) {
    const myReservations = seatReservations.
    filter((reservation) => String(reservation.userId) === currentUserIdString).
    sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    if (myReservations.length > 0) {
      const primaryReservation = myReservations[0];
      const mergedSeats = mergeUniqueSeats(
        myReservations.flatMap((reservation) => reservation.seats || [])
      );

      myReservation = {
        reservationId: String(primaryReservation._id),
        expiresAt: primaryReservation.expiresAt,
        seats: mergedSeats
      };
    }
  }

  const sessionOverrides = buildOverrideMap(session.overrides, [
  "blocked",
  "staff"]
  );
  const roomOverrides = buildOverrideMap(room.overrides, ["blocked", "staff"]);
  const sessionPricingOverrides = buildPricingOverrideMap(
    session.pricingOverrides
  );
  const roomPricingOverrides = buildPricingOverrideMap(room.pricingOverrides);

  const seatMap = (room.layout || []).map((cell) => {
    const key = seatKey(cell.row, cell.col);
    if (cell.cellType === "couloir") {
      return {
        row: cell.row,
        col: cell.col,
        cellType: "couloir",
        status: "aisle",
        isBookable: false,
        pricingOverrideId: null
      };
    }

    let status = "available";
    if (sessionOverrides.has(key)) {
      status = sessionOverrides.get(key);
    } else if (roomOverrides.has(key)) {
      status = roomOverrides.get(key);
    } else if (bookedSet.has(key)) {
      status = "booked";
    } else if (reservedSet.has(key)) {
      status = "reserved";
    }

    const pricingOverrideId =
    sessionPricingOverrides.get(key) || roomPricingOverrides.get(key) || null;

    return {
      row: cell.row,
      col: cell.col,
      cellType: cell.cellType,
      status,
      isBookable: status === "available",
      pricingOverrideId
    };
  });

  return {
    session,
    event: session.eventId || null,
    seatMap,
    myReservation
  };
};

module.exports = {
  getSeatMap
};