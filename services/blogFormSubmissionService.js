const mongoose = require("mongoose");

const BlogContent = require("../models/BlogContent");
const BlogFormSubmission = require("../models/BlogFormSubmission");

const OPTION_BASED_TYPES = new Set(["radio", "checkbox", "select"]);

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const assertObjectId = (value, fieldName) => {
  if (!value || !mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} invalide.`);
    error.status = 400;
    throw error;
  }
};

const assertCustomer = (user) => {
  if (!user) {
    const error = new Error("Authentification requise.");
    error.status = 401;
    throw error;
  }

  if (user.role !== "customer") {
    const error = new Error("Seuls les utilisateurs connectés peuvent envoyer ce formulaire.");
    error.status = 403;
    throw error;
  }
};

const buildQuestionLookup = (questions = []) =>
  questions.reduce((accumulator, question) => {
    if (question?._id) {
      accumulator[question._id.toString()] = question;
    }
    return accumulator;
  }, {});

const ensureQuestionValue = (question, rawValue) => {
  const questionLabel = normalizeString(question?.label) || "Question";
  const type = question?.type;

  if (type === "checkbox") {
    const values = Array.isArray(rawValue)
      ? rawValue.map((value) => normalizeString(value)).filter(Boolean)
      : rawValue === undefined || rawValue === null
        ? []
        : [normalizeString(rawValue)].filter(Boolean);

    if (question?.required && values.length === 0) {
      const error = new Error(`La question \"${questionLabel}\" est obligatoire.`);
      error.status = 400;
      throw error;
    }

    return { value: "", values };
  }

  const value = normalizeString(
    typeof rawValue === "number" ? String(rawValue) : rawValue,
  );

  if (question?.required && !value) {
    const error = new Error(`La question \"${questionLabel}\" est obligatoire.`);
    error.status = 400;
    throw error;
  }

  if (value && OPTION_BASED_TYPES.has(type) && !question.options.includes(value)) {
    const error = new Error(`La réponse pour \"${questionLabel}\" est invalide.`);
    error.status = 400;
    throw error;
  }

  if (value && type === "email") {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
      const error = new Error(`La réponse pour \"${questionLabel}\" doit être un email valide.`);
      error.status = 400;
      throw error;
    }
  }

  if (value && type === "number" && !Number.isFinite(Number(value))) {
    const error = new Error(`La réponse pour \"${questionLabel}\" doit être un nombre valide.`);
    error.status = 400;
    throw error;
  }

  return { value, values: [] };
};

const buildAnswers = (questions = [], answersPayload = {}) => {
  const safeAnswers =
    answersPayload && typeof answersPayload === "object" && !Array.isArray(answersPayload)
      ? answersPayload
      : {};
  const lookup = buildQuestionLookup(questions);

  return questions.map((question) => {
    const questionId = question._id.toString();

    if (!lookup[questionId]) {
      const error = new Error("Question du formulaire introuvable.");
      error.status = 400;
      throw error;
    }

    const rawValue = safeAnswers[questionId];
    const normalizedAnswer = ensureQuestionValue(question, rawValue);

    if (
      question.type === "checkbox" &&
      normalizedAnswer.values.some((value) => !question.options.includes(value))
    ) {
      const error = new Error(`La réponse pour \"${question.label}\" est invalide.`);
      error.status = 400;
      throw error;
    }

    return {
      questionId: question._id,
      label: question.label,
      type: question.type,
      required: question.required === true,
      value: normalizedAnswer.value,
      values: normalizedAnswer.values,
    };
  });
};

const createBlogFormSubmission = async ({ formId, answers, user }) => {
  assertCustomer(user);
  assertObjectId(formId, "Formulaire");

  const form = await BlogContent.findById(formId)
    .select("type title slug isPublished questions")
    .lean();

  if (!form || form.type !== "form") {
    const error = new Error("Formulaire introuvable.");
    error.status = 404;
    throw error;
  }

  if (form.isPublished !== true) {
    const error = new Error("Ce formulaire n'est pas disponible.");
    error.status = 400;
    throw error;
  }

  const normalizedAnswers = buildAnswers(form.questions || [], answers);

  return BlogFormSubmission.create({
    formId: form._id,
    formTitle: form.title || "Formulaire",
    formSlug: form.slug || "",
    userId: user.sub,
    customerSnapshot: {
      firstName: normalizeString(user.firstName),
      lastName: normalizeString(user.lastName),
      email: normalizeString(user.email),
    },
    answers: normalizedAnswers,
  });
};

