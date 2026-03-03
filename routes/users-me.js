const express = require("express");

const {
  getUserMe,
  listMyBookings,
  listMyTickets,
  downloadMyTicketPdf,
  listMySubscriptionSales,
  getMySubscriptionSaleById,
  listMyPayments,
} = require("../controllers/userController");
const { authenticate } = require("../middlewares/auth");
const router = express.Router();

router.get("/me", authenticate, getUserMe);
router.get("/me/bookings", authenticate, listMyBookings);
router.get("/me/tickets", authenticate, listMyTickets);
router.get("/me/tickets/:ticketId/pdf", authenticate, downloadMyTicketPdf);
router.get("/me/subscription-sales", authenticate, listMySubscriptionSales);
router.get(
  "/me/subscription-sales/:saleId",
  authenticate,
  getMySubscriptionSaleById,
);
router.get("/me/payments", authenticate, listMyPayments);

module.exports = router;
