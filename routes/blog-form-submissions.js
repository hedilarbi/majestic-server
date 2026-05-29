const express = require("express");

const {
  createBlogFormSubmission,
  exportFormSubmissionsExcel,
  exportFormSubmissionsPDF,
  getFormStats,
  getSubmissionById,
  listSubmissionForms,
  listSubmissionsByForm,
} = require("../controllers/blogFormSubmissionController");
const { hasDashboardPermission } = require("../config/dashboardPermissions");
const { authenticate, optionalAuthenticate } = require("../middlewares/auth");

const router = express.Router();

const requireSubmissionReader = (req, res, next) =>
  authenticate(req, res, () => {
    const role = req.user?.role;

    if (role === "blog_manager" || role === "super_admin") {
      return next();
    }

    if (
      role === "admin" &&
      hasDashboardPermission(req.user, "blog_form_submissions", "list")
    ) {
      return next();
    }

    return res.status(403).json({ message: "Accès refuse" });
  });

router.post("/forms/:formId", optionalAuthenticate, createBlogFormSubmission);
router.get("/forms", requireSubmissionReader, listSubmissionForms);
router.get("/forms/:formId/stats", requireSubmissionReader, getFormStats);
router.get("/forms/:formId/submissions", requireSubmissionReader, listSubmissionsByForm);
router.get("/forms/:formId/submissions/export/excel", requireSubmissionReader, exportFormSubmissionsExcel);
router.get("/forms/:formId/submissions/export/pdf", requireSubmissionReader, exportFormSubmissionsPDF);
router.get("/:submissionId", requireSubmissionReader, getSubmissionById);

module.exports = router;
