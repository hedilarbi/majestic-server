const homeHeroService = require("../services/homeHeroService");

const createHomeHero = async (req, res) => {
  try {
    const hero = await homeHeroService.createHomeHero({
      payload: req.body || {},
      file: req.file,
    });
    return res.status(201).json({ hero });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listHomeHeroes = async (req, res) => {
  try {
    const heroes = await homeHeroService.listHomeHeroes();

    return res.status(200).json(heroes);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getHomeHero = async (req, res) => {
  try {
    const hero = await homeHeroService.getHomeHeroById(req.params.id);
    return res.status(200).json({ hero });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updateHomeHero = async (req, res) => {
  try {
    const hero = await homeHeroService.updateHomeHero(req.params.id, {
      payload: req.body || {},
      file: req.file,
    });
    return res.status(200).json(hero);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deleteHomeHero = async (req, res) => {
  try {
    const hero = await homeHeroService.deleteHomeHero(req.params.id);
    return res.status(200).json({ hero });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const swapHomeHeroOrder = async (req, res) => {
  try {
    const result = await homeHeroService.swapHomeHeroOrder(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const setHomeHeroEventAffiche = async (req, res) => {
  try {
    const hero = await homeHeroService.setHomeHeroEventAffiche(req.params.id);
    return res.status(200).json({ hero });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createHomeHero,
  listHomeHeroes,
  getHomeHero,
  updateHomeHero,
  deleteHomeHero,
  swapHomeHeroOrder,
  setHomeHeroEventAffiche,
};
