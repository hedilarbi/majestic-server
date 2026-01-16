const aLafficheService = require("../services/aLafficheService");

const createALaffiche = async (req, res) => {
  try {
    const item = await aLafficheService.createALaffiche({
      payload: req.body || {},
      file: req.file,
    });
    return res.status(201).json({ aLaffiche: item });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listALaffiches = async (req, res) => {
  try {
    const items = await aLafficheService.listALaffiches();
    return res.status(200).json({ aLaffiche: items });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getALaffiche = async (req, res) => {
  try {
    const item = await aLafficheService.getALafficheById(req.params.id);
    return res.status(200).json({ aLaffiche: item });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const updateALaffiche = async (req, res) => {
  try {
    const item = await aLafficheService.updateALaffiche(req.params.id, {
      payload: req.body || {},
      file: req.file,
    });
    return res.status(200).json({ aLaffiche: item });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const deleteALaffiche = async (req, res) => {
  try {
    const item = await aLafficheService.deleteALaffiche(req.params.id);
    return res.status(200).json({ aLaffiche: item });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createALaffiche,
  listALaffiches,
  getALaffiche,
  updateALaffiche,
  deleteALaffiche,
};
