const showTypeService = require("../services/showTypeService");

const createShowType = async (req, res) => {
  try {
    const showType = await showTypeService.createShowType(req.body || {});
    return res.status(201).json({ showType });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listShowTypes = async (req, res) => {
  try {
    const showTypes = await showTypeService.listShowTypes();
    return res.status(200).json({ showTypes });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getShowType = async (req, res) => {
  try {
    const showType = await showTypeService.getShowTypeById(req.params.id);
    return res.status(200).json({ showType });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const updateShowType = async (req, res) => {
  try {
    const showType = await showTypeService.updateShowType(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ showType });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const deleteShowType = async (req, res) => {
  try {
    const showType = await showTypeService.deleteShowType(req.params.id);
    return res.status(200).json({ showType });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createShowType,
  listShowTypes,
  getShowType,
  updateShowType,
  deleteShowType,
};
