const express = require("express");
const { listTickets, scanTicket } = require("../controllers/ticketController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/", authenticate, listTickets);
router.post("/scan", authenticate, scanTicket);

module.exports = router;
