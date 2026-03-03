const mongoose = require("mongoose");

const seatLockSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
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
    reservedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

seatLockSchema.index({ sessionId: 1, row: 1, col: 1 }, { unique: true });
seatLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SeatLock", seatLockSchema);
