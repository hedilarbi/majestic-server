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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

subscriptionSchema.index({ isActive: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
