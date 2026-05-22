const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

const DEFAULT_CONFIG = {
  activeUserId: "user-1",
  users: {
    "user-1": {
      id: "user-1",
      name: "默认用户",
      duration: 68,
      browser: "chrome",
      selection: 2,
      speed: "slow",
      email: { enabled: false, smtp: "", user: "", pass: "", from: "", to: "", port: 465 },
      bark: { key: "", server: "https://api.day.app" },
      schedule: { enabled: false, intervalMinutes: 360 },
    },
  },
};

class UserManager {
  constructor() {
    this.config = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      }
    } catch (_) {}
    this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  save(config) {
    this.config = config;
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  getConfig() { return this.config; }
  getActiveUser() { return this.config.users[this.config.activeUserId]; }

  setActiveUser(userId) {
    if (this.config.users[userId]) {
      this.config.activeUserId = userId;
      this.save(this.config);
    }
  }

  addUser(user) {
    this.config.users[user.id] = user;
    this.save(this.config);
  }

  removeUser(userId) {
    if (userId === this.config.activeUserId) return;
    delete this.config.users[userId];
    this.save(this.config);
  }

  isLoggedIn(userId) {
    // Match the path used in wereadAutomation.js: resolve(".weread/{userId}/cookies.json")
    const cookiePath = path.resolve(path.join(".weread", userId, "cookies.json"));
    try {
      if (fs.existsSync(cookiePath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
        return cookies.length > 0;
      }
    } catch (_) {}
    return false;
  }
}

module.exports = { UserManager, CONFIG_PATH };
