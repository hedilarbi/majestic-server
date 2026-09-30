const mongoose = require("mongoose");

const Event = require("../models/Event");
const ShowType = require("../models/ShowType");
const Session = require("../models/Session");
const HomeHero = require("../models/HomeHero");
const { uploadImage } = require("./firebaseStorageService");

const ACTIVE_SESSION_STATUSES = ["pending", "scheduled", "in_progress"];

const getEventIdsByNearestSession = async (startDate) => {
  const sessions = await Session.find({
    status: { $in: ACTIVE_SESSION_STATUSES },
    date: { $gte: startDate },
  })
    .select("eventId date sessionTime")
    .sort({ date: 1, sessionTime: 1 })
    .lean();

  const seen = new Set();
  return sessions.reduce((eventIds, session) => {
    const eventId = session.eventId ? String(session.eventId) : "";
    if (!eventId || seen.has(eventId)) return eventIds;
    seen.add(eventId);
    eventIds.push(eventId);
    return eventIds;
  }, []);
};

const sortEventsByNearestSession = (events, orderedEventIds) => {
  const positionById = new Map(
    orderedEventIds.map((eventId, index) => [String(eventId), index]),
  );
  return [...events].sort((left, right) => {
    const leftPosition = positionById.get(String(left?._id));
    const rightPosition = positionById.get(String(right?._id));
    return (
      (leftPosition ?? Number.MAX_SAFE_INTEGER) -
      (rightPosition ?? Number.MAX_SAFE_INTEGER)
    );
  });
};

const normalizeEnumValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
};

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
    // ignore parse errors and fall back to csv parsing
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

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildFilters = ({ name, type, status }) => {
  const filters = {};

  if (type) {
    filters.type = normalizeEnumValue(type);
  }

  if (status) {
    filters.status = normalizeEnumValue(status);
  }

  if (name) {
    filters.name = new RegExp(escapeRegex(name.trim()), "i");
  }

  return filters;
};

const normalizePayload = (payload) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "type")) {
    data.type = normalizeEnumValue(payload.type);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    data.name = payload.name;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    data.description = payload.description;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "poster")) {
    data.poster = payload.poster;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "trailerLink")) {
    data.trailerLink = payload.trailerLink;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "duration")) {
    data.duration = normalizeNumber(payload.duration);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "ageRestriction")) {
    data.ageRestriction = payload.ageRestriction;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "genres")) {
    data.genres = normalizeArray(payload.genres);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "availableVersions")) {
    data.availableVersions = normalizeArray(payload.availableVersions);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "releaseDate")) {
    data.releaseDate = normalizeDate(payload.releaseDate);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "directedBy")) {
    data.directedBy = payload.directedBy;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cast")) {
    data.cast = normalizeArray(payload.cast);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "availableFrom")) {
    data.availableFrom = normalizeDate(payload.availableFrom);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "availableTo")) {
    data.availableTo = normalizeDate(payload.availableTo);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    data.status = normalizeEnumValue(payload.status);
  }

  return data;
};

const createEvent = async ({ payload, file, createdBy }) => {
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

  if (!data.type || !data.name) {
    const error = new Error("Type and name are required");
    error.status = 400;
    throw error;
  }

  if (!file && !data.poster) {
    const error = new Error("Poster image is required");
    error.status = 400;
    throw error;
  }

  if (file) {
    const upload = await uploadImage(file, { folder: "events/posters" });
    data.poster = upload.url;
  }

  const event = await Event.create({
    ...data,
    createdBy,
  });

  return event;
};

const listEvents = async ({
  page = 1,
  limit = 20,
  name,
  type,
  status,
} = {}) => {
  const filters = buildFilters({ name, type, status });
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    Event.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Event.countDocuments(filters),
  ]);

  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    events,
    pagination: {
      total,
      page,
      limit,
      pages,
    },
  };
};

const getEventById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const event = await Event.findById(id);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  return event;
};

const updateEvent = async (id, { payload, file }) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});

  if (file) {
    const upload = await uploadImage(file, { folder: "events/posters" });
    data.poster = upload.url;
  }

  if (Object.keys(data).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const event = await Event.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  return event;
};

const deleteEvent = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  const event = await Event.findByIdAndDelete(id);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  await Session.deleteMany({ eventId: id });

  return event;
};

