const dashboardNotificationService = require("../services/dashboardNotificationService");

const listUnreadDashboardNotifications = async (req, res) => {
  try {
    const items = await dashboardNotificationService.listUnreadDashboardNotifications({
      userId: req.user?.sub,
    });

    return res.status(200).json({
      items,
      unreadCount: items.length,
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const markDashboardNotificationsRead = async (req, res) => {
  try {
    const result = await dashboardNotificationService.markDashboardNotificationsRead({
      userId: req.user?.sub,
      notificationIds: req.body?.notificationIds,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  listUnreadDashboardNotifications,
  markDashboardNotificationsRead,
};
