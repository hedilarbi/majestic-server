const mongoose = require("mongoose");

const Event = require("../models/Event");
const Session = require("../models/Session");

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    // ignore parse errors
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [trimmed];
};

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue;
};

const normalizeDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? value : dateValue;
};

const buildDayRange = (value) => {
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    const error = new Error("Date invalide");
    error.status = 400;
    throw error;
  }

  const start = new Date(dateValue);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateValue);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const ensureNoSessionConflict = async ({ date, sessionTime, excludeId }) => {
  if (!date || !sessionTime) {
    return;
  }

  const { start, end } = buildDayRange(date);
  const query = {
    date: { $gte: start, $lte: end },
    sessionTime,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Session.findOne(query).select("_id");
  if (existing) {
    const error = new Error(
      "Une séance est déjà programmée à cette date et cette heure"
    );
    error.status = 409;
    throw error;
  }
};

const parseOverrides = (overrides) => {
  if (overrides === undefined) {
    return undefined;
  }

  if (Array.isArray(overrides)) {
    return overrides;
  }

  if (typeof overrides === "string") {
    try {
      const parsed = JSON.parse(overrides);
      if (!Array.isArray(parsed)) {
        const error = new Error("overrides must be an array");
        error.status = 400;
        throw error;
      }
      return parsed;
    } catch (error) {
      const parseError = new Error("overrides must be a valid JSON array");
      parseError.status = 400;
      throw parseError;
    }
  }

  const error = new Error("overrides must be an array");
  error.status = 400;
  throw error;
};

const parsePricingOverrides = (pricingOverrides) => {
  if (pricingOverrides === undefined) {
    return undefined;
  }

  if (Array.isArray(pricingOverrides)) {
    return pricingOverrides;
  }

  if (typeof pricingOverrides === "string") {
    try {
      const parsed = JSON.parse(pricingOverrides);
      if (!Array.isArray(parsed)) {
        const error = new Error("pricingOverrides must be an array");
        error.status = 400;
        throw error;
      }
      return parsed;
    } catch (error) {
      const parseError = new Error("pricingOverrides must be a valid JSON array");
      parseError.status = 400;
      throw parseError;
    }
  }

  const error = new Error("pricingOverrides must be an array");
  error.status = 400;
  throw error;
};

const ensureEventVersion = async (eventId, version) => {
  if (!mongoose.isValidObjectId(eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const event = await Event.findById(eventId).select("availableVersions");
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  if (
    Array.isArray(event.availableVersions) &&
    event.availableVersions.length > 0
  ) {
    if (!event.availableVersions.includes(version)) {
      const error = new Error("Version must be in event availableVersions");
      error.status = 400;
      throw error;
    }
  }
};

const normalizePayload = (payload) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "eventId")) {
    data.eventId = payload.eventId;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "date")) {
    data.date = normalizeDate(payload.date);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sessionTime")) {
    data.sessionTime = payload.sessionTime;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "version")) {
    data.version = payload.version;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "roomId")) {
    data.roomId = payload.roomId;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "totalSeats")) {
    data.totalSeats = normalizeNumber(payload.totalSeats);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "availableSeats")) {
    data.availableSeats = normalizeNumber(payload.availableSeats);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "blockedSeats")) {
    data.blockedSeats = normalizeArray(payload.blockedSeats);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "overrides")) {
    data.overrides = parseOverrides(payload.overrides);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "pricingOverrides")) {
    data.pricingOverrides = parsePricingOverrides(payload.pricingOverrides);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "pricingLimits")) {
    data.pricingLimits = normalizeArray(payload.pricingLimits);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    data.status = payload.status;
  }

  return data;
};

const normalizeStatus = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
};

const parseDateFilter = (value, label) => {
  if (!value) {
    return undefined;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    const error = new Error(`Invalid ${label} date`);
    error.status = 400;
    throw error;
  }

  return dateValue;
};

