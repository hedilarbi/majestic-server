const cashRegisterService = require("../services/cashRegisterService");
const {
  formatCurrency,
  formatDateTime,
  sendTabularExport,
} = require("../services/exportService");

const formatIdentity = (value) => {
  if (!value || typeof value !== "object") {
    return "";
  }

  return `${value.firstName || ""} ${value.lastName || ""}`.trim() || value.email || "";
};

const formatPeriod = (closure) => {
  const start = formatDateTime(closure?.periodStartAt);
  const end = formatDateTime(closure?.periodEndAt);
  return [start, end].filter(Boolean).join(" - ");
};

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

const listSupervisorCashierHistory = async (req, res) => {
  try {
    const result = await cashRegisterService.listSupervisorCashierClosures({
      supervisorId: req.user && req.user.sub,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const exportSupervisorCashierHistory = async (req, res) => {
  try {
    const result = await cashRegisterService.listSupervisorCashierClosures({
      supervisorId: req.user && req.user.sub,
      limit: req.query.limit || 5000,
      maxLimit: 5000,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    await sendTabularExport({
      res,
      format: req.params.format,
      baseFilename: "caisse-clotures",
      title: "Caisse - historique des clôtures",
      filters: [
        { label: "Date début", value: req.query.dateFrom || req.query.from },
        { label: "Date fin", value: req.query.dateTo || req.query.to },
      ],
      columns: [
        {
          key: "closedAt",
          label: "Date clôture",
          value: (item) => formatDateTime(item.closedAt),
        },
        { key: "cashier", label: "Caissier", value: (item) => formatIdentity(item.cashier) },
        { key: "admin", label: "Admin", value: (item) => formatIdentity(item.closedBy) },
        { key: "period", label: "Période", value: formatPeriod },
        {
          key: "transferCount",
          label: "Clôtures guichets",
          value: (item) => item.transferCount || 0,
        },
        { key: "ticketCount", label: "Billets", value: (item) => item.ticketCount || 0 },
        {
          key: "subscriptionSaleCount",
          label: "Abonnements",
          value: (item) => item.subscriptionSaleCount || 0,
        },
        {
          key: "amount",
          label: "Montant",
          value: (item) => formatCurrency(item.amount),
        },
      ],
      rows: result.items || [],
    });
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
      periodStartAt: req.body?.periodStartAt,
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
  exportSupervisorCashierHistory,
  listCashierOverview,
  listSupervisorCashierHistory,
  listHistory,
  listOverview,
};
