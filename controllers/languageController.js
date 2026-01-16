const languageService = require("../services/languageService");

const createLanguage = async (req, res) => {
  try {
    const language = await languageService.createLanguage(req.body || {});
    return res.status(201).json({ language });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listLanguages = async (req, res) => {
  try {
    const languages = await languageService.listLanguages();
    return res.status(200).json({ languages });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getLanguage = async (req, res) => {
  try {
    const language = await languageService.getLanguageById(req.params.id);
    return res.status(200).json({ language });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const updateLanguage = async (req, res) => {
  try {
    const language = await languageService.updateLanguage(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ language });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const deleteLanguage = async (req, res) => {
  try {
    const language = await languageService.deleteLanguage(req.params.id);
    return res.status(200).json({ language });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createLanguage,
  listLanguages,
  getLanguage,
  updateLanguage,
  deleteLanguage,
};
