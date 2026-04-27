const express = require("express");
const multer = require("multer");

const {
  createHomeHero,
  listHomeHeroes,
  getHomeHero,
  updateHomeHero,
  deleteHomeHero,
  swapHomeHeroOrder,
  setHomeHeroMovieAffiche,
  setHomeHeroShowAffiche,
} = require("../controllers/homeHeroController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", requireDashboardPermission("home_hero", "list"), listHomeHeroes);
router.get(
  "/:id",
  requireDashboardPermission("home_hero", "list"),
  getHomeHero,
);

router.post(
  "/",
  requireDashboardPermission("home_hero", "create"),
  upload.single("poster"),
  createHomeHero,
);
router.post(
  "/swap-order",
  requireDashboardPermission("home_hero", "update"),
  swapHomeHeroOrder,
);
router.put(
  "/:id/movie-affiche",
  requireDashboardPermission("home_hero", "update"),
  setHomeHeroMovieAffiche,
);
router.put(
  "/:id/show-affiche",
  requireDashboardPermission("home_hero", "update"),
  setHomeHeroShowAffiche,
);
router.put(
  "/:id",
  requireDashboardPermission("home_hero", "update"),
  upload.single("poster"),
  updateHomeHero,
);
router.delete(
  "/:id",
  requireDashboardPermission("home_hero", "delete"),
  deleteHomeHero,
);

module.exports = router;
