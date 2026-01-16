const mongoose = require("mongoose");

const ALAffiche = require("../models/ALAffiche");
const { uploadImage } = require("./firebaseStorageService");

const normalizePayload = (payload) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "eventId")) {
    data.eventId = payload.eventId;
  }

  return data;
};

const createALaffiche = async ({ payload, file }) => {
  const data = normalizePayload(payload || {});

  if (!data.eventId) {
    const error = new Error("eventId is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.isValidObjectId(data.eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  if (!file) {
    const error = new Error("Poster image is required");
    error.status = 400;
    throw error;
  }

  const upload = await uploadImage(file, { folder: "a-laffiche" });
  data.poster = upload.url;

  const item = await ALAffiche.create(data);
  return item;
};

const listALaffiches = async () => {
  return ALAffiche.find()
    .populate("eventId")
    .sort({ createdAt: -1 });
};

const getALafficheById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid a l'affiche id");
    error.status = 400;
    throw error;
  }

  const item = await ALAffiche.findById(id).populate("eventId");
  if (!item) {
    const error = new Error("A l'affiche not found");
    error.status = 404;
    throw error;
  }

  return item;
};

const updateALaffiche = async (id, { payload, file }) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid a l'affiche id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});

  if (data.eventId && !mongoose.isValidObjectId(data.eventId)) {
    const error = new Error("Invalid event id");
    error.status = 400;
    throw error;
  }

  if (file) {
    const upload = await uploadImage(file, { folder: "a-laffiche" });
    data.poster = upload.url;
  }

  if (Object.keys(data).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const item = await ALAffiche.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!item) {
    const error = new Error("A l'affiche not found");
    error.status = 404;
    throw error;
  }

  return item;
};

const deleteALaffiche = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid a l'affiche id");
    error.status = 400;
    throw error;
  }

  const item = await ALAffiche.findByIdAndDelete(id);
  if (!item) {
    const error = new Error("A l'affiche not found");
    error.status = 404;
    throw error;
  }

  return item;
};

module.exports = {
  createALaffiche,
  listALaffiches,
  getALafficheById,
  updateALaffiche,
  deleteALaffiche,
};
