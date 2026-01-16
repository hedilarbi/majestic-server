const mongoose = require("mongoose");

const Pricing = require("../models/Pricing");

const createPricing = async ({ name, price }) => {
  if (!name || price === undefined || price === null) {
    const error = new Error("Name and price are required");
    error.status = 400;
    throw error;
  }

  const pricing = await Pricing.create({ name, price });
  return pricing;
};

const listPricing = async () => {
  return Pricing.find().sort({ createdAt: -1 });
};

const getPricingById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid pricing id");
    error.status = 400;
    throw error;
  }

  const pricing = await Pricing.findById(id);
  if (!pricing) {
    const error = new Error("Pricing not found");
    error.status = 404;
    throw error;
  }

  return pricing;
};

const updatePricing = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid pricing id");
    error.status = 400;
    throw error;
  }

  const updateData = {};
  if (updates && Object.prototype.hasOwnProperty.call(updates, "name")) {
    updateData.name = updates.name;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "price")) {
    updateData.price = updates.price;
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const pricing = await Pricing.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!pricing) {
    const error = new Error("Pricing not found");
    error.status = 404;
    throw error;
  }

  return pricing;
};

const deletePricing = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid pricing id");
    error.status = 400;
    throw error;
  }

  const pricing = await Pricing.findByIdAndDelete(id);
  if (!pricing) {
    const error = new Error("Pricing not found");
    error.status = 404;
    throw error;
  }

  return pricing;
};

module.exports = {
  createPricing,
  listPricing,
  getPricingById,
  updatePricing,
  deletePricing,
};
