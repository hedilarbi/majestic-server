const express = require("express");

const {
  createSessionTime,
  listSessionTimes,
  getSessionTime,
  updateSessionTime,
  deleteSessionTime,
} = require("../controllers/sessionTimeController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.use(requireAdmin);

router.post("/", createSessionTime);
router.get("/", listSessionTimes);
router.get("/:id", getSessionTime);
router.put("/:id", updateSessionTime);
router.delete("/:id", deleteSessionTime);

module.exports = router;
