const express = require("express");
const {
  createReservation,
  cancelReservation,
  getReservationForSession,
  cancelReservationsForSession,
} = require("../controllers/reservationController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/session/:sessionId/me", authenticate, getReservationForSession);
router.delete(
  "/session/:sessionId/me",
  authenticate,
  cancelReservationsForSession
);
router.post("/", authenticate, createReservation);
router.delete("/:reservationId", authenticate, cancelReservation);

module.exports = router;
