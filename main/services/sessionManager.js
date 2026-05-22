const { EventEmitter } = require("events");
const { WeReadAutomation } = require("./wereadAutomation");
const { UserManager } = require("./userManager");
const { StatsTracker } = require("./statsTracker");

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.automation = null;
    this._status = { running: false, minutes: 0, targetMinutes: 68 };
    this._statsTracker = null;
    this._statsMinutes = 0;
  }

  async start(userId) {
    const um = new UserManager();
    const config = um.getConfig();
    const user = config.users[userId];
    if (!user) return;

    this._statsTracker = new StatsTracker(userId);
    this._statsMinutes = 0;

    const automationConfig = {
      userId,
      duration: user.duration,
      browser: user.browser,
      selection: user.selection,
      speed: user.speed,
      dataDir: `.weread/${userId}`,
    };

    this.automation = new WeReadAutomation(automationConfig, this);

    this.on("update", (data) => {
      this._status = data;
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

  async loginUser(userId) {
    const um = new UserManager();
    const config = um.getConfig();
    const user = config.users[userId];
    if (!user) return { success: false, error: "User not found" };

    const automationConfig = {
      userId,
      duration: user.duration,
      browser: user.browser,
      selection: user.selection,
      speed: user.speed,
      dataDir: `.weread/${userId}`,
    };

    const auth = new WeReadAutomation(automationConfig, this);
    try {
      await auth.login();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStatus() {
    return this.automation ? this.automation.getStatus() : this._status;
  }
}

module.exports = { SessionManager };
