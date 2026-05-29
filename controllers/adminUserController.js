const adminUserService = require("../services/adminUserService");

const listUsers = async (req, res) => {
  try {
    const result = await adminUserService.listUsers({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      role: req.query.role,
      status: req.query.status,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const result = await adminUserService.getUserDetails(req.params.userId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const result = await adminUserService.toggleUserStatus(req.params.userId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

module.exports = {
  listUsers,
  getUserDetails,
  toggleUserStatus,
};