const listSubmissionForms = async () => {
  const [forms, submissionStats] = await Promise.all([
    BlogContent.find({ type: "form" })
      .select("title slug isPublished createdAt updatedAt")
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
    BlogFormSubmission.aggregate([
      {
        $group: {
          _id: "$formId",
          submissionCount: { $sum: 1 },
          latestSubmissionAt: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  const statsLookup = new Map(
    submissionStats.map((entry) => [
      String(entry._id),
      {
        submissionCount: Number(entry.submissionCount || 0),
        latestSubmissionAt: entry.latestSubmissionAt || null,
      },
    ]),
  );

  return forms.map((form) => {
    const stats = statsLookup.get(String(form._id)) || {
      submissionCount: 0,
      latestSubmissionAt: null,
    };

    return {
      ...form,
      submissionCount: stats.submissionCount,
      latestSubmissionAt: stats.latestSubmissionAt,
    };
  });
};

const getSubmissionFormById = async (formId) => {
  assertObjectId(formId, "Formulaire");

  const form = await BlogContent.findById(formId)
    .select("type title slug isPublished formDescription questions createdAt updatedAt")
    .lean();

  if (!form || form.type !== "form") {
    const error = new Error("Formulaire introuvable.");
    error.status = 404;
    throw error;
  }

  return form;
};

const listSubmissionsByForm = async (formId) => {
  const form = await getSubmissionFormById(formId);

  const submissions = await BlogFormSubmission.find({ formId })
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  return {
    form,
    submissions,
  };
};

const getSubmissionById = async (submissionId) => {
  assertObjectId(submissionId, "Soumission");

  const submission = await BlogFormSubmission.findById(submissionId)
    .populate("userId", "firstName lastName email")
    .populate("formId", "title slug isPublished")
    .lean();

  if (!submission) {
    const error = new Error("Soumission introuvable.");
    error.status = 404;
    throw error;
  }

  return submission;
};

const getFormStats = async (formId) => {
  assertObjectId(formId, "Formulaire");

  const form = await BlogContent.findById(formId)
    .select("type title questions")
    .lean();

  if (!form || form.type !== "form") {
    const error = new Error("Formulaire introuvable.");
    error.status = 404;
    throw error;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalCount, dailyCounts, answersAgg] = await Promise.all([
    BlogFormSubmission.countDocuments({ formId }),
    BlogFormSubmission.aggregate([
      { $match: { formId: new (require("mongoose").Types.ObjectId)(formId), createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    BlogFormSubmission.aggregate([
      { $match: { formId: new (require("mongoose").Types.ObjectId)(formId) } },
      { $unwind: "$answers" },
      { $group: { _id: { questionId: "$answers.questionId", value: "$answers.value", values: "$answers.values" }, count: { $sum: 1 } } },
    ]),
  ]);

  const OPTION_TYPES = new Set(["radio", "checkbox", "select"]);
  const questionStats = (form.questions || [])
    .filter((q) => OPTION_TYPES.has(q.type))
    .map((q) => {
      const qIdStr = String(q._id);
      const entries = answersAgg.filter((a) => String(a._id.questionId) === qIdStr);
      const distribution = {};
      entries.forEach((entry) => {
        const vals = Array.isArray(entry._id.values) && entry._id.values.length > 0
          ? entry._id.values
          : entry._id.value ? [entry._id.value] : [];
        vals.forEach((v) => {
          if (v) distribution[v] = (distribution[v] || 0) + entry.count;
        });
      });
      return { questionId: qIdStr, label: q.label, type: q.type, distribution };
    });

  return { totalCount, dailyCounts, questionStats };
};

module.exports = {
  createBlogFormSubmission,
  getFormStats,
  getSubmissionById,
  getSubmissionFormById,
  listSubmissionForms,
  listSubmissionsByForm,
};
