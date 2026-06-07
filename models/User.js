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
    guestContact: {
      firstName: {
        type: String,
        trim: true,
        default: "",
      },
      lastName: {
        type: String,
        trim: true,
        default: "",
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },
    },
    role: {
      type: String,
      enum: [
        "customer",
        "admin",
        "super_admin",
        "blog_manager",
        "cashier",
        "ticket_office",
        "door_staff",
        "guest",
      ],
    },
    roleDetails: {
      isActive: {
        type: Boolean,
      },
      permissions: {
        type: [String],
      },
      permissionsConfigured: {
        type: Boolean,
        default: false,
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
UserSchema.index({ "guestContact.email": 1 });

module.exports = mongoose.model("User", UserSchema);
