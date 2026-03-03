const express = require("express");

const { listPublicOffers } = require("../controllers/offersController");

const router = express.Router();

router.get("/", listPublicOffers);

module.exports = router;

