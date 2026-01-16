const mongoose = require("mongoose");

const sessionTimeSchema = new mongoose.Schema(
  {
    time: {
      type: String,
      required: true,
      trim: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SessionTime", sessionTimeSchema);
