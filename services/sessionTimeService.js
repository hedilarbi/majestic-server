const mongoose = require("mongoose");

const SessionTime = require("../models/SessionTime");

const createSessionTime = async ({ time }) => {
  if (!time) {
    const error = new Error("Time is required");
    error.status = 400;
    throw error;
  }

  const sessionTime = await SessionTime.create({ time });
  return sessionTime;
};

const listSessionTimes = async () => {
  return SessionTime.find().sort({ time: 1 });
};

const getSessionTimeById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session time id");
    error.status = 400;
    throw error;
  }

  const sessionTime = await SessionTime.findById(id);
  if (!sessionTime) {
    const error = new Error("Session time not found");
    error.status = 404;
    throw error;
  }

  return sessionTime;
};

const updateSessionTime = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session time id");
    error.status = 400;
    throw error;
  }

  const updateData = {};
  if (updates && Object.prototype.hasOwnProperty.call(updates, "time")) {
    updateData.time = updates.time;
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const sessionTime = await SessionTime.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!sessionTime) {
    const error = new Error("Session time not found");
    error.status = 404;
    throw error;
  }

  return sessionTime;
};

const deleteSessionTime = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid session time id");
    error.status = 400;
    throw error;
  }

  const sessionTime = await SessionTime.findByIdAndDelete(id);
  if (!sessionTime) {
    const error = new Error("Session time not found");
    error.status = 404;
    throw error;
  }

  return sessionTime;
};

module.exports = {
  createSessionTime,
  listSessionTimes,
  getSessionTimeById,
  updateSessionTime,
  deleteSessionTime,
};
