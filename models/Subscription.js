const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCredits: {
      type: Number,
      required: true,
      min: 0,
    },
    expirationDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    validityDays: {
      type: Number,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    allowedSeatType: {
      type: String,
      enum: ["normale", "tarif_fixe"],
      default: "normale",
    },
    maxSeatsPerSession: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true },
);

subscriptionSchema.index({ isActive: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
