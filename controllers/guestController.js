const guestService = require("../services/guestService");

const createGuest = async (req, res) => {
  try {
    const result = await guestService.createGuest();
    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getGuestMe = async (req, res) => {
  try {
    const user = await guestService.getGuestById(req.user && req.user.sub);
    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createGuest,
  getGuestMe,
};
