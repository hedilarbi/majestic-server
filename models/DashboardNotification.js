const mongoose = require("mongoose");

const dashboardNotificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      default: "dashboard",
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      default: "",
      trim: true,
    },
    entityType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readBy: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

dashboardNotificationSchema.index({ audience: 1, createdAt: -1 });

module.exports = mongoose.model(
  "DashboardNotification",
  dashboardNotificationSchema,
);
