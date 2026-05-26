const { EventEmitter } = require("events");
const { WeReadAutomation } = require("./wereadAutomation");
const { UserManager } = require("./userManager");
const { StatsTracker } = require("./statsTracker");

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.automation = null;
    this._status = { running: false, minutes: 0, targetMinutes: 0 };
    this._statsTracker = null;
    this._statsMinutes = 0;
  }

  async start() {
    this._statsTracker = new StatsTracker("user-1");
    this._statsMinutes = 0;

    // Read config for speed setting
    const { UserManager } = require("./userManager");
    const userConfig = new UserManager().getConfig();

    const automationConfig = {
      userId: "user-1",
      selection: userConfig.selection || 3,
      speed: userConfig.speed || "normal",
    };

    this.automation = new WeReadAutomation(automationConfig, this);

    this.on("update", (data) => {
      this._status = { ...this._status, ...data };
      if (data.minutes > 0 && this._status.status === "login") {
        delete this._status.status;
      }
    });

    this.on("stats", (data) => {
      this._statsMinutes += data.minutes;
      if (this._statsMinutes >= 5) {
        this._statsTracker?.recordSession(
          this._statsMinutes,
          data.pagesRead || 0,
          data.booksRead || 0,
        );
        this._statsMinutes = 0;
      }
    });

    this.on("complete", () => {
      if (this._statsMinutes > 0) {
        this._statsTracker?.recordSession(this._statsMinutes, 0, 0);
      }
      this.automation = null;
    });

    await this.automation.startReading();
  }

  async stop() {
    if (this.automation) {
      await this.automation.stop();
      if (this._statsMinutes > 0) {
        this._statsTracker?.recordSession(this._statsMinutes);
      }
    }
    this._status = { ...this._status, running: false };
    this.emit("update", this._status);
  }

  getStatus() {
    return this.automation ? this.automation.getStatus() : this._status;
  }
}

module.exports = { SessionManager };
