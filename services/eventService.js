const mongoose = require("mongoose");

const Event = require("../models/Event");
const ShowType = require("../models/ShowType");
const Session = require("../models/Session");
const HomeHero = require("../models/HomeHero");
const { uploadImage } = require("./firebaseStorageService");

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
  const activeWindow = {
    status: "active",
    availableFrom: { $lte: now },
    availableTo: { $gte: now },
  };

  const sessionEventIds = await Session.distinct("eventId", {
    status: "in_progress",
  });
  const sessionFilter = sessionEventIds.length
    ? { _id: { $in: sessionEventIds } }
    : { _id: { $in: [] } };

  const releasedFilter = {
    $or: [{ releaseDate: null }, { releaseDate: { $exists: false } }, { releaseDate: { $lte: now } }],
  };
  const upcomingHomeFilter = {
    status: "active",
    availableTo: { $gte: now },
    $or: [
      { releaseDate: { $gt: now } },
      { releaseDate: null, availableFrom: { $gt: now } },
      { releaseDate: { $exists: false }, availableFrom: { $gt: now } },
    ],
  };

  const [movies, shows, upcoming, homeSlider] = await Promise.all([
    Event.find({ ...activeWindow, ...sessionFilter, ...releasedFilter, type: "movie" }).sort({
      availableFrom: 1,
    }),
    Event.find({ ...activeWindow, ...sessionFilter, ...releasedFilter, type: "show" }).sort({
      availableFrom: 1,
    }),
    Event.find(upcomingHomeFilter).sort({
      availableFrom: 1,
    }),
    HomeHero.find({ active: true })
      .populate("eventId")
      .sort({ order: 1, createdAt: -1 }),
  ]);

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
    availableFrom: { $lte: now },
    availableTo: { $gte: now },
    // Only show events where releaseDate is not set or already passed
    $or: [{ releaseDate: null }, { releaseDate: { $exists: false } }, { releaseDate: { $lte: now } }],
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

  const [sessionEventIds, aLaffiche, showTypes] = await Promise.all([
    Session.distinct("eventId", { status: "in_progress" }),
    aLaffichePromise,
    normalizedType === "show" ? ShowType.find().sort({ name: 1 }) : [],
  ]);

  const eventsPromise = sessionEventIds.length
    ? Event.find({ ...activeWindowFilters, _id: { $in: sessionEventIds } }).sort({
        availableFrom: 1,
      })
    : Promise.resolve([]);

  const expiredShowsPromise =
    normalizedType === "show"
      ? Event.find({ status: "active", type: "show", availableTo: { $lt: now } }).sort({ availableTo: -1 }).limit(6)
      : Promise.resolve([]);

  const [events, prochainement, expiredShows] = await Promise.all([
    eventsPromise,
    Event.find(upcomingFilters).sort({ availableFrom: 1 }),
    expiredShowsPromise,
  ]);

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
