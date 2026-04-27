const mongoose = require("mongoose");

const staffSnapshotSchema = new mongoose.Schema(
  {
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
  { _id: false },
);

const transferSummarySchema = new mongoose.Schema(
  {
    cashRegisterClosureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashRegisterClosure",
      required: true,
    },
    ticketOfficeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ticketOfficeSnapshot: {
      type: staffSnapshotSchema,
      required: true,
    },
    periodStartAt: {
      type: Date,
      required: true,
    },
    periodEndAt: {
      type: Date,
      required: true,
    },
    closedAt: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    bookingCount: {
      type: Number,
      required: true,
      min: 0,
    },
    ticketCount: {
      type: Number,
      required: true,
      min: 0,
    },
    subscriptionSaleCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const cashierRegisterClosureSchema = new mongoose.Schema(
  {
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cashierSnapshot: {
      type: staffSnapshotSchema,
      required: true,
    },
    closedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    closedBySnapshot: {
      type: staffSnapshotSchema,
      required: true,
    },
    periodStartAt: {
      type: Date,
      required: true,
    },
    periodEndAt: {
      type: Date,
      required: true,
      index: true,
    },
    closedAt: {
      type: Date,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    transferCount: {
      type: Number,
      required: true,
      min: 0,
    },
    bookingCount: {
      type: Number,
      required: true,
      min: 0,
    },
    ticketCount: {
      type: Number,
      required: true,
      min: 0,
    },
    subscriptionSaleCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    transfers: {
      type: [transferSummarySchema],
      default: [],
    },
  },
  { timestamps: true },
);

cashierRegisterClosureSchema.index(
  { cashierId: 1, periodStartAt: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  "CashierRegisterClosure",
  cashierRegisterClosureSchema,
);
