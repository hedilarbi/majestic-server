const sessionTimeService = require("../services/sessionTimeService");

const createSessionTime = async (req, res) => {
  try {
    const sessionTime = await sessionTimeService.createSessionTime(
      req.body || {}
    );
    return res.status(201).json({ sessionTime });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listSessionTimes = async (req, res) => {
  try {
    const sessionTimes = await sessionTimeService.listSessionTimes();
    return res.status(200).json({ sessionTimes });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getSessionTime = async (req, res) => {
  try {
    const sessionTime = await sessionTimeService.getSessionTimeById(
      req.params.id
    );
    return res.status(200).json({ sessionTime });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const updateSessionTime = async (req, res) => {
  try {
    const sessionTime = await sessionTimeService.updateSessionTime(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ sessionTime });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const deleteSessionTime = async (req, res) => {
  try {
    const sessionTime = await sessionTimeService.deleteSessionTime(
      req.params.id
    );
    return res.status(200).json({ sessionTime });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createSessionTime,
  listSessionTimes,
  getSessionTime,
  updateSessionTime,
  deleteSessionTime,
};
