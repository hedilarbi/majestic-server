const blogContentService = require("../services/blogContentService");

const createBlogContent = async (req, res) => {
  try {
    const item = await blogContentService.createBlogContent({
      payload: req.body || {},
      files: req.files || {},
      actorId: req.user?.sub,
    });

    return res.status(201).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const listBlogContents = async (req, res) => {
  try {
    const items = await blogContentService.listBlogContents(req.query || {});
    return res.status(200).json({ items });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const listPublicBlogContents = async (req, res) => {
  try {
    const items = await blogContentService.listPublishedBlogContents(req.query || {});
    return res.status(200).json({ items });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const getPublicBlogContent = async (req, res) => {
  try {
    const item = await blogContentService.getPublishedBlogContentBySlug(
      req.params.slug,
    );
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const getBlogContent = async (req, res) => {
  try {
    const item = await blogContentService.getBlogContentById(req.params.id);
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const updateBlogContent = async (req, res) => {
  try {
    const item = await blogContentService.updateBlogContent(req.params.id, {
      payload: req.body || {},
      files: req.files || {},
      actorId: req.user?.sub,
    });

    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const deleteBlogContent = async (req, res) => {
  try {
    const item = await blogContentService.deleteBlogContent(req.params.id);
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createBlogContent,
  deleteBlogContent,
  getBlogContent,
  getPublicBlogContent,
  listBlogContents,
  listPublicBlogContents,
  updateBlogContent,
};
