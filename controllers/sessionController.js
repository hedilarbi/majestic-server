const sessionService = require("../services/sessionService");

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  if (typeof max === "number" && parsed > max) {
    return max;
  }

  return parsed;
};

const createSession = async (req, res) => {
  try {
    const session = await sessionService.createSession({
      payload: req.body || {},
      createdBy: req.user && req.user.sub,
    });

    return res.status(201).json({ session });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listSessions = async (req, res) => {
  try {
    const sessions = await sessionService.listSessions();
    return res.status(200).json({ sessions });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listSessionsPopulatedEveent = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20, 100);

    const result = await sessionService.listSessionsPopulatedEveent({
      page,
      limit,
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
      orderBy: req.query.orderBy,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getSession = async (req, res) => {
  try {
    const session = await sessionService.getSessionById(req.params.id);
    return res.status(200).json({ session });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getSessionsByEventId = async (req, res) => {
  try {
    const sessions = await sessionService.getSessionsByEventId(
      req.params.eventId
    );
    return res.status(200).json({ sessions });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getSessionHomeByEventId = async (req, res) => {
  try {
    const data = await sessionService.getSessionHomeByEventId(
      req.params.eventId,
      { status: req.query.status }
    );
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listSessionsByDateGrouped = async (req, res) => {
  try {
    const groups = await sessionService.listSessionsByDateGrouped(
      req.query.date
    );

    return res.status(200).json({ groups });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updateSession = async (req, res) => {
  try {
    const session = await sessionService.updateSession(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ session });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deleteSession = async (req, res) => {
  try {
    const session = await sessionService.deleteSession(req.params.id);
    return res.status(200).json({ session });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createSession,
  listSessions,
  listSessionsPopulatedEveent,
  getSession,
  getSessionsByEventId,
  getSessionHomeByEventId,
  listSessionsByDateGrouped,
  updateSession,
  deleteSession,
};
