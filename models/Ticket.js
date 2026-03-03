const crypto = require("crypto");
const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    seat: {
      row: { type: String, required: true },
      col: { type: Number, required: true },
    },
    pricingName: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    qrCodeUrl: {
      type: String,
      default: null,
    },
    isScanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    scannedAt: {
      type: Date,
      default: null,
    },
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

ticketSchema.index({ sessionId: 1, isScanned: 1 });
ticketSchema.index({ userId: 1, createdAt: -1 });

ticketSchema.statics.generateCode = function () {
  return `TK-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
};

ticketSchema.statics.buildQrCodeUrl = function (code) {
  const baseUrl = process.env.QR_CODE_BASE_URL;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/+$/, "")}/${code}`;
};

module.exports = mongoose.model("Ticket", ticketSchema);
