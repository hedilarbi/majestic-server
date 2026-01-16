const mongoose = require("mongoose");

const layoutCellSchema = new mongoose.Schema(
  {
    row: {
      type: String,
      required: true,
      trim: true,
    },
    col: {
      type: Number,
      required: true,
      min: 1,
    },
    cellType: {
      type: String,
      required: true,
      enum: ["couloir", "chaise"],
    },
  },
  { _id: false }
);

const overrideSchema = new mongoose.Schema(
  {
    row: {
      type: String,
      required: true,
      trim: true,
    },
    col: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ["blocked", "staff"],
    },
  },
  { _id: false }
);

const pricingOverrideSchema = new mongoose.Schema(
  {
    row: {
      type: String,
      required: true,
      trim: true,
    },
    col: {
      type: Number,
      required: true,
      min: 1,
    },
    pricingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pricing",
      required: true,
    },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 0,
    },
    layout: {
      type: [layoutCellSchema],
      default: [],
    },
    overrides: {
      type: [overrideSchema],
      default: [],
    },
    pricingOverrides: {
      type: [pricingOverrideSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
