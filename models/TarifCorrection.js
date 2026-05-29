const mongoose = require("mongoose");

const tarifCorrectionSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    ticketOfficeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seat: {
      row: { type: String, required: true },
      col: { type: Number, required: true },
    },
    oldPricingName: { type: String, required: true, trim: true },
    oldPrice: { type: Number, required: true, min: 0 },
    newPricingName: { type: String, required: true, trim: true },
    newPrice: { type: Number, required: true, min: 0 },
    priceDifference: { type: Number, required: true }, // newPrice - oldPrice
    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      default: "cash",
    },
  },
  { timestamps: true },
);

tarifCorrectionSchema.index({ ticketOfficeId: 1, createdAt: -1 });
tarifCorrectionSchema.index({ sessionId: 1, ticketOfficeId: 1 });

module.exports = mongoose.model("TarifCorrection", tarifCorrectionSchema);
