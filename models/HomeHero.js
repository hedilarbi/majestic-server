const mongoose = require("mongoose");

const homeHeroSchema = new mongoose.Schema(
  {
    poster: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      min: 1,
    },
    title: {
      type: String,
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HomeHero", homeHeroSchema);
