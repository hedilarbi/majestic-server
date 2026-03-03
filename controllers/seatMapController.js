const seatMapService = require("../services/seatMapService");

const getSeatMap = async (req, res) => {
  try {
    const result = await seatMapService.getSeatMap(
      req.params.sessionId,
      req.user && req.user.sub,
    );
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    const payload = { message: error.message || "Server error" };
    if (error.sessionStatus) {
      payload.sessionStatus = error.sessionStatus;
    }
    return res
      .status(status)
      .json(payload);
  }
};

module.exports = {
  getSeatMap,
};
