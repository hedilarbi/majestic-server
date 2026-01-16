const mongoose = require("mongoose");

const ShowType = require("../models/ShowType");

const createShowType = async ({ name }) => {
  if (!name) {
    const error = new Error("Name is required");
    error.status = 400;
    throw error;
  }

  const showType = await ShowType.create({ name });
  return showType;
};

const listShowTypes = async () => {
  return ShowType.find().sort({ name: 1 });
};

const getShowTypeById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid show type id");
    error.status = 400;
    throw error;
  }

  const showType = await ShowType.findById(id);
  if (!showType) {
    const error = new Error("Show type not found");
    error.status = 404;
    throw error;
  }

  return showType;
};

const updateShowType = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid show type id");
    error.status = 400;
    throw error;
  }

  const updateData = {};
  if (updates && Object.prototype.hasOwnProperty.call(updates, "name")) {
    updateData.name = updates.name;
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const showType = await ShowType.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!showType) {
    const error = new Error("Show type not found");
    error.status = 404;
    throw error;
  }

  return showType;
};

const deleteShowType = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid show type id");
    error.status = 400;
    throw error;
  }

  const showType = await ShowType.findByIdAndDelete(id);
  if (!showType) {
    const error = new Error("Show type not found");
    error.status = 404;
    throw error;
  }

  return showType;
};

module.exports = {
  createShowType,
  listShowTypes,
  getShowTypeById,
  updateShowType,
  deleteShowType,
};
