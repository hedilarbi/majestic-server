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
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/home", getHomeContent);
router.get("/with-a-laffiche", getEventsWithALAffiche);

router.use(requireAdmin);

router.post("/", upload.single("poster"), createEvent);
router.get("/", listEvents);
router.get("/:id", getEvent);
router.put("/:id", upload.single("poster"), updateEvent);
router.delete("/:id", deleteEvent);

module.exports = router;
