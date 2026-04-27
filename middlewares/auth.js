const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  hasDashboardPermission,
  isDashboardStaffRole,
} = require("../config/dashboardPermissions");

const extractToken = (req) => {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  return bearerToken || req.headers["x-access-token"] || "";
};

const buildRequestUser = async (payload) => {
  if (!payload?.sub) {
    return null;
  }

  const user = await User.findById(payload.sub)
    .select(
      "_id email firstName lastName role status roleDetails.permissions roleDetails.permissionsConfigured roleDetails.isActive",
    )
    .lean();

  if (!user) {
    return null;
  }

  return {
    sub: user._id.toString(),
    email: user.email || payload.email || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    role: user.role || payload.role || "",
    status: user.status || "active",
    roleDetails: user.roleDetails || {},
  };
};

const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ message: "Token manquant" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET n'est pas defini" });
    }

    const payload = jwt.verify(token, secret);
    const user = await buildRequestUser(payload);

    if (!user) {
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    req.user = user;

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalide" });
  }
};

const optionalAuthenticate = async (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      req.user = null;
      return next();
    }

    const payload = jwt.verify(token, secret);
    const user = await buildRequestUser(payload);
    req.user = user;
    return next();
  } catch (_error) {
    req.user = null;
    return next();
  }
};

const requireAdmin = (req, res, next) => {
  return authenticate(req, res, () => {
    if (!req.user || !isDashboardStaffRole(req.user.role)) {
      return res.status(403).json({ message: "Accès admin requis" });
    }

    return next();
  });
};

const requireSuperAdmin = (req, res, next) => {
  return authenticate(req, res, () => {
    if (!req.user || req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Accès super administrateur requis" });
    }

    return next();
  });
};

const requireDashboardPermission = (moduleKey, action) => {
  return (req, res, next) =>
    authenticate(req, res, () => {
      if (!hasDashboardPermission(req.user, moduleKey, action)) {
        return res.status(403).json({ message: "Permission insuffisante" });
      }

      return next();
    });
};

const requireStaffRoles = (roles = []) => {
  const allowedRoles = new Set(Array.isArray(roles) ? roles : []);

  return (req, res, next) =>
    authenticate(req, res, () => {
      if (!req.user || !allowedRoles.has(req.user.role)) {
        return res.status(403).json({ message: "Accès refuse" });
      }

      return next();
    });
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
  requireDashboardPermission,
  requireStaffRoles,
  requireSuperAdmin,
};