const getHomeContent = async () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [sessionEventIds, allSessionEventIds] = await Promise.all([
    getEventIdsByNearestSession(startOfToday),
    Session.distinct("eventId"),
  ]);
  const sessionFilter = sessionEventIds.length
    ? { _id: { $in: sessionEventIds } }
    : { _id: { $in: [] } };

  const upcomingHomeFilter = {
    status: "active",
    type: "movie",
    _id: { $nin: allSessionEventIds },
    availableTo: { $gte: now },
    $or: [
      { releaseDate: { $gt: now } },
      { releaseDate: null, availableFrom: { $gt: now } },
      { releaseDate: { $exists: false }, availableFrom: { $gt: now } },
    ],
  };

  const [moviesRaw, showsRaw, upcoming, homeSlider] = await Promise.all([
    Event.find({ status: "active", ...sessionFilter, type: "movie" }),
    Event.find({ status: "active", ...sessionFilter, type: "show" }),
    Event.find(upcomingHomeFilter).sort({
      availableFrom: 1,
    }),
    HomeHero.find({
      active: true,
      defaultMovieBanner: { $ne: true },
      defaultShowBanner: { $ne: true },
    })
      .populate("eventId")
      .sort({ order: 1, createdAt: -1 }),
  ]);
  const movies = sortEventsByNearestSession(moviesRaw, sessionEventIds);
  const shows = sortEventsByNearestSession(showsRaw, sessionEventIds);

  let lastExpiredShow = null;
  if (!shows.length) {
    lastExpiredShow = await Event.findOne({
      status: "active",
      type: "show",
      availableTo: { $lt: now },
    }).sort({ availableTo: -1 });
  }

  return {
    aLaffiche: movies,
    spectacles: shows,
    prochainement: upcoming,
    homeSlider,
    lastExpiredShow: lastExpiredShow || null,
  };
};

const getEventsWithALAffiche = async ({ type, genre }) => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const baseFilters = {
    status: "active",
  };

  const normalizedType = type ? normalizeEnumValue(type) : undefined;

  if (type) {
    baseFilters.type = normalizedType;
  }

  if (genre) {
    const genreList = normalizeArray(genre);
    if (Array.isArray(genreList) && genreList.length > 0) {
      baseFilters.genres = { $in: genreList };
    }
  }

  const activeWindowFilters = {
    ...baseFilters,
  };

  const upcomingFilters = {
    ...baseFilters,
    availableTo: { $gte: now },
    // Prochainement = releaseDate in the future, or no releaseDate but availableFrom in the future
    $or: [
      { releaseDate: { $gt: now } },
      { releaseDate: null, availableFrom: { $gt: now } },
      { releaseDate: { $exists: false }, availableFrom: { $gt: now } },
    ],
  };

  const afficheFilter = { active: true };
  if (normalizedType === "movie") {
    afficheFilter.movieAffiche = true;
  } else if (normalizedType === "show") {
    afficheFilter.showAffiche = true;
  }

  const aLaffichePromise =
    normalizedType === "movie" || normalizedType === "show"
      ? HomeHero.findOne(afficheFilter).populate("eventId")
      : Promise.resolve(null);

  const defaultBannerPromise =
    normalizedType === "movie" || normalizedType === "show"
      ? HomeHero.findOne({
          active: true,
          [normalizedType === "movie"
            ? "defaultMovieBanner"
            : "defaultShowBanner"]: true,
        })
      : Promise.resolve(null);

  const [sessionEventIds, allSessionEventIds, linkedBanner, defaultBanner, showTypes] =
    await Promise.all([
      getEventIdsByNearestSession(startOfToday),
      Session.distinct("eventId"),
      aLaffichePromise,
      defaultBannerPromise,
      normalizedType === "show" ? ShowType.find().sort({ name: 1 }) : [],
    ]);

  let aLaffiche = linkedBanner;
  if (linkedBanner?.eventId?._id) {
    const lastSession = await Session.findOne({
      eventId: linkedBanner.eventId._id,
      status: { $ne: "cancelled" },
    })
      .select("date sessionTime")
      .sort({ date: -1, sessionTime: -1 })
      .lean();

    if (!lastSession?.date) {
      aLaffiche = defaultBanner || linkedBanner;
    } else {
      const endOfLastSessionDay = new Date(lastSession.date);
      endOfLastSessionDay.setHours(23, 59, 59, 999);
      if (now > endOfLastSessionDay) {
        aLaffiche = defaultBanner || linkedBanner;
      }
    }
  } else if (!linkedBanner) {
    aLaffiche = defaultBanner;
  }

  upcomingFilters._id = { $nin: allSessionEventIds };

  const eventsPromise = sessionEventIds.length
    ? Event.find({ ...activeWindowFilters, _id: { $in: sessionEventIds } })
    : Promise.resolve([]);

  const expiredShowsPromise =
    normalizedType === "show"
      ? Event.find({ status: "active", type: "show", availableTo: { $lt: now } }).sort({ availableTo: -1 }).limit(6)
      : Promise.resolve([]);

  const [eventsRaw, prochainement, expiredShows] = await Promise.all([
    eventsPromise,
    Event.find(upcomingFilters).sort({ availableFrom: 1 }),
    expiredShowsPromise,
  ]);
  const events = sortEventsByNearestSession(eventsRaw, sessionEventIds);

  return { events, prochainement, aLaffiche, showTypes, expiredShows };
};

module.exports = {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getHomeContent,
  getEventsWithALAffiche,
};
