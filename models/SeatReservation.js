const mongoose = require("mongoose");

const seatReservationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seats: {
      type: [
        {
          row: { type: String, required: true },
          col: { type: Number, required: true },
          pricingOverrideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Pricing",
            default: null,
          },
          _id: false,
        },
      ],
      required: true,
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one seat is required",
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

seatReservationSchema.index({ sessionId: 1, status: 1 });
seatReservationSchema.index({ userId: 1, status: 1, createdAt: -1 });
seatReservationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "pending" },
  }
);

module.exports = mongoose.model("SeatReservation", seatReservationSchema);
