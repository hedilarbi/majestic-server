const express = require("express");

const {
  createRoom,
  listRooms,
  getRoom,
  updateRoom,
  deleteRoom,
} = require("../controllers/roomController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("rooms", "list"), listRooms);
router.get("/:id", requireDashboardPermission("rooms", "list"), getRoom);
router.post("/", requireDashboardPermission("rooms", "create"), createRoom);
router.put("/:id", requireDashboardPermission("rooms", "update"), updateRoom);
router.delete("/:id", requireDashboardPermission("rooms", "delete"), deleteRoom);

module.exports = router;
