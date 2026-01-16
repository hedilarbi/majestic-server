const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["movie", "show"],
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    poster: {
      type: String,
    },
    trailerLink: {
      type: String,
    },
    duration: {
      type: Number,
      min: 0,
    },
    ageRestriction: {
      type: String,
    },
    genres: {
      type: [String],
      default: [],
    },
    availableVersions: {
      type: [String],
      default: [],
    },
    releaseDate: {
      type: Date,
    },
    directedBy: {
      type: String,
    },
    cast: {
      type: [String],
      default: [],
    },
    availableFrom: {
      type: Date,
    },
    availableTo: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

eventSchema.index({ type: 1, status: 1, availableFrom: 1, availableTo: 1 });
eventSchema.index({ genres: 1 });
eventSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Event", eventSchema);
