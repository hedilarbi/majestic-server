const express = require("express");

const {
  createSessionTime,
  listSessionTimes,
  getSessionTime,
  updateSessionTime,
  deleteSessionTime,
} = require("../controllers/sessionTimeController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("session_times", "list"), listSessionTimes);
router.get(
  "/:id",
  requireDashboardPermission("session_times", "list"),
  getSessionTime,
);
router.post(
  "/",
  requireDashboardPermission("session_times", "create"),
  createSessionTime,
);
router.put(
  "/:id",
  requireDashboardPermission("session_times", "update"),
  updateSessionTime,
);
router.delete(
  "/:id",
  requireDashboardPermission("session_times", "delete"),
  deleteSessionTime,
);

module.exports = router;
