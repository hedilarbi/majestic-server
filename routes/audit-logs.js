const express = require("express");

const {
  listAuditLogs,
  recordTicketPrint,
} = require("../controllers/auditLogController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/", authenticate, listAuditLogs);
router.post("/bookings/:bookingId/print", authenticate, recordTicketPrint);

module.exports = router;
