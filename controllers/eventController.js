const eventService = require("../services/eventService");

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

const createEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent({
      payload: req.body || {},
      file: req.file,
      createdBy: req.user && req.user.sub,
    });
    return res.status(201).json({ event });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listEvents = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10, 100);

    const result = await eventService.listEvents({
      page,
      limit,
      name: req.query.name,
      type: req.query.type,
      status: req.query.status,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getEvent = async (req, res) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    return res.status(200).json({ event });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await eventService.updateEvent(req.params.id, {
      payload: req.body || {},
      file: req.file,
    });
    return res.status(200).json({ event });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await eventService.deleteEvent(req.params.id);
    return res.status(200).json({ event });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getHomeContent = async (req, res) => {
  try {
    const content = await eventService.getHomeContent();
    return res.status(200).json(content);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getEventsWithALAffiche = async (req, res) => {
  try {
    const result = await eventService.getEventsWithALAffiche({
      type: req.query.type,
      genre: req.query.genre,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  getHomeContent,
  getEventsWithALAffiche,
};
