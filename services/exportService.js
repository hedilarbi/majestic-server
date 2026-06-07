const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "0.00 DT";
  }
  return `${amount.toFixed(2)} DT`;
};

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return formatDateTime(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const resolveFormat = (format) => {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized !== "excel" && normalized !== "pdf") {
    const error = new Error("Format export invalide.");
    error.status = 400;
    throw error;
  }
  return normalized;
};

const buildFilename = (baseName, format) => {
  const safeBaseName = String(baseName || "export")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export";
  return `${safeBaseName}.${format === "excel" ? "xlsx" : "pdf"}`;
};

const sendExcel = async ({ res, filename, title, columns, rows }) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(String(title || "Export").slice(0, 31));

  worksheet.columns = columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.width || 24,
  }));

  rows.forEach((row) => {
    const excelRow = {};
    columns.forEach((column) => {
      const value = typeof column.value === "function" ? column.value(row) : row[column.key];
      excelRow[column.key] = normalizeCellValue(value);
    });
    worksheet.addRow(excelRow);
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};

const sendPdf = ({ res, filename, title, columns, rows, filters = [] }) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).text(title || "Export", { align: "left" });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor("#64748b").text(`Généré le ${formatDateTime(new Date())}`);

  const safeFilters = filters.filter((filter) => filter?.value);
  if (safeFilters.length) {
    doc.moveDown(0.4);
    safeFilters.forEach((filter) => {
      doc.text(`${filter.label}: ${filter.value}`);
    });
  }

  doc.moveDown();
  rows.forEach((row, index) => {
    if (doc.y > 760) {
      doc.addPage();
    }

    doc.fontSize(10).fillColor("#0f172a").text(`#${index + 1}`, {
      continued: false,
    });
    columns.forEach((column) => {
      const value = typeof column.value === "function" ? column.value(row) : row[column.key];
      doc
        .fontSize(8)
        .fillColor("#334155")
        .text(`${column.label}: ${normalizeCellValue(value)}`);
    });
    doc.moveDown(0.5);
  });

  if (!rows.length) {
    doc.fontSize(10).fillColor("#64748b").text("Aucune donnée.");
  }

  doc.end();
};

const sendTabularExport = async ({
  res,
  format,
  baseFilename,
  title,
  columns,
  rows,
  filters,
}) => {
  const normalizedFormat = resolveFormat(format);
  const filename = buildFilename(baseFilename, normalizedFormat);

  if (normalizedFormat === "excel") {
    await sendExcel({ res, filename, title, columns, rows });
    return;
  }

  sendPdf({ res, filename, title, columns, rows, filters });
};

module.exports = {
  formatCurrency,
  formatDate,
  formatDateTime,
  sendTabularExport,
};
