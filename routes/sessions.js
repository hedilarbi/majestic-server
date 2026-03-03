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
const { authenticate, requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.get("/", listSessions);
router.get("/populated", listSessionsPopulatedEveent);
router.get("/by-date", listSessionsByDateGrouped);
router.get("/guichet-sessions", listGuichetSessions);
router.get("/door-staff", authenticate, listDoorStaffSessions);
router.get("/home/:eventId", getSessionHomeByEventId);
router.get("/event/:eventId", getSessionsByEventId);
router.get("/:id", getSession);

router.post("/", requireAdmin, createSession);
router.put("/:id", requireAdmin, updateSession);
router.delete("/:id", requireAdmin, deleteSession);

module.exports = router;
