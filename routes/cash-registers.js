const express = require("express");
const { hasDashboardPermission } = require("../config/dashboardPermissions");

const {
  closeCashier,
  closeTicketOffice,
  getCashierDetails,
  getHistoryDetails,
  getOwnTicketOfficeDetails,
  getTicketOfficeDetails,
  exportSupervisorCashierHistory,
  listCashierOverview,
  listSupervisorCashierHistory,
  listHistory,
  listOverview,
} = require("../controllers/cashRegisterController");
const { authenticate, requireStaffRoles } = require("../middlewares/auth");

const router = express.Router();

const requireCashRegisterPermission = (action) => (req, res, next) =>
  authenticate(req, res, () => {
    const role = req.user?.role;

    if (role === "super_admin") {
      return next();
    }

    if (
      role === "admin" &&
      hasDashboardPermission(req.user, "cash_registers", action)
    ) {
      return next();
    }

    return res.status(403).json({ message: "Permission insuffisante" });
  });

router.get("/cashiers", requireCashRegisterPermission("list"), listCashierOverview);
router.get(
  "/cashiers/history",
  requireCashRegisterPermission("list"),
  listSupervisorCashierHistory,
);
router.get(
  "/cashiers/history/export/:format",
  requireCashRegisterPermission("list"),
  exportSupervisorCashierHistory,
);
router.get(
  "/cashiers/:cashierId",
  requireCashRegisterPermission("list"),
  getCashierDetails,
);
router.post(
  "/cashiers/:cashierId/close",
  requireCashRegisterPermission("update"),
  closeCashier,
);

router.get("/me", requireStaffRoles(["ticket_office"]), getOwnTicketOfficeDetails);

router.use(requireStaffRoles(["cashier"]));

router.get("/overview", listOverview);
router.get("/history", listHistory);
router.get("/history/:closureId", getHistoryDetails);
router.get("/guichets/:ticketOfficeId", getTicketOfficeDetails);
router.post("/guichets/:ticketOfficeId/close", closeTicketOffice);

module.exports = router;
