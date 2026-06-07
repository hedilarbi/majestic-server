const adminUserService = require("../services/adminUserService");
const { formatDateTime, sendTabularExport } = require("../services/exportService");

const listUsers = async (req, res) => {
  try {
    const result = await adminUserService.listUsers({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      role: req.query.role,
      status: req.query.status,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const exportUsers = async (req, res) => {
  try {
    const items = await adminUserService.listUsersForExport({
      search: req.query.search,
      role: req.query.role,
      status: req.query.status,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    await sendTabularExport({
      res,
      format: req.params.format,
      baseFilename: "utilisateurs",
      title: "Utilisateurs",
      filters: [
        { label: "Recherche", value: req.query.search },
        { label: "Rôle", value: req.query.role },
        { label: "Statut", value: req.query.status },
        { label: "Date début", value: req.query.dateFrom || req.query.from },
        { label: "Date fin", value: req.query.dateTo || req.query.to },
      ],
      columns: [
        {
          key: "fullName",
          label: "Utilisateur",
          value: (item) =>
            `${item.firstName || ""} ${item.lastName || ""}`.trim() || "-",
        },
        { key: "email", label: "Email", value: (item) => item.email || "" },
        { key: "phone", label: "Téléphone", value: (item) => item.phone || "" },
        { key: "role", label: "Rôle", value: (item) => item.role || "" },
        { key: "status", label: "Statut", value: (item) => item.status || "active" },
        {
          key: "createdAt",
          label: "Créé le",
          value: (item) => formatDateTime(item.createdAt),
        },
      ],
      rows: items,
    });
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
  exportUsers,
  getUserDetails,
  toggleUserStatus,
};
