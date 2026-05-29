const mongoose = require("mongoose");

require("./Ticket");

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
    },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    customerContact: {
      type: customerContactSchema,
      default: undefined,
    },
    seats: {
      type: [
        {
          row: { type: String, required: true },
          col: { type: Number, required: true },
          _id: false,
        },
      ],
      required: true,
    },
    tickets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ticket",
        },
      ],
      default: [],
    },
    ticketItems: {
      type: [
        {
          seat: {
            row: { type: String, required: true },
            col: { type: Number, required: true },
          },
          pricingName: {
            type: String,
            required: true,
          },
          price: {
            type: Number,
            required: true,
            min: 0,
          },
          _id: false,
        },
      ],
      default: [],
      select: false,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cash", "card", "subscription"],
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
      gateway: String, // 'stripe', 'paypal', etc.
    },
    promotion: {
      code: {
        type: String,
        trim: true,
        uppercase: true,
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
      amountBeforeDiscount: {
        type: Number,
        min: 0,
      },
    },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingSource: {
      type: String,
      enum: ["web", "mobile", "ticket_office"],
      required: true,
      index: true,
    },
    subscriptionTransaction: {
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
      },
      subscriptionSaleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionSale",
      },
      subscriptionCode: {
        type: String,
        trim: true,
        uppercase: true,
      },
      creditsUsed: {
        type: Number,
        min: 0,
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "used", "refunded"],
      default: "confirmed",
      index: true,
    },
    printCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// ====== INDEXES ======
bookingSchema.index({ sessionId: 1, status: 1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ bookedBy: 1, bookingSource: 1 });
bookingSchema.index({ createdAt: 1 });

// ====== MÉTHODES STATIQUES ======

// Générer un numéro de booking unique
bookingSchema.statics.generateBookingNumber = function () {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  return `BK-${year}${month}${day}-${random}`;
};

// ====== HOOKS ======

// Avant validation, générer bookingNumber si nouveau
bookingSchema.pre("validate", async function () {
  if (!this.isNew || this.bookingNumber) {
    return;
  }

  let attempts = 0;
  let isUnique = false;
  const session = this.$session ? this.$session() : null;

  while (!isUnique && attempts < 10) {
    this.bookingNumber = this.constructor.generateBookingNumber();
    const query = this.constructor.findOne({
      bookingNumber: this.bookingNumber,
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
    throw new Error("Unable to generate unique booking number");
  }
});

// Après création, mettre à jour la session et créer les tickets
bookingSchema.post("save", async function (doc) {
  if (doc.status === "confirmed") {
    // Mettre à jour availableSeats dans la session
    const Session = mongoose.model("Session");
    await Session.findByIdAndUpdate(doc.sessionId, {
      $inc: { availableSeats: -doc.seats.length },
    });

    const ticketItems = Array.isArray(doc.ticketItems) ? doc.ticketItems : [];

    // Mettre à jour les pricingLimits
    for (const ticket of ticketItems) {
      await Session.updateOne(
        {
          _id: doc.sessionId,
          "pricingLimits.name": ticket.pricingName,
          "pricingLimits.price": ticket.price,
        },
        {
          $inc: { "pricingLimits.$.soldCount": 1 },
        },
      );
    }

    // Créer les tickets et stocker les ids dans Booking.tickets
    if (ticketItems.length > 0 && mongoose.models.Ticket) {
      const Ticket = mongoose.model("Ticket");
      const ticketsToCreate = ticketItems.map((ticket) => {
        const code = Ticket.generateCode();
        return {
          bookingId: doc._id,
          sessionId: doc.sessionId,
          userId: doc.userId || null,
          seat: ticket.seat,
          pricingName: ticket.pricingName,
          price: ticket.price,
          code,
          qrCodeUrl: Ticket.buildQrCodeUrl(code),
          isScanned: false,
        };
      });

      const createdTickets = await Ticket.insertMany(ticketsToCreate);
      const ticketIds = createdTickets.map((ticket) => ticket._id);

      await doc.constructor.updateOne(
        { _id: doc._id },
        { $set: { tickets: ticketIds }, $unset: { ticketItems: 1 } },
      );
    }
  }
});

module.exports = mongoose.model("Booking", bookingSchema);
