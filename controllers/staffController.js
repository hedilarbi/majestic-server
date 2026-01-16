const staffService = require("../services/staffService");

const createStaff = async (req, res) => {
  try {
    const user = await staffService.createStaff(req.body || {});
    return res.status(201).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const loginStaff = async (req, res) => {
  try {
    const result = await staffService.loginStaff(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getStaffMe = async (req, res) => {
  try {
    const user = await staffService.getStaffById(req.user && req.user.sub);
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createStaff,
  loginStaff,
  getStaffMe,
};
