const DASHBOARD_PERMISSION_ACTIONS = ["list", "create", "update", "delete"];

const DASHBOARD_PERMISSION_DEFINITIONS = [
  { module: "dashboard", label: "Tableau de bord", actions: ["list"] },
  {
    module: "events",
    label: "Événements",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "sessions",
    label: "Séances",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "promo_codes",
    label: "Codes promo",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "session_times",
    label: "Horaires des séances",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "pricing",
    label: "Tarifs",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "subscriptions",
    label: "Abonnements",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "versions",
    label: "Versions",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "show_types",
    label: "Types de spectacle",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "home_hero",
    label: "Affiches",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "rooms",
    label: "Salles",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "staffs",
    label: "Staff",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "reservation_requests",
    label: "Demandes de réservation",
    actions: DASHBOARD_PERMISSION_ACTIONS,
  },
  {
    module: "blog_form_submissions",
    label: "Blogue - Soumissions de formulaires",
    actions: ["list"],
  },
  {
    module: "cash_registers",
    label: "Caisse",
    actions: ["list", "update"],
  },
  {
    module: "statistics",
    label: "Statistiques",
    actions: ["list"],
  },
  {
    module: "audit_logs",
    label: "Audit",
    actions: ["list"],
  },
  {
    module: "sales_transactions",
    label: "Ventes - Transactions",
    actions: ["list"],
  },
  {
    module: "sales_tickets",
    label: "Ventes - Billets",
    actions: ["list"],
  },
  {
    module: "sales_subscriptions",
    label: "Ventes - Abonnements",
    actions: ["list"],
  },
  {
    module: "users",
    label: "Utilisateurs",
    actions: ["list", "update"],
  },
];

const STAFF_DASHBOARD_ROLES = ["admin", "super_admin"];
const STAFF_LOGIN_ROLES = [
  "admin",
  "super_admin",
  "blog_manager",
  "cashier",
  "ticket_office",
  "door_staff",
];

const definitionLookup = new Map(
  DASHBOARD_PERMISSION_DEFINITIONS.map((definition) => [
    definition.module,
    {
      ...definition,
      actions: Array.from(
        new Set(
          Array.isArray(definition.actions)
            ? definition.actions.filter((action) =>
                DASHBOARD_PERMISSION_ACTIONS.includes(action),
              )
            : [],
        ),
      ),
    },
  ]),
);

const buildPermissionKey = (moduleKey, action) => `${moduleKey}.${action}`;

const ALL_PERMISSION_KEYS = DASHBOARD_PERMISSION_DEFINITIONS.flatMap(
  (definition) =>
    definition.actions.map((action) =>
      buildPermissionKey(definition.module, action),
    ),
);

const ALL_PERMISSION_KEYS_SET = new Set(ALL_PERMISSION_KEYS);

const normalizePermissionList = (permissions) => {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return Array.from(
    new Set(
      permissions
        .map((permission) =>
          typeof permission === "string" ? permission.trim() : "",
        )
        .filter((permission) => ALL_PERMISSION_KEYS_SET.has(permission)),
    ),
  );
};

const getDefinition = (moduleKey) => definitionLookup.get(moduleKey) || null;

const isDashboardStaffRole = (role) => STAFF_DASHBOARD_ROLES.includes(role);

const isStaffLoginRole = (role) => STAFF_LOGIN_ROLES.includes(role);

const isLegacyAdmin = (user) =>
  user?.role === "admin" &&
  user?.roleDetails?.permissionsConfigured !== true;

const getGrantedPermissions = (user) => {
  if (!user) {
    return [];
  }

  if (user.role === "super_admin" || isLegacyAdmin(user)) {
    return [...ALL_PERMISSION_KEYS];
  }

  if (user.role !== "admin") {
    return [];
  }

  return normalizePermissionList(user?.roleDetails?.permissions);
};

const hasDashboardPermission = (user, moduleKey, action) => {
  const definition = getDefinition(moduleKey);

  if (!definition || !definition.actions.includes(action)) {
    return false;
  }

  if (!user || !isDashboardStaffRole(user.role)) {
    return false;
  }

  if (user.role === "super_admin" || isLegacyAdmin(user)) {
    return true;
  }

  return getGrantedPermissions(user).includes(
    buildPermissionKey(moduleKey, action),
  );
};

module.exports = {
  DASHBOARD_PERMISSION_ACTIONS,
  DASHBOARD_PERMISSION_DEFINITIONS,
  STAFF_DASHBOARD_ROLES,
  STAFF_LOGIN_ROLES,
  ALL_PERMISSION_KEYS,
  buildPermissionKey,
  getDefinition,
  getGrantedPermissions,
  hasDashboardPermission,
  isDashboardStaffRole,
  isLegacyAdmin,
  isStaffLoginRole,
  normalizePermissionList,
};
