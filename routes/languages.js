const express = require("express");

const {
  createLanguage,
  listLanguages,
  getLanguage,
  updateLanguage,
  deleteLanguage,
} = require("../controllers/languageController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("versions", "list"), listLanguages);
router.get("/:id", requireDashboardPermission("versions", "list"), getLanguage);
router.post("/", requireDashboardPermission("versions", "create"), createLanguage);
router.put("/:id", requireDashboardPermission("versions", "update"), updateLanguage);
router.delete(
  "/:id",
  requireDashboardPermission("versions", "delete"),
  deleteLanguage,
);

module.exports = router;
