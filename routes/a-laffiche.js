const express = require("express");
const multer = require("multer");

const {
  createALaffiche,
  listALaffiches,
  getALaffiche,
  updateALaffiche,
  deleteALaffiche,
} = require("../controllers/aLafficheController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", listALaffiches);
router.get("/:id", getALaffiche);

router.post("/", requireAdmin, upload.single("poster"), createALaffiche);
router.put("/:id", requireAdmin, upload.single("poster"), updateALaffiche);
router.delete("/:id", requireAdmin, deleteALaffiche);

module.exports = router;
