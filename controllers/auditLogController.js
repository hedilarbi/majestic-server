const auditLogService = require("../services/auditLogService");

const listAuditLogs = async (req, res) => {
  try {
    const result = await auditLogService.listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      type: req.query.type,
      view: req.query.view,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      requester: req.user,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const recordTicketPrint = async (req, res) => {
  try {
    const result = await auditLogService.recordTicketPrint({
      bookingId: req.params.bookingId,
      ticketId: req.body && req.body.ticketId,
      actorId: req.user && req.user.sub,
      actorRole: req.user && req.user.role,
    });

    return res.status(201).json({
      ok: true,
      auditLogId: result?.auditLog?._id ? String(result.auditLog._id) : null,
      printCount: result?.printCount ?? null,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const recordTicketPrintCancelled = async (req, res) => {
  try {
    const result = await auditLogService.recordTicketPrintCancelled({
      bookingId: req.params.bookingId,
      ticketId: req.body && req.body.ticketId,
      actorId: req.user && req.user.sub,
      actorRole: req.user && req.user.role,
    });

    return res.status(201).json({
      ok: true,
      auditLogId: result?.auditLog?._id ? String(result.auditLog._id) : null,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

module.exports = {
  listAuditLogs,
  recordTicketPrint,
  recordTicketPrintCancelled,
};
