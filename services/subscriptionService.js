const mongoose = require("mongoose");

const Subscription = require("../models/Subscription");

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

const createSubscription = async ({
  name,
  price,
  totalCredits,
  expirationDate,
  description,
  isActive,
  validityDays,
  allowedSeatType,
  maxSeatsPerSession,
}) => {
  if (!name || !name.trim()) {
    const error = new Error(
      "Name, price, totalCredits, and expirationDate are required",
    );
    error.status = 400;
    throw error;
  }

  const normalizedPrice = normalizeNumber(price);
  const normalizedCredits = normalizeNumber(totalCredits);
  const normalizedExpiration = normalizeDate(expirationDate);

  if (
    normalizedPrice === undefined ||
    normalizedPrice === null ||
    normalizedPrice === "" ||
    typeof normalizedPrice !== "number" ||
    normalizedCredits === undefined ||
    normalizedCredits === null ||
    normalizedCredits === "" ||
    typeof normalizedCredits !== "number" ||
    !(normalizedExpiration instanceof Date)
  ) {
    const error = new Error(
      "Name, price, totalCredits, and expirationDate are required",
    );
    error.status = 400;
    throw error;
  }

  const normalizedValidityDays = normalizeNumber(validityDays);
  const subscription = await Subscription.create({
    name,
    price: normalizedPrice,
    totalCredits: normalizedCredits,
    expirationDate: normalizedExpiration,
    description,
    isActive,
    ...(Number.isFinite(normalizedValidityDays) && normalizedValidityDays > 0 ? { validityDays: normalizedValidityDays } : {}),
    ...(allowedSeatType ? { allowedSeatType } : {}),
    ...(Number.isFinite(normalizeNumber(maxSeatsPerSession)) ? { maxSeatsPerSession: normalizeNumber(maxSeatsPerSession) } : {}),
  });

  return subscription;
};

const listSubscriptions = async () => {
  return Subscription.find().sort({ createdAt: -1 });
};

const getSubscriptionById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid subscription id");
    error.status = 400;
    throw error;
  }

  const subscription = await Subscription.findById(id);
  if (!subscription) {
    const error = new Error("Subscription not found");
    error.status = 404;
    throw error;
  }

  return subscription;
};

const updateSubscription = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid subscription id");
    error.status = 400;
    throw error;
  }

  const updateData = {};
  if (updates && Object.prototype.hasOwnProperty.call(updates, "name")) {
    updateData.name = updates.name;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "price")) {
    updateData.price = normalizeNumber(updates.price);
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "totalCredits")) {
    updateData.totalCredits = normalizeNumber(updates.totalCredits);
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "expirationDate")) {
    updateData.expirationDate = normalizeDate(updates.expirationDate);
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "description")) {
    updateData.description = updates.description;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "isActive")) {
    updateData.isActive = updates.isActive;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "allowedSeatType")) {
    updateData.allowedSeatType = updates.allowedSeatType;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "maxSeatsPerSession")) {
    updateData.maxSeatsPerSession = normalizeNumber(updates.maxSeatsPerSession);
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "validityDays")) {
    const days = normalizeNumber(updates.validityDays);
    updateData.validityDays = days === "" || days === null ? undefined : days;
  }

  if (
    Object.prototype.hasOwnProperty.call(updateData, "expirationDate") &&
    !(updateData.expirationDate instanceof Date)
  ) {
    const error = new Error("Invalid expirationDate");
    error.status = 400;
    throw error;
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const subscription = await Subscription.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!subscription) {
    const error = new Error("Subscription not found");
    error.status = 404;
    throw error;
  }

  return subscription;
};

const deleteSubscription = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid subscription id");
    error.status = 400;
    throw error;
  }

  const subscription = await Subscription.findByIdAndDelete(id);
  if (!subscription) {
    const error = new Error("Subscription not found");
    error.status = 404;
    throw error;
  }

  return subscription;
};

module.exports = {
  createSubscription,
  listSubscriptions,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
};
