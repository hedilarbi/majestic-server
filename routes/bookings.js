const express = require("express");
const {
  createBooking,
  getBookingById,
  listBookings,
  listMyBookings,
} = require("../controllers/bookingController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.post("/", authenticate, createBooking);
router.get("/", authenticate, listBookings);
router.get("/me", authenticate, listMyBookings);
router.get("/:bookingId", authenticate, getBookingById);

module.exports = router;
