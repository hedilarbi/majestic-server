const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const adminRoutes = require("./routes/users");
const staffRoutes = require("./routes/staffs");
const pricingRoutes = require("./routes/pricing");
const sessionTimeRoutes = require("./routes/session-times");
const languageRoutes = require("./routes/languages");
const uploadRoutes = require("./routes/uploads");
const eventRoutes = require("./routes/events");
const roomRoutes = require("./routes/rooms");
const sessionRoutes = require("./routes/sessions");
const showTypeRoutes = require("./routes/show-types");
const homeHeroRoutes = require("./routes/home-hero");
const aLafficheRoutes = require("./routes/a-laffiche");
require("dotenv/config");

const { createServer } = require("http");

const app = express();
const httpServer = createServer(app);

app.use(cors());

app.use(bodyParser.json({ limit: "1000mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "1000mb", extended: true }));

app.use("/admin", adminRoutes);
app.use("/staff", staffRoutes);
app.use("/pricing", pricingRoutes);
app.use("/session-times", sessionTimeRoutes);
app.use("/languages", languageRoutes);
app.use("/uploads", uploadRoutes);
app.use("/events", eventRoutes);
app.use("/rooms", roomRoutes);
app.use("/sessions", sessionRoutes);
app.use("/show-types", showTypeRoutes);
app.use("/home-hero", homeHeroRoutes);
app.use("/a-laffiche", aLafficheRoutes);

mongoose.connect(process.env.DB_CONNECTION);

httpServer.listen(process.env.PORT, () => {
  console.log("listening on port 5000");
});
