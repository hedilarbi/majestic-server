const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    reductionValue: {
      type: Number,
      required: true,
      min: 0,
    },
    reductionType: {
      type: String,
      required: true,
      enum: ["amount", "percent"],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    totalUsageLimit: {
      type: Number,
      min: 0,
      default: null,
    },
    userUsageLimit: {
      type: Number,
      min: 0,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    availability: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      index: true,
    },
  },
  { timestamps: true }
);

promoCodeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("PromoCode", promoCodeSchema);
