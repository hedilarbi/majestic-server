const mongoose = require("mongoose");

const pricingBreakdownSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const actorSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const auditLogSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      required: true,
      enum: ["ticket_cancellation", "ticket_print", "ticket_print_cancelled"],
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorSnapshot: {
      type: actorSnapshotSchema,
      default: () => ({}),
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
      index: true,
    },
    bookingNumber: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    eventName: {
      type: String,
      trim: true,
      default: "",
    },
    sessionDate: {
      type: Date,
      default: null,
    },
    sessionTime: {
      type: String,
      trim: true,
      default: "",
    },
    ticketsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ticketIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Ticket",
      default: [],
    },
    ticketCodes: {
      type: [String],
      default: [],
    },
    seatLabels: {
      type: [String],
      default: [],
    },
    pricingBreakdown: {
      type: [pricingBreakdownSchema],
      default: [],
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1, actionType: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
