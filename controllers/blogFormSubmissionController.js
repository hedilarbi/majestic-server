const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const blogFormSubmissionService = require("../services/blogFormSubmissionService");

const createBlogFormSubmission = async (req, res) => {
  try {
    const item = await blogFormSubmissionService.createBlogFormSubmission({
      formId: req.params.formId,
      answers: req.body?.answers || {},
      user: req.user || null,
    });

    return res.status(201).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const listSubmissionForms = async (_req, res) => {
  try {
    const items = await blogFormSubmissionService.listSubmissionForms();
    return res.status(200).json({ items });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const listSubmissionsByForm = async (req, res) => {
  try {
    const payload = await blogFormSubmissionService.listSubmissionsByForm(
      req.params.formId,
    );

    return res.status(200).json(payload);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const getSubmissionById = async (req, res) => {
  try {
    const item = await blogFormSubmissionService.getSubmissionById(
      req.params.submissionId,
    );

    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const formatAnswerValue = (answer) => {
  if (!answer) return "";
  if (answer.type === "checkbox") return (answer.values || []).join(", ");
  return String(answer.value || "");
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const exportFormSubmissionsExcel = async (req, res) => {
  try {
    const { form, submissions } = await blogFormSubmissionService.listSubmissionsByForm(req.params.formId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Majestic";
    const sheet = workbook.addWorksheet(form.title || "Soumissions");

    const questionLabels = (form.questions || []).map((q) => q.label || "");
    const headers = ["Nom", "Prénom", "Email", "Date", ...questionLabels];

    sheet.addRow(headers);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1034A6" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

    submissions.forEach((sub) => {
      const customer = sub.customerSnapshot || {};
      const answerMap = new Map(
        (sub.answers || []).map((a) => [String(a.questionId), a]),
      );
      const answerValues = (form.questions || []).map((q) =>
        formatAnswerValue(answerMap.get(String(q._id))),
      );
      sheet.addRow([
        customer.lastName || "",
        customer.firstName || "",
        customer.email || "",
        formatDate(sub.createdAt),
        ...answerValues,
      ]);
    });

    headers.forEach((_, idx) => {
      sheet.getColumn(idx + 1).width = 22;
    });

    const filename = `soumissions-${form.title || "formulaire"}.xlsx`.replace(/\s+/g, "-");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const exportFormSubmissionsPDF = async (req, res) => {
  try {
    const { form, submissions } = await blogFormSubmissionService.listSubmissionsByForm(req.params.formId);

    const filename = `soumissions-${form.title || "formulaire"}.pdf`.replace(/\s+/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const MARGIN = 50;
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    doc.pipe(res);

    const pageWidth = doc.page.width - MARGIN * 2;
    const PRIMARY = "#1034A6";
    const LIGHT_BG = "#F1F5F9";
    const TEXT_DARK = "#0F172A";
    const TEXT_MUTED = "#64748B";
    const BORDER = "#E2E8F0";

    // ── Cover page ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 8).fill(PRIMARY);
    doc.moveDown(3);
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text(form.title || "Soumissions", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(TEXT_MUTED)
      .text(`${submissions.length} soumission(s) — Exporté le ${formatDate(new Date())}`, { align: "center" });

    // ── One page per submission ───────────────────────────────────────────────
    submissions.forEach((sub, idx) => {
      doc.addPage();

      // Top accent bar
      doc.rect(0, 0, doc.page.width, 6).fill(PRIMARY);

      // Submission number chip
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text(`SOUMISSION #${idx + 1}`, MARGIN, 20, { align: "left" });
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(TEXT_MUTED)
        .text(formatDate(sub.createdAt), MARGIN, 20, { align: "right" });

      doc.moveDown(2.5);

      // ── User info block ───────────────────────────────────────────────────
      const customer = sub.customerSnapshot || {};
      const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Anonyme";
      const email = customer.email || "—";

      const blockY = doc.y;
      doc.rect(MARGIN, blockY, pageWidth, 60).fill(LIGHT_BG);
      doc.rect(MARGIN, blockY, 4, 60).fill(PRIMARY);

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor(TEXT_DARK)
        .text(fullName, MARGIN + 16, blockY + 12, { width: pageWidth - 16 });
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(TEXT_MUTED)
        .text(email, MARGIN + 16, blockY + 32, { width: pageWidth - 16 });

      doc.y = blockY + 72;

      // ── Questions / Answers ───────────────────────────────────────────────
      const answerMap = new Map(
        (sub.answers || []).map((a) => [String(a.questionId), a]),
      );
      const questions = form.questions || [];

      questions.forEach((q, qIdx) => {
        const answer = answerMap.get(String(q._id));
        const answerText = answer ? formatAnswerValue(answer) : "—";

        // New page if not enough room (label + answer + margin)
        if (doc.y + 60 > doc.page.height - MARGIN) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 6).fill(PRIMARY);
          doc.y = 30;
        }

        const rowY = doc.y;

        // Question number badge
        doc
          .fontSize(7)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text(`Q${qIdx + 1}`, MARGIN, rowY + 3, { width: 20 });

        // Question label
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor(TEXT_DARK)
          .text(q.label || `Question ${qIdx + 1}`, MARGIN + 26, rowY, { width: pageWidth - 26 });

        doc.moveDown(0.35);

        // Answer value (indented)
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(answerText === "—" ? TEXT_MUTED : TEXT_DARK)
          .text(answerText || "—", MARGIN + 26, doc.y, { width: pageWidth - 26 });

        // Separator line
        doc.moveDown(0.6);
        if (qIdx < questions.length - 1) {
          doc
            .moveTo(MARGIN + 26, doc.y)
            .lineTo(MARGIN + pageWidth, doc.y)
            .strokeColor(BORDER)
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.6);
        }
      });
    });

    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      return res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
  }
};

const getFormStats = async (req, res) => {
  try {
    const stats = await blogFormSubmissionService.getFormStats(req.params.formId);
    return res.status(200).json(stats);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createBlogFormSubmission,
  exportFormSubmissionsExcel,
  exportFormSubmissionsPDF,
  getFormStats,
  getSubmissionById,
  listSubmissionForms,
  listSubmissionsByForm,
};
