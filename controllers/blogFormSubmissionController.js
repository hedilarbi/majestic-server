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

module.exports = {
  createBlogFormSubmission,
  getSubmissionById,
  listSubmissionForms,
  listSubmissionsByForm,
};
