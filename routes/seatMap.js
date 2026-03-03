const express = require("express");
const { getSeatMap } = require("../controllers/seatMapController");
const { optionalAuthenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/:sessionId/seat-map", optionalAuthenticate, getSeatMap);

module.exports = router;