const buildSessionFilters = ({ from, to, status }) => {
  const filters = {};
  const fromDate = parseDateFilter(from, "from");
  const toDate = parseDateFilter(to, "to");

  if (fromDate || toDate) {
    filters.date = {};
    if (fromDate) {
      filters.date.$gte = fromDate;
    }
    if (toDate) {
      filters.date.$lte = toDate;
    }
  }

  if (status) {
    filters.status = normalizeStatus(status);
  }

  return filters;
};

const validatePricingLimits = (pricingLimits) => {
  if (!Array.isArray(pricingLimits)) {
    const error = new Error("pricingLimits must be an array");
    error.status = 400;
    throw error;
  }

  pricingLimits.forEach((limit) => {
    if (!limit || !limit.pricingId) {
      const error = new Error("pricingLimits.pricingId is required");
      error.status = 400;
      throw error;
    }

    if (!mongoose.isValidObjectId(limit.pricingId)) {
      const error = new Error("Invalid pricingId in pricingLimits");
      error.status = 400;
      throw error;
    }
  });
};

const validateOverrides = (overrides) => {
  if (!Array.isArray(overrides)) {
    const error = new Error("overrides must be an array");
    error.status = 400;
    throw error;
  }

  overrides.forEach((item) => {
    if (!item || !item.row || !item.col || !item.status) {
      const error = new Error("overrides requires row, col, and status");
      error.status = 400;
      throw error;
    }

    if (!["blocked", "staff", "chaise"].includes(item.status)) {
      const error = new Error("Invalid status in overrides");
      error.status = 400;
      throw error;
    }
  });
};

const validatePricingOverrides = (pricingOverrides) => {
  if (!Array.isArray(pricingOverrides)) {
    const error = new Error("pricingOverrides must be an array");
    error.status = 400;
    throw error;
  }

  pricingOverrides.forEach((item) => {
    if (!item || !item.row || !item.col || !item.pricingId) {
      const error = new Error(
        "pricingOverrides requires row, col, and pricingId"
      );
      error.status = 400;
      throw error;
    }

    if (!mongoose.isValidObjectId(item.pricingId)) {
      const error = new Error("Invalid pricingId in pricingOverrides");
      error.status = 400;
      throw error;
    }
  });
};

const createSession = async ({ payload, createdBy }) => {
  if (!createdBy) {
    const error = new Error("Missing admin user id");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(createdBy)) {
    const error = new Error("Invalid admin user id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});

  if (!data.eventId || !data.date || !data.sessionTime || !data.version) {
    const error = new Error("eventId, date, sessionTime, and version are required");
    error.status = 400;
    throw error;
  }

  if (!data.roomId) {
    const error = new Error("roomId is required");
    error.status = 400;
    throw error;
  }

  if (data.totalSeats === undefined || data.totalSeats === null) {
    const error = new Error("totalSeats is required");
    error.status = 400;
    throw error;
  }

  if (data.availableSeats === undefined || data.availableSeats === null) {
    data.availableSeats = data.totalSeats;
  }

  if (data.availableSeats > data.totalSeats) {
    const error = new Error("availableSeats cannot exceed totalSeats");
    error.status = 400;
    throw error;
  }

  if (data.pricingLimits) {
    validatePricingLimits(data.pricingLimits);
  }

  if (data.overrides) {
    validateOverrides(data.overrides);
  }

  if (data.pricingOverrides) {
    validatePricingOverrides(data.pricingOverrides);
  }

  await ensureNoSessionConflict({
    date: data.date,
    sessionTime: data.sessionTime,
  });

  await ensureEventVersion(data.eventId, data.version);

  const session = await Session.create({
    ...data,
    createdBy,
  });

  return session;
};

const listSessions = async () => {
  return Session.find().sort({ date: 1 });
};

const listSessionsPopulatedEveent = async ({
  page = 1,
  limit = 20,
  from,
  to,
  status,
  orderBy,
} = {}) => {
  const filters = buildSessionFilters({ from, to, status });
  const skip = (page - 1) * limit;
  const sort =
    orderBy === "createdAt"
      ? { createdAt: -1 }
      : { date: 1, sessionTime: 1 };

  const [sessions, total] = await Promise.all([
    Session.find(filters)
      .populate("eventId", "name poster")
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Session.countDocuments(filters),
  ]);

  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    sessions,
    pagination: {
      total,
      page,
      limit,
      pages,
    },
  };
};

const getSessionById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }

  const session = await Session.findById(id);
  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  return session;
};

