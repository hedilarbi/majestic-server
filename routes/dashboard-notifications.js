const express = require("express");

const {
  listUnreadDashboardNotifications,
  markDashboardNotificationsRead,
} = require("../controllers/dashboardNotificationController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/",
  requireDashboardPermission("reservation_requests", "list"),
  listUnreadDashboardNotifications,
);
router.patch(
  "/read",
  requireDashboardPermission("reservation_requests", "list"),
  markDashboardNotificationsRead,
);

module.exports = router;
