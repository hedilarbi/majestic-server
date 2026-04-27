const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const adminRoutes = require("./routes/users");
const staffRoutes = require("./routes/staffs");
const customerRoutes = require("./routes/customers");
const pricingRoutes = require("./routes/pricing");
const sessionTimeRoutes = require("./routes/session-times");
const languageRoutes = require("./routes/languages");
const uploadRoutes = require("./routes/uploads");
const eventRoutes = require("./routes/events");
const roomRoutes = require("./routes/rooms");
const sessionRoutes = require("./routes/sessions");
const showTypeRoutes = require("./routes/show-types");
const homeHeroRoutes = require("./routes/home-hero");
const subscriptionRoutes = require("./routes/subscriptions");
const guestRoutes = require("./routes/guests");
const usersMeRoutes = require("./routes/users-me");
const seatMapRoutes = require("./routes/seatMap");
const reservationRoutes = require("./routes/reservations");
const promoCodeRoutes = require("./routes/promo-codes");
const bookingRoutes = require("./routes/bookings");
const ticketRoutes = require("./routes/tickets");
const subscriptionSalesRoutes = require("./routes/subscription-sales");
const offersRoutes = require("./routes/offers");
const blogContentRoutes = require("./routes/blog-contents");
const blogFormSubmissionRoutes = require("./routes/blog-form-submissions");
const spaceReservationRequestRoutes = require("./routes/space-reservation-requests");
const cashRegisterRoutes = require("./routes/cash-registers");
const statisticsRoutes = require("./routes/statistics");
const dashboardNotificationRoutes = require("./routes/dashboard-notifications");
const auditLogRoutes = require("./routes/audit-logs");
const paymentRoutes = require("./routes/payments");

require("dotenv/config");

const { createServer } = require("http");
const { Server } = require("socket.io");
const { startExpirationWatcher } = require("./services/ExpirationWatcher");
const { startSessionStatusCron } = require("./services/sessionStatusCron");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  },
});

io.on("connection", (socket) => {
  socket.on("join-session", ({ sessionId } = {}) => {
    if (sessionId) {
      socket.join(`session-${sessionId}`);
    }
  });

  socket.on("leave-session", ({ sessionId } = {}) => {
    if (sessionId) {
      socket.leave(`session-${sessionId}`);
    }
  });
});

app.use(cors());

app.use(bodyParser.json({ limit: "1000mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "1000mb", extended: true }));
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use("/admin", adminRoutes);
app.use("/staff", staffRoutes);
app.use("/customers", customerRoutes);
app.use("/pricing", pricingRoutes);
app.use("/session-times", sessionTimeRoutes);
app.use("/languages", languageRoutes);
app.use("/uploads", uploadRoutes);
app.use("/events", eventRoutes);
app.use("/rooms", roomRoutes);
app.use("/sessions", sessionRoutes);
app.use("/show-types", showTypeRoutes);
app.use("/home-hero", homeHeroRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/guests", guestRoutes);
app.use("/users", usersMeRoutes);
app.use("/map-sessions", seatMapRoutes);
app.use("/reservations", reservationRoutes);
app.use("/promo-codes", promoCodeRoutes);
app.use("/bookings", bookingRoutes);
app.use("/tickets", ticketRoutes);
app.use("/subscription-sales", subscriptionSalesRoutes);
app.use("/offers", offersRoutes);
app.use("/blog-contents", blogContentRoutes);
app.use("/blog-form-submissions", blogFormSubmissionRoutes);
app.use("/space-reservation-requests", spaceReservationRequestRoutes);
app.use("/cash-registers", cashRegisterRoutes);
app.use("/statistics", statisticsRoutes);
app.use("/dashboard-notifications", dashboardNotificationRoutes);
app.use("/audit-logs", auditLogRoutes);
app.use("/payments", paymentRoutes);

mongoose
  .connect(process.env.DB_CONNECTION)
  .then(() => {
    startExpirationWatcher({ io });
    startSessionStatusCron();
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

httpServer.listen(process.env.PORT, () => {
  console.log("listening on port 5000");
});
