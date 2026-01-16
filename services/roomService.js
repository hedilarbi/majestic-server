const mongoose = require("mongoose");

const Room = require("../models/Room");

const parseLayout = (layout) => {
  if (layout === undefined) {
    return undefined;
  }

  if (Array.isArray(layout)) {
    return layout;
  }

  if (typeof layout === "string") {
    try {
      const parsed = JSON.parse(layout);
      if (!Array.isArray(parsed)) {
        const error = new Error("Layout must be an array");
        error.status = 400;
        throw error;
      }
      return parsed;
    } catch (error) {
      const parseError = new Error("Layout must be a valid JSON array");
      parseError.status = 400;
      throw parseError;
    }
  }

  const error = new Error("Layout must be an array");
  error.status = 400;
  throw error;
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
        const error = new Error("Overrides must be an array");
        error.status = 400;
        throw error;
      }
      return parsed;
    } catch (error) {
      const parseError = new Error("Overrides must be a valid JSON array");
      parseError.status = 400;
      throw parseError;
    }
  }

  const error = new Error("Overrides must be an array");
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
      const parseError = new Error("pricingOverrides must be a valid JSON array");
      parseError.status = 400;
      throw parseError;
    }
  }

  const error = new Error("pricingOverrides must be an array");
  error.status = 400;
  throw error;
};

const validatePricingOverrides = (pricingOverrides, layout) => {
  if (!Array.isArray(pricingOverrides)) {
    const error = new Error("pricingOverrides must be an array");
    error.status = 400;
    throw error;
  }

  const seatLookup = new Map();
  if (Array.isArray(layout)) {
    layout.forEach((cell) => {
      seatLookup.set(`${cell.row}:${cell.col}`, cell.cellType);
    });
  }

  pricingOverrides.forEach((item) => {
    if (!item || !item.row || !item.col || !item.pricingId) {
      const error = new Error(
        "pricingOverrides requires row, col, and pricingId"
      );
      error.status = 400;
      throw error;
    }

    if (!mongoose.isValidObjectId(item.pricingId)) {
      const error = new Error("Invalid pricingId in pricingOverrides");
      error.status = 400;
      throw error;
    }

    if (seatLookup.size > 0) {
      const cellType = seatLookup.get(`${item.row}:${item.col}`);
      if (!cellType) {
        const error = new Error(
          "pricingOverrides row/col must exist in layout"
        );
        error.status = 400;
        throw error;
      }
      if (cellType !== "chaise") {
        const error = new Error(
          "pricingOverrides can only target chaise cells"
        );
        error.status = 400;
        throw error;
      }
    }
  });
};

const normalizeCapacity = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    const error = new Error("Capacity must be a positive number");
    error.status = 400;
    throw error;
  }

  return parsed;
};

const computeCapacity = (layout) => {
  if (!Array.isArray(layout)) {
    return 0;
  }

  return layout.filter((cell) => cell.cellType === "chaise").length;
};

const createRoom = async ({
  name,
  capacity,
  layout,
  overrides,
  pricingOverrides,
}) => {
  if (!name) {
    const error = new Error("Name is required");
    error.status = 400;
    throw error;
  }

  const parsedLayout = parseLayout(layout);
  if (!parsedLayout || parsedLayout.length === 0) {
    const error = new Error("Layout is required");
    error.status = 400;
    throw error;
  }

  const parsedOverrides = parseOverrides(overrides) || [];
  const parsedPricingOverrides = parsePricingOverrides(pricingOverrides) || [];

  if (parsedPricingOverrides.length > 0) {
    validatePricingOverrides(parsedPricingOverrides, parsedLayout);
  }

  const resolvedCapacity =
    normalizeCapacity(capacity) ?? computeCapacity(parsedLayout);

  const room = await Room.create({
    name,
    capacity: resolvedCapacity,
    layout: parsedLayout,
    overrides: parsedOverrides,
    pricingOverrides: parsedPricingOverrides,
  });

  return room;
};

const listRooms = async () => {
  return Room.find().sort({ createdAt: -1 });
};

const getRoomById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid room id");
    error.status = 400;
    throw error;
  }

  const room = await Room.findById(id);
  if (!room) {
    const error = new Error("Room not found");
    error.status = 404;
    throw error;
  }

  return room;
};

const updateRoom = async (id, updates) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid room id");
    error.status = 400;
    throw error;
  }

  const updateData = {};

  if (updates && Object.prototype.hasOwnProperty.call(updates, "name")) {
    updateData.name = updates.name;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "layout")) {
    updateData.layout = parseLayout(updates.layout);
    if (!Object.prototype.hasOwnProperty.call(updates, "capacity")) {
      updateData.capacity = computeCapacity(updateData.layout);
    }
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "capacity")) {
    updateData.capacity = normalizeCapacity(updates.capacity);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "overrides")) {
    updateData.overrides = parseOverrides(updates.overrides);
  }

  if (
    updates &&
    Object.prototype.hasOwnProperty.call(updates, "pricingOverrides")
  ) {
    updateData.pricingOverrides = parsePricingOverrides(
      updates.pricingOverrides
    );
  }

  if (updateData.pricingOverrides) {
    const layoutForValidation = updateData.layout || updates.layout;
    validatePricingOverrides(updateData.pricingOverrides, layoutForValidation);
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  const room = await Room.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!room) {
    const error = new Error("Room not found");
    error.status = 404;
    throw error;
  }

  return room;
};

const deleteRoom = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid room id");
    error.status = 400;
    throw error;
  }

  const room = await Room.findByIdAndDelete(id);
  if (!room) {
    const error = new Error("Room not found");
    error.status = 404;
    throw error;
  }

  return room;
};

module.exports = {
  createRoom,
  listRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
};
