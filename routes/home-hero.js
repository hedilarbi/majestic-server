const express = require("express");
const multer = require("multer");

const {
  createHomeHero,
  listHomeHeroes,
  getHomeHero,
  updateHomeHero,
  deleteHomeHero,
  swapHomeHeroOrder,
  setHomeHeroEventAffiche,
} = require("../controllers/homeHeroController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", listHomeHeroes);
router.get("/:id", getHomeHero);

router.post("/", requireAdmin, upload.single("poster"), createHomeHero);
router.post("/swap-order", requireAdmin, swapHomeHeroOrder);
router.put("/:id/event-affiche", requireAdmin, setHomeHeroEventAffiche);
router.put("/:id", requireAdmin, upload.single("poster"), updateHomeHero);
router.delete("/:id", requireAdmin, deleteHomeHero);

module.exports = router;
