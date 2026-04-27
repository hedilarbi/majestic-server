const mongoose = require("mongoose");

const BlogFormAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "textarea",
        "email",
        "number",
        "radio",
        "checkbox",
        "select",
      ],
    },
    required: {
      type: Boolean,
      default: false,
    },
    value: {
      type: String,
      default: "",
      trim: true,
    },
    values: {
      type: [String],
      default: [],
    },
  },
  {
    _id: false,
    timestamps: false,
  },
);

const BlogFormSubmissionSchema = new mongoose.Schema(
  {
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogContent",
      required: true,
      index: true,
    },
    formTitle: {
      type: String,
      required: true,
      trim: true,
    },
    formSlug: {
      type: String,
      trim: true,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerSnapshot: {
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
        default: "",
      },
    },
    answers: {
      type: [BlogFormAnswerSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

BlogFormSubmissionSchema.index({ formId: 1, createdAt: -1 });
BlogFormSubmissionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("BlogFormSubmission", BlogFormSubmissionSchema);
