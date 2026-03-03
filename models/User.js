const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      index: true,
      unique: true,
    },
    password: {
      type: String,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    phone: {
      type: String,
    },
    role: {
      type: String,
      enum: ["customer", "admin", "ticket_office", "door_staff", "guest"],
    },
    roleDetails: {
      isActive: {
        type: Boolean,
      },
      permissions: {
        type: [String],
      },
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
    },
    expiredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

UserSchema.index({ role: 1, "roleDetails.isActive": 1 });

module.exports = mongoose.model("User", UserSchema);
