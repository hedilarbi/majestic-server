const express = require("express");

const {
  createLanguage,
  listLanguages,
  getLanguage,
  updateLanguage,
  deleteLanguage,
} = require("../controllers/languageController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.use(requireAdmin);

router.post("/", createLanguage);
router.get("/", listLanguages);
router.get("/:id", getLanguage);
router.put("/:id", updateLanguage);
router.delete("/:id", deleteLanguage);

module.exports = router;
