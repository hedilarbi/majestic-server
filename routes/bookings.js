const express = require("express");
const {
  cancelBookingTickets,
  createBooking,
  exportBookings,
  getBookingById,
  listBookings,
  listMyBookings,
} = require("../controllers/bookingController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.post("/", authenticate, createBooking);
router.get("/", authenticate, listBookings);
router.get("/me", authenticate, listMyBookings);
router.get("/export/:format", authenticate, exportBookings);
router.post("/:bookingId/cancel", authenticate, cancelBookingTickets);
router.post("/:bookingId/print", authenticate, (req, res) => {
  const { trackPrint } = require("../controllers/bookingController");
  return trackPrint(req, res);
});
router.post("/:bookingId/print-cancelled", authenticate, (req, res) => {
  const { trackPrintCancelled } = require("../controllers/bookingController");
  return trackPrintCancelled(req, res);
});
router.get("/:bookingId", authenticate, getBookingById);

module.exports = router;
