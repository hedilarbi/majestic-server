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
      "Une séance est déjà programmée à cette date et cette heure",
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
      const parseError = new Error(
        "pricingOverrides must be a valid JSON array",
      );
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
  if (Object.prototype.hasOwnProperty.call(payload, "sessionType")) {
    const validTypes = ["normale", "projection_debat", "avant_premiere", "premiere"];
    if (validTypes.includes(payload.sessionType)) {
      data.sessionType = payload.sessionType;
    }
  }

  return data;
};

const normalizeStatus = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
};

const combineSessionDateTime = (dateValue, sessionTime) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const timeText = String(sessionTime || "").trim();
  const timeMatch = timeText.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch) {
    return new Date(date);
  }

  const hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
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

const normalizeNameFilter = (value) => {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item.trim());
    return found ? found.trim() : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildGuichetDateFilter = ({ dateFrom, dateTo } = {}) => {
  const fromDate = parseDateFilter(dateFrom, "dateFrom");
  const toDate = parseDateFilter(dateTo, "dateTo");

  if (!fromDate && !toDate) {
    return undefined;
  }

  if (fromDate && toDate && fromDate > toDate) {
    const error = new Error("dateFrom must be before dateTo");
    error.status = 400;
    throw error;
  }

  if (fromDate && !toDate) {
    const { start, end } = buildDayRange(fromDate);
    return { $gte: start, $lte: end };
  }

  if (!fromDate && toDate) {
    const { start, end } = buildDayRange(toDate);
    return { $gte: start, $lte: end };
  }

  const { start: startFrom } = buildDayRange(fromDate);
  const { end: endTo } = buildDayRange(toDate);
  return { $gte: startFrom, $lte: endTo };
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
        "pricingOverrides requires row, col, and pricingId",
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
    const error = new Error(
      "eventId, date, sessionTime, and version are required",
    );
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

  // if (data.pricingLimits) {
  //   validatePricingLimits(data.pricingLimits);
  // }

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

const listGuichetSessions = async ({ dateFrom, dateTo, name, status } = {}) => {
  const filters = {};
  if (status) {
    filters.status = status;
  }
  const dateFilter = buildGuichetDateFilter({ dateFrom, dateTo });
  if (dateFilter) {
    filters.date = dateFilter;
  }

  const nameFilter = normalizeNameFilter(name);
  if (nameFilter) {
    const regex = new RegExp(escapeRegExp(nameFilter), "i");
    const events = await Event.find({ name: regex }).select("_id");
    if (events.length === 0) {
      return [];
    }
    filters.eventId = { $in: events.map((event) => event._id) };
  }

  return Session.find(filters)
    .populate("eventId", "name poster")
    .sort({ date: 1, sessionTime: 1 });
};

const listDoorStaffSessions = async () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const sessions = await Session.find({
    date: { $gte: start, $lte: end },
    status: { $nin: ["completed", "cancelled"] },
  })
    .select("eventId date sessionTime roomId status availableSeats totalSeats")
    .populate("eventId", "name poster")
    .sort({ date: 1, sessionTime: 1 })
    .lean();

  const items = sessions.map((session) => {
    const event =
      session.eventId && typeof session.eventId === "object"
        ? session.eventId
        : null;

    return {
      id: session._id ? String(session._id) : null,
      status: session.status || "",
      date: session.date || null,
      sessionTime: session.sessionTime || "",
      startsAt: combineSessionDateTime(session.date, session.sessionTime),
      roomId: session.roomId || "",
      availableSeats: Number.isFinite(Number(session.availableSeats))
        ? Number(session.availableSeats)
        : null,
      totalSeats: Number.isFinite(Number(session.totalSeats))
        ? Number(session.totalSeats)
        : null,
      event: event
        ? {
            id: event._id ? String(event._id) : null,
            name: event.name || "",
            poster: event.poster || "",
          }
        : null,
    };
  });

  items.sort((a, b) => {
    const aStartsAt = new Date(a.startsAt || 0).getTime();
    const bStartsAt = new Date(b.startsAt || 0).getTime();
    const aDistance = Math.abs(aStartsAt - now.getTime());
    const bDistance = Math.abs(bStartsAt - now.getTime());

    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    return aStartsAt - bStartsAt;
  });

  return items;
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
    orderBy === "createdAt" ? { createdAt: -1 } : { date: 1, sessionTime: 1 };

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

const getSessionsByEventId = async (eventId, { status } = {}) => {
  if (!mongoose.isValidObjectId(eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const filters = { eventId };
  if (status) {
    filters.status = normalizeStatus(status);
  }

  return Session.find(filters).sort({ createdAt: -1, _id: -1 });
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

const listSessionsByDateGrouped = async (dateValue, { status } = {}) => {
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

  const filters = {
    date: { $gte: start, $lte: end },
  };
  if (status) {
    filters.status = normalizeStatus(status);
  }

  const sessions = await Session.find(filters)
    .select("date availableSeats sessionTime version eventId")
    .populate(
      "eventId",
      "name poster genres description duration ageRestriction directedBy trailerLink",
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
    "eventId version date sessionTime",
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
  listGuichetSessions,
  listDoorStaffSessions,
  listSessionsPopulatedEveent,
  getSessionById,
  getSessionsByEventId,
  getSessionHomeByEventId,
  listSessionsByDateGrouped,
  updateSession,
  deleteSession,
};
