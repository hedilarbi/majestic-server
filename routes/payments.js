const express = require("express");
const { verifyPayment } = require("../services/paymentService");
const Booking = require("../models/Booking");
const SubscriptionSale = require("../models/SubscriptionSale");
const SeatReservation = require("../models/SeatReservation");
const SeatLock = require("../models/SeatLock");
const { enqueueSubscriptionSaleEmail } = require("../services/subscriptionSaleDeliveryService");
const { enqueueBookingTicketEmail } = require("../services/ticketDeliveryService");

const router = express.Router();

router.post("/verify", async (req, res) => {
  const { orderId } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ message: "orderId manquant." });
  }

  try {
    const verification = await verifyPayment({ orderId });
    
    // Rechercher la commande associée (Booking ou SubscriptionSale)
    let entity = await Booking.findOne({ "paymentDetails.transactionId": orderId }).select("+ticketItems");
    let type = "booking";
    
    if (!entity) {
      entity = await SubscriptionSale.findOne({ "paymentDetails.transactionId": orderId });
      type = "subscription";
    }

    if (!entity) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    // Si le paiement est déjà traité (pour éviter les doubles traitements)
    if (entity.paymentStatus === "completed" || entity.paymentStatus === "failed") {
      if (entity.paymentStatus === "completed") {
        try {
          if (type === "booking") {
            enqueueBookingTicketEmail({ bookingId: entity._id });
          } else if (type === "subscription") {
            enqueueSubscriptionSaleEmail({ saleId: entity._id });
          }
        } catch (error) {
          console.error("[payments] Erreur lors de la relance de l'email:", error);
        }
      }

      return res.status(200).json({ 
        status: entity.paymentStatus, 
        message: "Paiement déjà traité.",
        type,
        seanceId: entity.sessionId,
        bookingId: type === "booking" ? entity._id : null,
        saleId: type === "subscription" ? entity._id : null,
      });
    }

    if (verification.isSuccess) {
      // --- PAIEMENT RÉUSSI ---
      entity.paymentStatus = "completed";
      entity.status = "confirmed";
      entity.paymentDetails.paidAt = new Date();

      await entity.save(); // Booking générera les tickets via son hook pre/post-save

      if (type === "booking") {
        // Nettoyer SeatReservation et SeatLock puisque c'est confirmé
        await SeatLock.deleteMany({
          sessionId: entity.sessionId,
          reservedBy: entity.bookedBy,
        });

        await SeatReservation.deleteMany({
          sessionId: entity.sessionId,
          userId: entity.bookedBy,
        });

        // Notifier via websocket
        if (req.io) {
          req.io.to(`session-${entity.sessionId}`).emit("seats-booked", {
            seats: entity.seats,
            userId: String(entity.bookedBy),
          });
        }

        // Envoi de l'email pour le booking
        try {
          enqueueBookingTicketEmail({ bookingId: entity._id });
        } catch (error) {
          console.error("[payments] Erreur lors de l'envoi de l'email de billets:", error);
        }
      } else if (type === "subscription") {
        // Envoi de l'email pour l'abonnement
        try {
          enqueueSubscriptionSaleEmail({ saleId: entity._id });
        } catch (error) {
          console.error("[payments] Erreur lors de l'envoi de l'email d'abonnement:", error);
        }
      }

      return res.status(200).json({ 
        status: "completed",
        type: type,
        seanceId: entity.sessionId,
        bookingId: entity._id
      });
    } else {
      // --- PAIEMENT ÉCHOUÉ ---
      entity.paymentStatus = "failed";
      entity.status = "cancelled";
      
      await entity.save();

      return res.status(400).json({ 
        status: "failed", 
        message: verification.actionCodeDescription || "Le paiement a échoué.",
        seanceId: entity.sessionId
      });
    }
  } catch (error) {
    console.error("[payments] verify error:", error);
    return res.status(500).json({ message: "Erreur lors de la vérification du paiement." });
  }
});

module.exports = router;
