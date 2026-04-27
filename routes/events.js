const express = require("express");
const multer = require("multer");

const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  getHomeContent,
  getEventsWithALAffiche,
} = require("../controllers/eventController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/home", getHomeContent);
router.get("/with-a-laffiche", getEventsWithALAffiche);

router.get("/", requireDashboardPermission("events", "list"), listEvents);
router.get("/:id", requireDashboardPermission("events", "list"), getEvent);
router.post(
  "/",
  requireDashboardPermission("events", "create"),
  upload.single("poster"),
  createEvent,
);
router.put(
  "/:id",
  requireDashboardPermission("events", "update"),
  upload.single("poster"),
  updateEvent,
);
router.delete("/:id", requireDashboardPermission("events", "delete"), deleteEvent);

module.exports = router;
