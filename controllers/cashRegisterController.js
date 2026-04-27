const cashRegisterService = require("../services/cashRegisterService");

const listOverview = async (req, res) => {
  try {
    const result = await cashRegisterService.listTicketOfficeRegisters({
      cashierId: req.user && req.user.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listCashierOverview = async (req, res) => {
  try {
    const result = await cashRegisterService.listCashierRegisters({
      supervisorId: req.user && req.user.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getTicketOfficeDetails = async (req, res) => {
  try {
    const result = await cashRegisterService.getTicketOfficeRegisterDetails({
      ticketOfficeId: req.params.ticketOfficeId,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getCashierDetails = async (req, res) => {
  try {
    const result = await cashRegisterService.getCashierRegisterDetails({
      cashierId: req.params.cashierId,
      supervisorId: req.user && req.user.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getOwnTicketOfficeDetails = async (req, res) => {
  try {
    const result = await cashRegisterService.getTicketOfficeRegisterDetails({
      ticketOfficeId: req.user && req.user.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const closeCashier = async (req, res) => {
  try {
    const result = await cashRegisterService.closeCashierRegister({
      cashierId: req.params.cashierId,
      supervisorId: req.user && req.user.sub,
    });
    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const closeTicketOffice = async (req, res) => {
  try {
    const result = await cashRegisterService.closeTicketOfficeRegister({
      ticketOfficeId: req.params.ticketOfficeId,
      cashierId: req.user && req.user.sub,
    });
    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listHistory = async (req, res) => {
  try {
    const result = await cashRegisterService.listCashierClosures({
      cashierId: req.user && req.user.sub,
      limit: req.query.limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getHistoryDetails = async (req, res) => {
  try {
    const result = await cashRegisterService.getCashierClosureDetails({
      closureId: req.params.closureId,
      cashierId: req.user && req.user.sub,
    });
    return res.status(200).json({ closure: result });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  closeCashier,
  closeTicketOffice,
  getCashierDetails,
  getHistoryDetails,
  getOwnTicketOfficeDetails,
  getTicketOfficeDetails,
  listCashierOverview,
  listHistory,
  listOverview,
};
