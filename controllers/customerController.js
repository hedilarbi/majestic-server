const customerService = require("../services/customerService");

const signupCustomer = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "guest") {
      return res.status(403).json({ message: "Accès guest requis" });
    }

    const result = await customerService.createCustomer({
      guestId: req.user && req.user.sub,
      tokenRole: req.user && req.user.role,
      payload: req.body || {},
    });
    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const loginCustomer = async (req, res) => {
  try {
    const result = await customerService.loginCustomer({
      ...(req.body || {}),
      guestId: req.user && req.user.sub,
      tokenRole: req.user && req.user.role,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const getCustomerMe = async (req, res) => {
  try {
    const user = await customerService.getCustomerById(
      req.user && req.user.sub,
    );
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const updateCustomerMe = async (req, res) => {
  try {
    const user = await customerService.updateCustomerProfile(
      req.user && req.user.sub,
      req.body || {},
    );
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const verifyCustomerOtp = async (req, res) => {
  try {
    const result = await customerService.verifyCustomerOtp({
      email: req.user && req.user.email,
      otp: req.body && req.body.otp,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const resendCustomerOtp = async (req, res) => {
  try {
    const result = await customerService.resendCustomerOtp({
      email: req.user && req.user.email,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const resetCustomerPassword = async (req, res) => {
  try {
    const result = await customerService.resetCustomerPassword({
      customerId: req.user && req.user.sub,
      oldPassword: req.body && req.body.oldPassword,
      newPassword: req.body && req.body.newPassword,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const requestCustomerPasswordReset = async (req, res) => {
  try {
    const result = await customerService.requestCustomerPasswordReset({
      email: req.body && req.body.email,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const confirmCustomerPasswordReset = async (req, res) => {
  try {
    const result = await customerService.confirmCustomerPasswordReset({
      email: req.body && req.body.email,
      otp: req.body && req.body.otp,
      newPassword: req.body && req.body.newPassword,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

const resendCustomerPasswordResetOtp = async (req, res) => {
  try {
    const result = await customerService.resendCustomerPasswordResetOtp({
      email: req.body && req.body.email,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Erreur serveur" });
  }
};

module.exports = {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  updateCustomerMe,
  verifyCustomerOtp,
  resendCustomerOtp,
  resetCustomerPassword,
  requestCustomerPasswordReset,
  confirmCustomerPasswordReset,
  resendCustomerPasswordResetOtp,
};
