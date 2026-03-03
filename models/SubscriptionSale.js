const mongoose = require("mongoose");

const subscriptionSaleSchema = new mongoose.Schema(
  {
    subscriptionCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: { unique: true, sparse: true },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCredits: {
      type: Number,
      required: true,
      min: 0,
    },
    usedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingCredits: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cash", "card"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "refunded"],
      default: "confirmed",
      index: true,
    },
    soldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["web", "mobile", "ticket_office"],
      required: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

subscriptionSaleSchema.statics.generateSubscriptionCode = function () {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");

  return `SUB-${year}${month}${day}-${random}`;
};

subscriptionSaleSchema.pre("validate", async function () {
  if (!this.isNew || this.subscriptionCode) {
    return;
  }

  let attempts = 0;
  let isUnique = false;
  const session = this.$session ? this.$session() : null;

  while (!isUnique && attempts < 10) {
    this.subscriptionCode = this.constructor.generateSubscriptionCode();
    const query = this.constructor.findOne({
      subscriptionCode: this.subscriptionCode,
    });
    if (session) {
      query.session(session);
    }
    const existing = await query;
    if (!existing) {
      isUnique = true;
    }
    attempts += 1;
  }

  if (!isUnique) {
    throw new Error("Unable to generate unique subscription code");
  }
});

subscriptionSaleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SubscriptionSale", subscriptionSaleSchema);
