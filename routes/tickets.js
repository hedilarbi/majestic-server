const express = require("express");
const {
  exportTickets,
  listTickets,
  scanTicket,
  searchTicket,
  repriceTicket,
} = require("../controllers/ticketController");
const { authenticate, requireStaffRoles } = require("../middlewares/auth");

const router = express.Router();

router.get("/", authenticate, listTickets);
router.get("/export/:format", authenticate, exportTickets);
router.post("/scan", authenticate, scanTicket);
router.get("/search", requireStaffRoles(["ticket_office"]), searchTicket);
router.patch("/:ticketId/reprice", requireStaffRoles(["ticket_office"]), repriceTicket);

module.exports = router;
