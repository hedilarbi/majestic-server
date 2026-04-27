const mongoose = require("mongoose");

const BlogQuestionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["text", "textarea", "email", "number", "radio", "checkbox", "select"],
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      trim: true,
    },
    helpText: {
      type: String,
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
  },
  {
    _id: true,
    timestamps: false,
  },
);

const BlogContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["article", "trailer", "form"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    excerpt: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    contentHtml: {
      type: String,
      default: "",
    },
    videoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnail: {
      type: String,
      trim: true,
      default: "",
    },
    formDescription: {
      type: String,
      trim: true,
      default: "",
    },
    questions: {
      type: [BlogQuestionSchema],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("BlogContent", BlogContentSchema);
