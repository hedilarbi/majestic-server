const staffService = require("../services/staffService");

const createStaff = async (req, res) => {
  try {
    const user = await staffService.createStaff({
      ...(req.body || {}),
      requester: req.user || null,
    });
    return res.status(201).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const createBootstrapSuperAdmin = async (req, res) => {
  try {
    const user = await staffService.createBootstrapSuperAdmin(req.body || {});
    return res.status(201).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const loginStaff = async (req, res) => {
  try {
    const result = await staffService.loginStaff(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getStaffMe = async (req, res) => {
  try {
    const user = await staffService.getStaffById(req.user && req.user.sub);
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getStaffById = async (req, res) => {
  try {
    const user = await staffService.getStaffById(req.params.id);
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updateStaff = async (req, res) => {
  try {
    const user = await staffService.updateStaff(
      req.params.id,
      req.body || {},
      req.user || null,
    );
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deleteStaff = async (req, res) => {
  try {
    const user = await staffService.deleteStaff(req.params.id, req.user || null);
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const toggleStaffStatus = async (req, res) => {
  try {
    const user = await staffService.toggleStaffStatus(
      req.params.id,
      req.user || null,
    );
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listStaff = async (req, res) => {
  try {
    const staff = await staffService.listStaff();
    return res.status(200).json({ staff });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const bootstrapPromoteAdminsToSuperAdmin = async (req, res) => {
  try {
    const result = await staffService.bootstrapPromoteAdminsToSuperAdmin();
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createStaff,
  createBootstrapSuperAdmin,
  loginStaff,
  getStaffMe,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffStatus,
  listStaff,
  bootstrapPromoteAdminsToSuperAdmin,
};
