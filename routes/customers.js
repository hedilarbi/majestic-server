const express = require("express");

const {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  updateCustomerMe,
  verifyCustomerOtp,
  resendCustomerOtp,
  resetCustomerPassword,
  requestCustomerPasswordReset,
  confirmCustomerPasswordReset,
  resendCustomerPasswordResetOtp,
} = require("../controllers/customerController");
const { authenticate, optionalAuthenticate } = require("../middlewares/auth");
const router = express.Router();

router.post("/create", authenticate, signupCustomer);

router.post("/login", optionalAuthenticate, loginCustomer);
router.get("/me", authenticate, getCustomerMe);
router.put("/me", authenticate, updateCustomerMe);
router.post("/reset-password", authenticate, resetCustomerPassword);
router.post("/verify-otp", authenticate, verifyCustomerOtp);
router.post("/resend-otp", authenticate, resendCustomerOtp);
router.post("/forgot-password", requestCustomerPasswordReset);
router.post("/forgot-password/verify", confirmCustomerPasswordReset);
router.post("/forgot-password/resend-otp", resendCustomerPasswordResetOtp);

module.exports = router;
