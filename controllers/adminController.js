const adminService = require("../services/adminService");

const createAdmin = async (req, res) => {
  try {
    const user = await adminService.createAdmin(req.body || {});
    return res.status(201).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createAdmin,
};
