const express = require("express");
const multer = require("multer");
const { requireDashboardPermission } = require("../middlewares/auth");
const {
  listPublicPartners,
  listPartners,
  createPartner,
  updatePartner,
  deletePartner,
} = require("../controllers/partnerController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/public", listPublicPartners);
router.get("/", requireDashboardPermission("home_hero", "list"), listPartners);
router.post("/", requireDashboardPermission("home_hero", "create"), upload.single("image"), createPartner);
router.put("/:id", requireDashboardPermission("home_hero", "update"), upload.single("image"), updatePartner);
router.delete("/:id", requireDashboardPermission("home_hero", "delete"), deletePartner);

module.exports = router;
