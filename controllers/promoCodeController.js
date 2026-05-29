const promoCodeService = require("../services/promoCodeService");

const createPromoCode = async (req, res) => {
  try {
    const promoCode = await promoCodeService.createPromoCode(req.body || {});
    return res.status(201).json({ promoCode });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listPromoCodes = async (req, res) => {
  try {
    const promoCodes = await promoCodeService.listPromoCodes();
    return res.status(200).json({ promoCodes });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const generatePromoCode = async (_req, res) => {
  try {
    const code = await promoCodeService.generateUniquePromoCode();
    return res.status(200).json({ code });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getPromoCode = async (req, res) => {
  try {
    const promoCode = await promoCodeService.getPromoCodeById(req.params.id);
    return res.status(200).json({ promoCode });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updatePromoCode = async (req, res) => {
  try {
    const promoCode = await promoCodeService.updatePromoCode(
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ promoCode });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deletePromoCode = async (req, res) => {
  try {
    const promoCode = await promoCodeService.deletePromoCode(req.params.id);
    return res.status(200).json({ promoCode });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const setPromoCodeActive = async (req, res) => {
  try {
    const { isActive } = req.body || {};
    let parsedIsActive = isActive;

    if (typeof isActive === "string") {
      const normalized = isActive.trim().toLowerCase();
      if (normalized === "true") {
        parsedIsActive = true;
      } else if (normalized === "false") {
        parsedIsActive = false;
      }
    }

    if (typeof parsedIsActive !== "boolean") {
      const error = new Error("isActive must be a boolean");
      error.status = 400;
      throw error;
    }

    const promoCode = await promoCodeService.updatePromoCode(req.params.id, {
      isActive: parsedIsActive,
    });
    return res.status(200).json({ promoCode });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const validatePromoCodeForCheckout = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "admin" &&
      role !== "super_admin" &&
      role !== "ticket_office" &&
      role !== "customer" &&
      role !== "guest"
    ) {
      return res.status(403).json({ message: "Accès refuse" });
    }

    const result = await promoCodeService.validatePromoCodeForCheckout({
      promoCode: req.body?.code,
      subtotalAmount: req.body?.subtotalAmount,
      userId: req.user?.sub,
      userRole: role,
      customerContact: req.body?.customerContact || null,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getPublicPromoCodes = async (req, res) => {
  try {
    const isAuthenticated = req.user?.role === "customer";
    const codes = await promoCodeService.listPublicPromoCodes({ isAuthenticated });
    return res.status(200).json({ promoCodes: codes });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createPromoCode,
  listPromoCodes,
  generatePromoCode,
  getPromoCode,
  updatePromoCode,
  deletePromoCode,
  setPromoCodeActive,
  validatePromoCodeForCheckout,
  getPublicPromoCodes,
};