const getSessionsByEventId = async (eventId) => {
  if (!mongoose.isValidObjectId(eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  return Session.find({ eventId }).sort({ date: 1 });
};

const getSessionHomeByEventId = async (eventId, { status } = {}) => {
  if (!mongoose.isValidObjectId(eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const event = await Event.findById(eventId);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  const filters = { eventId };
  if (status) {
    filters.status = normalizeStatus(status);
  }

  const sessions = await Session.find(filters)
    .select("date sessionTime version availableSeats")
    .sort({ date: 1 });

  return { event, sessions };
};

const listSessionsByDateGrouped = async (dateValue) => {
  if (!dateValue) {
    const error = new Error("date query is required");
    error.status = 400;
    throw error;
  }

  const baseDate = new Date(dateValue);
  if (Number.isNaN(baseDate.getTime())) {
    const error = new Error("Invalid date");
    error.status = 400;
    throw error;
  }

  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(23, 59, 59, 999);

  const sessions = await Session.find({
    date: { $gte: start, $lte: end },
  })
    .select("date availableSeats sessionTime version eventId")
    .populate(
      "eventId",
      "name poster genres description duration ageRestriction directedBy trailerLink"
    )
    .sort({ date: 1 });

  const grouped = new Map();
  sessions.forEach((session) => {
    const event = session.eventId || null;
    const key = event ? event._id.toString() : "unknown";
    if (!grouped.has(key)) {
      grouped.set(key, {
        event: event
          ? {
              _id: event._id,
              name: event.name,
              poster: event.poster,
              genres: event.genres,
              description: event.description,
              duration: event.duration,
              ageRestriction: event.ageRestriction,
              directedBy: event.directedBy,
              trailerLink: event.trailerLink,
            }
          : null,
        sessions: [],
      });
    }
    grouped.get(key).sessions.push(session);
  });

  return Array.from(grouped.values());
};

const updateSession = async (id, payload) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});

  if (data.pricingLimits) {
    validatePricingLimits(data.pricingLimits);
  }
  if (data.overrides) {
    validateOverrides(data.overrides);
  }
  if (data.pricingOverrides) {
    validatePricingOverrides(data.pricingOverrides);
  }

  const existing = await Session.findById(id).select(
    "eventId version date sessionTime"
  );
  if (!existing) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  const targetEventId = data.eventId || existing.eventId;
  const targetVersion = data.version || existing.version;
  if (data.eventId || data.version) {
    await ensureEventVersion(targetEventId, targetVersion);
  }

  const targetDate = data.date || existing.date;
  const targetSessionTime = data.sessionTime || existing.sessionTime;
  await ensureNoSessionConflict({
    date: targetDate,
    sessionTime: targetSessionTime,
    excludeId: id,
  });

  if (
    data.totalSeats !== undefined &&
    data.availableSeats === undefined &&
    data.totalSeats !== null
  ) {
    data.availableSeats = data.totalSeats;
  }

  if (
    data.availableSeats !== undefined &&
    data.totalSeats !== undefined &&
    data.availableSeats > data.totalSeats
  ) {
    const error = new Error("availableSeats cannot exceed totalSeats");
    error.status = 400;
    throw error;
  }

  if (Object.keys(data).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const session = await Session.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  return session;
};

const deleteSession = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session id");
    error.status = 400;
    throw error;
  }

  const session = await Session.findByIdAndDelete(id);
  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  return session;
};

module.exports = {
  createSession,
  listSessions,
  listSessionsPopulatedEveent,
  getSessionById,
  getSessionsByEventId,
  getSessionHomeByEventId,
  listSessionsByDateGrouped,
  updateSession,
  deleteSession,
};
