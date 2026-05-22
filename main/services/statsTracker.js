const fs = require("fs");
const path = require("path");
const { app } = require("electron");

class StatsTracker {
  constructor(userId) {
    this.userId = userId;
    this.statsPath = path.join(app.getPath("userData"), "stats", userId, "daily.json");
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.statsPath)) {
        return JSON.parse(fs.readFileSync(this.statsPath, "utf8"));
      }
    } catch (_) {}
    return { days: [], roundStart: null, roundDay: 0 };
  }

  save() {
    const dir = path.dirname(this.statsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statsPath, JSON.stringify(this.data, null, 2));
  }

  recordSession(minutes) {
    const today = new Date().toISOString().slice(0, 10);
    let day = this.data.days.find((d) => d.date === today);
    if (!day) {
      day = { date: today, minutes: 0, pagesRead: 0, booksRead: 0 };
      this.data.days.push(day);
    }
    day.minutes += minutes;
    this.data.roundDay += 1;
    this.save();
  }

  getSummary() {
    const totalMinutes = this.data.days.reduce((sum, d) => sum + d.minutes, 0);
    const totalDays = this.data.days.length;
    const roundMinutes = this.data.days
      .filter((d) => d.date >= (this.data.roundStart || "2000-01-01"))
      .reduce((sum, d) => sum + d.minutes, 0);
    return {
      totalMinutes,
      totalDays,
      roundMinutes,
      roundDay: this.data.roundDay,
      roundTargetDays: 29,
      roundTargetMinutes: 300 * 60,
      daysProgress: Math.min(100, (this.data.roundDay / 29) * 100),
      minutesProgress: Math.min(100, (roundMinutes / (300 * 60)) * 100),
    };
  }

  getDailyData() {
    return this.data.days.slice(-30).map((d) => ({
      date: d.date.slice(5),
      minutes: d.minutes,
    }));
  }
}

module.exports = { StatsTracker };
