const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

const DEFAULT_CONFIG = {
  selection: 3,
  speed: "normal",
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
}

module.exports = { UserManager, CONFIG_PATH };
