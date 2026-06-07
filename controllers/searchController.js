const Event = require("../models/Event");
const BlogContent = require("../models/BlogContent");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const searchAll = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) {
    return res.status(200).json({ events: [], articles: [] });
  }

  const regex = new RegExp(escapeRegex(q), "i");

  const [events, articles] = await Promise.all([
    Event.find({ name: regex, status: "active" })
      .select("name poster type genres")
      .limit(5)
      .lean(),
    BlogContent.find({ title: regex, isPublished: true, type: { $in: ["article", "form", "trailer"] } })
      .select("title slug type image thumbnail")
      .limit(5)
      .lean(),
  ]);

  return res.status(200).json({ events, articles });
};

module.exports = { searchAll };
