const pricingService = require("../services/pricingService");

const createPricing = async (req, res) => {
  try {
    const pricing = await pricingService.createPricing(req.body || {});
    return res.status(201).json({ pricing });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listPricing = async (req, res) => {
  try {
    const pricings = await pricingService.listPricing();

    return res.status(200).json(pricings);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getPricing = async (req, res) => {
  try {
    const pricing = await pricingService.getPricingById(req.params.id);
    return res.status(200).json({ pricing });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updatePricing = async (req, res) => {
  try {
    const pricing = await pricingService.updatePricing(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ pricing });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deletePricing = async (req, res) => {
  try {
    const pricing = await pricingService.deletePricing(req.params.id);
    return res.status(200).json({ pricing });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createPricing,
  listPricing,
  getPricing,
  updatePricing,
  deletePricing,
};
