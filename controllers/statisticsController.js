const statisticsService = require("../services/statisticsService");

const getStatistics = async (req, res) => {
  try {
    const result = await statisticsService.buildStatistics({
      dateStart: req.query.dateStart,
      dateEnd: req.query.dateEnd,
      eventId: req.query.eventId,
      sessionTime: req.query.sessionTime,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const downloadSessionSalesPdf = async (req, res) => {
  try {
    const result = await statisticsService.buildSessionSalesPdf({
      dateStart: req.query.dateStart,
      dateEnd: req.query.dateEnd,
      eventId: req.query.eventId,
      sessionTime: req.query.sessionTime,
    });

    const filename = result?.filename || "statistiques-ventes-seances.pdf";
    const content = result?.buffer || Buffer.alloc(0);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(content.length));
    return res.status(200).send(content);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  getStatistics,
  downloadSessionSalesPdf,
};
