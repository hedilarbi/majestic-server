const mongoose = require("mongoose");

const pricingLimitSchema = new mongoose.Schema(
  {
    pricingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pricing",
      required: true,
    },
    maxTickets: {
      type: Number,
      required: true,
      min: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
      min: 0,
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
      enum: ["blocked", "staff", "chaise"],
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

const sessionSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    sessionTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    roomId: {
      type: String,
      required: true,
      trim: true,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 0,
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 0,
    },
    overrides: {
      type: [overrideSchema],
      default: [],
    },
    pricingOverrides: {
      type: [pricingOverrideSchema],
      default: [],
    },
    pricingLimits: {
      type: [pricingLimitSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled", "pending"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ eventId: 1, date: 1 });
sessionSchema.index({ date: 1, status: 1 });
sessionSchema.index({ status: 1 });

module.exports = mongoose.model("Session", sessionSchema);
