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

const customerContactSnapshotSchema = new mongoose.Schema(
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

const promotionSnapshotSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    reductionType: {
      type: String,
      enum: ["amount", "percent"],
    },
    reductionValue: {
      type: Number,
      min: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
    },
  },
  { _id: false },
);

const tariffBreakdownSchema = new mongoose.Schema(
  {
    pricingName: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      min: 0,
      default: 0,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const transactionSessionSnapshotSchema = new mongoose.Schema(
  {
    eventName: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      default: null,
    },
    sessionTime: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const transactionSummarySchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    bookingNumber: {
      type: String,
      trim: true,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
    totalAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cash", "card", "subscription"],
      required: true,
    },
    ticketCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    usedSubscription: {
      type: Boolean,
      default: false,
    },
    promotion: {
      type: promotionSnapshotSchema,
      default: null,
    },
    tariffBreakdown: {
      type: [tariffBreakdownSchema],
      default: [],
    },
    session: {
      type: transactionSessionSnapshotSchema,
      default: null,
    },
  },
  { _id: false },
);

const subscriptionSaleSummarySchema = new mongoose.Schema(
  {
    subscriptionSaleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionSale",
      required: true,
    },
    subscriptionCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
    totalAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cash", "card"],
      required: true,
    },
    subscriptionName: {
      type: String,
      trim: true,
      default: "",
    },
    totalCredits: {
      type: Number,
      min: 0,
      default: 0,
    },
    customerContact: {
      type: customerContactSnapshotSchema,
      default: null,
    },
  },
  { _id: false },
);

const cashRegisterClosureSchema = new mongoose.Schema(
  {
    ticketOfficeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ticketOfficeSnapshot: {
      type: staffSnapshotSchema,
      required: true,
    },
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
    transactions: {
      type: [transactionSummarySchema],
      default: [],
    },
    subscriptionSales: {
      type: [subscriptionSaleSummarySchema],
      default: [],
    },
  },
  { timestamps: true },
);

cashRegisterClosureSchema.index(
  { ticketOfficeId: 1, periodStartAt: 1 },
  { unique: true },
);

module.exports = mongoose.model("CashRegisterClosure", cashRegisterClosureSchema);
