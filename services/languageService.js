const mongoose = require("mongoose");

const Language = require("../models/Language");

const createLanguage = async ({ name }) => {
  if (!name) {
    const error = new Error("Name is required");
    error.status = 400;
    throw error;
  }

  const language = await Language.create({ name });
  return language;
};

const listLanguages = async () => {
  return Language.find().sort({ name: 1 });
};

const getLanguageById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid language id");
    error.status = 400;
    throw error;
  }

  const language = await Language.findById(id);
  if (!language) {
    const error = new Error("Language not found");
    error.status = 404;
    throw error;
  }

  return language;
};

const updateLanguage = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid language id");
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

  const language = await Language.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!language) {
    const error = new Error("Language not found");
    error.status = 404;
    throw error;
  }

  return language;
};

const deleteLanguage = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid language id");
    error.status = 400;
    throw error;
  }

  const language = await Language.findByIdAndDelete(id);
  if (!language) {
    const error = new Error("Language not found");
    error.status = 404;
    throw error;
  }

  return language;
};

module.exports = {
  createLanguage,
  listLanguages,
  getLanguageById,
  updateLanguage,
  deleteLanguage,
};
