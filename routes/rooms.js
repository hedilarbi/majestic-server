const express = require("express");

const {
  createRoom,
  listRooms,
  getRoom,
  updateRoom,
  deleteRoom,
} = require("../controllers/roomController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.use(requireAdmin);

router.post("/", createRoom);
router.get("/", listRooms);
router.get("/:id", getRoom);
router.put("/:id", updateRoom);
router.delete("/:id", deleteRoom);

module.exports = router;
