const express = require("express");

const {
  listAuditLogs,
  recordTicketPrint,
  recordTicketPrintCancelled,
} = require("../controllers/auditLogController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/", authenticate, listAuditLogs);
router.post("/bookings/:bookingId/print", authenticate, recordTicketPrint);
router.post("/bookings/:bookingId/print-cancelled", authenticate, recordTicketPrintCancelled);

module.exports = router;
