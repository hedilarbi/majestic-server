const mongoose = require("mongoose");

const HomeHero = require("../models/HomeHero");
const { uploadImage } = require("./firebaseStorageService");

const normalizePayload = (payload) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    if (payload.active === "true") {
      data.active = true;
    } else if (payload.active === "false") {
      data.active = false;
    } else {
      data.active = payload.active;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    data.title = payload.title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "subtitle")) {
    data.subtitle = payload.subtitle;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "eventId")) {
    data.eventId = payload.eventId || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "order")) {
    const parsedOrder = Number(payload.order);
    if (!Number.isNaN(parsedOrder)) {
      data.order = parsedOrder;
    } else {
      data.order = payload.order;
    }
  }

  return data;
};

const createHomeHero = async ({ payload, file }) => {
  const data = normalizePayload(payload || {});

  if (!file) {
    const error = new Error("Poster image is required");
    error.status = 400;
    throw error;
  }

  if (data.eventId && !mongoose.isValidObjectId(data.eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  if (data.order === undefined) {
    const total = await HomeHero.countDocuments();
    data.order = total + 1;
  }

  const upload = await uploadImage(file, { folder: "home-hero" });
  data.poster = upload.url;

  const hero = await HomeHero.create(data);
  return hero;
};

const listHomeHeroes = async () => {
  return HomeHero.find().sort({ createdAt: -1 });
};

const getHomeHeroById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid home hero id");
    error.status = 400;
    throw error;
  }

  const hero = await HomeHero.findById(id);
  if (!hero) {
    const error = new Error("Home hero not found");
    error.status = 404;
    throw error;
  }

  return hero;
};

const updateHomeHero = async (id, { payload, file }) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid home hero id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});

  if (file) {
    const upload = await uploadImage(file, { folder: "home-hero" });
    data.poster = upload.url;
  }

  if (data.eventId && !mongoose.isValidObjectId(data.eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  if (Object.keys(data).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const hero = await HomeHero.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!hero) {
    const error = new Error("Home hero not found");
    error.status = 404;
    throw error;
  }

  return hero;
};

const deleteHomeHero = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid home hero id");
    error.status = 400;
    throw error;
  }

  const hero = await HomeHero.findByIdAndDelete(id);
  if (!hero) {
    const error = new Error("Home hero not found");
    error.status = 404;
    throw error;
  }

  return hero;
};

const swapHomeHeroOrder = async ({ firstId, secondId }) => {
  if (!mongoose.isValidObjectId(firstId) || !mongoose.isValidObjectId(secondId)) {
    const error = new Error("Invalid home hero id");
    error.status = 400;
    throw error;
  }

  if (firstId === secondId) {
    const error = new Error("Ids must be different");
    error.status = 400;
    throw error;
  }

  const [first, second] = await Promise.all([
    HomeHero.findById(firstId),
    HomeHero.findById(secondId),
  ]);

  if (!first || !second) {
    const error = new Error("Home hero not found");
    error.status = 404;
    throw error;
  }

  const firstOrder = first.order ?? 0;
  const secondOrder = second.order ?? 0;

  first.order = secondOrder;
  second.order = firstOrder;

  await Promise.all([first.save(), second.save()]);

  return { first, second };
};

module.exports = {
  createHomeHero,
  listHomeHeroes,
  getHomeHeroById,
  updateHomeHero,
  deleteHomeHero,
  swapHomeHeroOrder,
};
