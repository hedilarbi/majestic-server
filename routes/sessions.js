const express = require("express");

const {
  createSession,
  listSessions,
  listSessionsPopulatedEveent,
  getSession,
  getSessionsByEventId,
  getSessionHomeByEventId,
  listSessionsByDateGrouped,
  listGuichetSessions,
  listDoorStaffSessions,
  updateSession,
  deleteSession,
} = require("../controllers/sessionController");
const {
  authenticate,
  requireDashboardPermission,
} = require("../middlewares/auth");

const router = express.Router();

router.get("/", listSessions);
router.get(
  "/populated",
  requireDashboardPermission("sessions", "list"),
  listSessionsPopulatedEveent,
);
router.get("/by-date", listSessionsByDateGrouped);
router.get("/guichet-sessions", listGuichetSessions);
router.get("/door-staff", authenticate, listDoorStaffSessions);
router.get("/home/:eventId", getSessionHomeByEventId);
router.get(
  "/event/:eventId",
  requireDashboardPermission("sessions", "list"),
  getSessionsByEventId,
);
router.get("/:id", getSession);

router.post("/", requireDashboardPermission("sessions", "create"), createSession);
router.put("/:id", requireDashboardPermission("sessions", "update"), updateSession);
router.delete(
  "/:id",
  requireDashboardPermission("sessions", "delete"),
  deleteSession,
);

module.exports = router;
