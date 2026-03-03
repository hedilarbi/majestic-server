const cron = require("node-cron");
const Session = require("../models/Session");

const TUNISIA_TIMEZONE = "Africa/Tunis";
const ACTIVE_SESSION_STATUSES = ["pending", "scheduled", "in_progress"];
const getDatePartsInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
};

const getTimeZoneOffsetMinutes = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });

  const timeZoneName = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(timeZoneName || "");
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
};

const buildSessionDateTimeUtc = (sessionDate, sessionTime) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(sessionTime || "");
  if (!match) {
    return null;
  }

  const { year, month, day } = getDatePartsInTimeZone(
    sessionDate,
    TUNISIA_TIMEZONE
  );
  if (!year || !month || !day) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(naiveUtcMs),
    TUNISIA_TIMEZONE
  );

  return new Date(naiveUtcMs - offsetMinutes * 60 * 1000);
};

const startSessionStatusCron = () => {
  let running = false;
  const task = cron.schedule(
    "* * * * *",
    async () => {
      if (running) {
        return;
      }
      running = true;

      try {
        const now = new Date();
        const sessions = await Session.find({
          status: { $in: ACTIVE_SESSION_STATUSES },
        }).select("_id date sessionTime");

        const sessionIdsToComplete = [];
        sessions.forEach((session) => {
          const sessionDateTimeUtc = buildSessionDateTimeUtc(
            session.date,
            session.sessionTime
          );

          if (sessionDateTimeUtc && now > sessionDateTimeUtc) {
            sessionIdsToComplete.push(session._id);
          }
        });

        if (sessionIdsToComplete.length > 0) {
          await Session.updateMany(
            { _id: { $in: sessionIdsToComplete } },
            { $set: { status: "completed" } }
          );
        }
      } catch (error) {
        console.error("sessionStatusCron error:", error);
      } finally {
        running = false;
      }
    },
    {
      timezone: TUNISIA_TIMEZONE,
    }
  );

  return {
    stop: () => task.stop(),
  };
};

module.exports = { startSessionStatusCron };
