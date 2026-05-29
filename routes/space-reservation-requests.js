const express = require("express");

const {
  createSpaceReservationRequest,
  deleteSpaceReservationRequest,
  getSpaceReservationRequest,
  listSpaceReservationRequests,
  markSpaceReservationRequestProcessed,
  replyToSpaceReservationRequest,
} = require("../controllers/spaceReservationRequestController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.post("/", createSpaceReservationRequest);
router.get(
  "/",
  requireDashboardPermission("reservation_requests", "list"),
  listSpaceReservationRequests,
);
router.get(
  "/:id",
  requireDashboardPermission("reservation_requests", "list"),
  getSpaceReservationRequest,
);
router.patch(
  "/:id/processed",
  requireDashboardPermission("reservation_requests", "update"),
  markSpaceReservationRequestProcessed,
);
router.post(
  "/:id/reply",
  requireDashboardPermission("reservation_requests", "update"),
  replyToSpaceReservationRequest,
);
router.delete(
  "/:id",
  requireDashboardPermission("reservation_requests", "delete"),
  deleteSpaceReservationRequest,
);

module.exports = router;
