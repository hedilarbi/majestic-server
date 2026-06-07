const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    imageAspect: {
      type: String,
      enum: ["vertical", "horizontal"],
      default: "horizontal",
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

partnerSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model("Partner", partnerSchema);
