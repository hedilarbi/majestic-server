const express = require("express");

const { createGuest, getGuestMe } = require("../controllers/guestController");
const { authenticate } = require("../middlewares/auth");
const router = express.Router();

router.post("/", createGuest);
router.post("/signup", createGuest);
router.get("/me", authenticate, getGuestMe);

module.exports = router;
