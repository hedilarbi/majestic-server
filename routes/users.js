const express = require("express");

const { createAdmin } = require("../controllers/adminController");
const { requireSuperAdmin } = require("../middlewares/auth");
const router = express.Router();

router.post("/create", requireSuperAdmin, createAdmin);

module.exports = router;
