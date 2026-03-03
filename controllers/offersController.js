const offersService = require("../services/offersService");

const listPublicOffers = async (_req, res) => {
  try {
    const result = await offersService.listPublicOffers();
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  listPublicOffers,
};

