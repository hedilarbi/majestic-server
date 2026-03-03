const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      index: true,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["email_verification", "password_reset"],
      default: "email_verification",
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    resendCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSentAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

emailVerificationSchema.index({ email: 1, createdAt: -1 });
emailVerificationSchema.index({ email: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model("EmailVerification", emailVerificationSchema);
