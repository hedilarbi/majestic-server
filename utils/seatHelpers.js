const mongoose = require("mongoose");

const Room = require("../models/Room");
const { seatKey } = require("./seatKey");

const resolveRoom = async (roomId) => {
  if (!roomId) {
    return null;
  }

  if (mongoose.isValidObjectId(roomId)) {
    const room = await Room.findById(roomId);
    if (room) {
      return room;
    }
  }

  return Room.findOne({ name: roomId });
};

const buildOverrideMap = (overrides, allowedStatuses) => {
  const map = new Map();
  if (!Array.isArray(overrides)) {
    return map;
  }

  overrides.forEach((item) => {
    if (!item || !item.row || item.col === undefined || item.col === null) {
      return;
    }
    if (
      Array.isArray(allowedStatuses) &&
      !allowedStatuses.includes(item.status)
    ) {
      return;
    }
    map.set(seatKey(item.row, item.col), item.status);
  });

  return map;
};

const buildPricingOverrideMap = (pricingOverrides) => {
  const map = new Map();
  if (!Array.isArray(pricingOverrides)) {
    return map;
  }

  pricingOverrides.forEach((item) => {
    if (!item || !item.row || item.col === undefined || item.col === null) {
      return;
    }
    if (!item.pricingId) {
      return;
    }
    map.set(seatKey(item.row, item.col), item.pricingId);
  });

  return map;
};

const normalizeSeats = (seats) => {
  if (!Array.isArray(seats) || seats.length === 0) {
    const error = new Error("seats must be a non-empty array");
    error.status = 400;
    throw error;
  }

  const normalized = seats.map((seat) => {
    if (!seat || !seat.row || seat.col === undefined || seat.col === null) {
      const error = new Error("Each seat requires row and col");
      error.status = 400;
      throw error;
    }

    const row = String(seat.row).trim();
    const col = Number(seat.col);
    if (!row || Number.isNaN(col) || col <= 0) {
      const error = new Error("Invalid seat row/col");
      error.status = 400;
      throw error;
    }

    let pricingOverrideId = null;
    if (
      seat.pricingOverrideId !== undefined &&
      seat.pricingOverrideId !== null &&
      seat.pricingOverrideId !== ""
    ) {
      const rawId =
        typeof seat.pricingOverrideId === "object" &&
        seat.pricingOverrideId._id
          ? seat.pricingOverrideId._id
          : seat.pricingOverrideId;
      if (!mongoose.isValidObjectId(rawId)) {
        const error = new Error("Invalid pricingOverrideId");
        error.status = 400;
        throw error;
      }
      pricingOverrideId = rawId;
    }

    return { row, col, pricingOverrideId };
  });

  const unique = new Set();
  normalized.forEach((seat) => {
    const key = seatKey(seat.row, seat.col);
    if (unique.has(key)) {
      const error = new Error(`Duplicate seat detected: ${seat.row}-${seat.col}`);
      error.status = 400;
      throw error;
    }
    unique.add(key);
  });

  return normalized;
};

const validateSeatsAgainstLayout = ({ seats, room, session }) => {
  if (!room) {
    const error = new Error("Room not found for session");
    error.status = 404;
    throw error;
  }

  const layoutMap = new Map();
  (room.layout || []).forEach((cell) => {
    layoutMap.set(seatKey(cell.row, cell.col), cell.cellType);
  });

  const sessionOverrides = buildOverrideMap(session?.overrides, [
    "blocked",
    "staff",
  ]);
  const roomOverrides = buildOverrideMap(room.overrides, ["blocked", "staff"]);

  seats.forEach((seat) => {
    const key = seatKey(seat.row, seat.col);
    const cellType = layoutMap.get(key);
    if (!cellType) {
      const error = new Error(`Seat ${seat.row}-${seat.col} not in layout`);
      error.status = 400;
      throw error;
    }
    if (cellType !== "chaise") {
      const error = new Error(`Seat ${seat.row}-${seat.col} is not bookable`);
      error.status = 400;
      throw error;
    }
    if (sessionOverrides.get(key) || roomOverrides.get(key)) {
      const error = new Error(`Seat ${seat.row}-${seat.col} is blocked`);
      error.status = 409;
      throw error;
    }
  });
};

const buildSeatOrFilters = (seats) =>
  seats.map((seat) => ({ row: seat.row, col: seat.col }));

module.exports = {
  resolveRoom,
  buildOverrideMap,
  buildPricingOverrideMap,
  normalizeSeats,
  validateSeatsAgainstLayout,
  buildSeatOrFilters,
};
