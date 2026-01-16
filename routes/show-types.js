const express = require("express");

const {
  createShowType,
  listShowTypes,
  getShowType,
  updateShowType,
  deleteShowType,
} = require("../controllers/showTypeController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.get("/", listShowTypes);
router.get("/:id", getShowType);

router.post("/", requireAdmin, createShowType);
router.put("/:id", requireAdmin, updateShowType);
router.delete("/:id", requireAdmin, deleteShowType);

module.exports = router;
