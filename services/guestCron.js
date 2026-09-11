const cron = require("node-cron");
const { deleteInactiveGuests } = require("./guestService");

const startGuestCron = () => {
  // Run every day at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("[Guest Cron] Starting inactive guests cleanup...");
    await deleteInactiveGuests();
  });
  console.log("[Guest Cron] Scheduled inactive guest cleanup to run at midnight every day.");
};

module.exports = {
  startGuestCron,
};
