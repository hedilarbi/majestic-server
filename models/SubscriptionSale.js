const mongoose = require("mongoose");

const MAX_NAME_SEGMENT_LENGTH = 54;

const sanitizeCodeNamePart = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .trim();
};

const buildSubscriptionCustomerCodeLabel = (contact) => {
  if (!contact || typeof contact !== "object") {
    return "CLIENT";
  }

  const lastName = sanitizeCodeNamePart(contact.lastName);
  const firstName = sanitizeCodeNamePart(contact.firstName);
  const combined = `${lastName}${firstName}`.slice(0, MAX_NAME_SEGMENT_LENGTH);

  return combined || "CLIENT";
};

const customerContactSchema = new mongoose.Schema(
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
      index: true,
    },
  },
  { _id: false },
);

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
      index: true,
      default: null,
    },
    customerContact: {
      type: customerContactSchema,
      default: undefined,
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
    paymentDetails: {
      transactionId: String,
      paidAt: Date,
      gateway: String,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "refunded"],
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
    allowedSeatType: {
      type: String,
      enum: ["normale", "tarif_fixe"],
      default: "normale",
    },
    maxSeatsPerSession: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true },
);

subscriptionSaleSchema.statics.generateSubscriptionCode = function (
  customerContact,
) {
  const customerLabel = buildSubscriptionCustomerCodeLabel(customerContact);
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");

  return `AB-${customerLabel}-${random}`;
};

subscriptionSaleSchema.pre("validate", async function () {
  if (!this.isNew || this.subscriptionCode) {
    return;
  }

  let attempts = 0;
  let isUnique = false;
  const session = this.$session ? this.$session() : null;

  while (!isUnique && attempts < 10) {
    this.subscriptionCode = this.constructor.generateSubscriptionCode(
      this.customerContact,
    );
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
subscriptionSaleSchema.index({ "customerContact.email": 1, createdAt: -1 });

module.exports = mongoose.model("SubscriptionSale", subscriptionSaleSchema);
