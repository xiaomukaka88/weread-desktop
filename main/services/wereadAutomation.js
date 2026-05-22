const { Builder, Browser, until, Key, By } = require("selenium-webdriver");
const ChromeOptions = require("selenium-webdriver/chrome").Options;
const FirefoxOptions = require("selenium-webdriver/firefox").Options;
const EdgeOptions = require("selenium-webdriver/edge").Options;
const fs = require("fs");
const path = require("path");

class WeReadAutomation {
  constructor(config, eventEmitter) {
    this.config = config;
    this.emitter = eventEmitter;
    this.driver = null;
    this.running = false;
    this.elapsedMinutes = 0;
    this._timer = null;
    this._sleepResolve = null;
    this._sleepReject = null;
  }

  get dataDir() {
    return path.resolve(this.config.dataDir || ".weread");
  }

  get cookieFile() { return path.join(this.dataDir, "cookies.json"); }

  log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.emitter?.emit("log", { userId: this.config.userId, message: line });
  }

  async init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async buildDriver() {
    const browserType = this.config.browser || Browser.CHROME;
    let options;
    switch (browserType) {
      case Browser.FIREFOX:
        options = new FirefoxOptions();
        break;
      case "MicrosoftEdge":
        options = new EdgeOptions();
        break;
      default:
        options = new ChromeOptions();
    }

    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    const profileDir = path.join(this.dataDir, "profile");
    if (fs.existsSync(profileDir) && browserType === Browser.CHROME) {
      options.addArguments(`--user-data-dir=${profileDir}`);
    }

    const driver = await new Builder()
      .forBrowser(browserType)
      .setOptions(options)
      .build();

    return driver;
  }

  async loadCookies() {
    if (!fs.existsSync(this.cookieFile)) return false;
    try {
      const cookies = JSON.parse(fs.readFileSync(this.cookieFile, "utf8"));
      return cookies.length > 0;
    } catch (_) {
      return false;
    }
  }

  async saveCookies() {
    try {
      const cookies = await this.driver.manage().getCookies();
      fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
      this.log("Cookies saved");
    } catch (err) {
      this.log("Failed to save cookies: " + err.message);
    }
  }

  async waitForLogin() {
    this.log("Waiting for login...");
    const WAIT_URL = "https://weread.qq.com/";

    while (this.running) {
      await this.driver.get(WAIT_URL);
      this.log("Please scan QR code to login...");

      try {
        await this.driver.wait(
          until.urlContains("reader"),
          300000,
        );
        await this.saveCookies();
        this.log("Login successful");
        return true;
      } catch (_) {
        const currentUrl = await this.driver.getCurrentUrl();
        if (currentUrl.includes("weread.qq.com")) {
          this.log("Still waiting for login...");
        }
      }

      if (!this.running) return false;
    }
    return false;
  }

  async startReading() {
    this.running = true;
    this.elapsedMinutes = 0;
    this._pagesSinceLastStats = 0;
    this._booksSinceLastStats = 0;

    await this.init();
    this.driver = await this.buildDriver();

    const hasCookies = await this.loadCookies();
    if (hasCookies) {
      await this.driver.get("https://weread.qq.com/");
      try {
        await this.driver.sleep(2000);
        const cookies = JSON.parse(fs.readFileSync(this.cookieFile, "utf8"));
        for (const cookie of cookies) {
          try {
            await this.driver.manage().addCookie(cookie);
          } catch (_) {}
        }
        await this.driver.get("https://weread.qq.com/");
        await this.driver.wait(until.urlContains("reader"), 10000);
      } catch (_) {
        this.log("Cookie login failed, falling back to QR");
        await this.waitForLogin();
      }
    } else {
      await this.waitForLogin();
    }

    if (!this.running) return;
    await this._readingLoop();
  }

  async _readingLoop() {
    const targetMinutes = this.config.duration || 68;

    while (this.running && this.elapsedMinutes < targetMinutes) {
      try {
        const currentUrl = await this.driver.getCurrentUrl();
        if (!currentUrl.includes("reader")) {
          await this._navigateToBook();
        }

        const waitSeconds = this._getRandomPageTime();
        this.log(`Reading for ${waitSeconds}s...`);
        await this._sleep(waitSeconds * 1000);

        await this._turnPage();

        this.elapsedMinutes += 1;
        this.emitter?.emit("update", {
          running: true,
          minutes: this.elapsedMinutes,
          targetMinutes: targetMinutes,
        });

        if (this.elapsedMinutes % 5 === 0) {
          await this.saveCookies();
          this.emitter?.emit("stats", {
            minutes: 5,
            pagesRead: this._pagesSinceLastStats || 0,
            booksRead: this._booksSinceLastStats || 0,
          });
          this._pagesSinceLastStats = 0;
          this._booksSinceLastStats = 0;
        }

      } catch (err) {
        if (!this.running) return;
        this.log("Reading loop error: " + err.message);
        try {
          await this._sleep(10000);
        } catch (_) {
          if (!this.running) return;
        }
      }
    }

    if (this.elapsedMinutes >= targetMinutes) {
      this.log(`Target reached: ${targetMinutes} minutes`);
      this.emitter?.emit("complete", { minutes: this.elapsedMinutes });
    }

    await this.stop();
  }

  async _navigateToBook() {
    const selection = this.config.selection ?? 2;
    if (selection === -1) {
      this.log("Random selection, using default book");
      await this.driver.get(
        "https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7"
      );
    } else {
      await this.driver.get("https://weread.qq.com/web/shelf");
      await this.driver.sleep(2000);
      try {
        const books = await this.driver.findElements(By.css(".shelf-item"));
        if (books.length >= selection) {
          await books[selection - 1].click();
        } else {
          await this.driver.get(
            "https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7"
          );
        }
      } catch (_) {
        await this.driver.get(
          "https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7"
        );
      }
    }
    this._booksSinceLastStats = (this._booksSinceLastStats || 0) + 1;
    await this.driver.sleep(3000);
  }

  async _turnPage() {
    try {
      await this.driver.findElement(By.tagName("body")).sendKeys(Key.SPACE);
      this._pagesSinceLastStats = (this._pagesSinceLastStats || 0) + 1;
    } catch (_) {
      const body = await this.driver.findElement(By.tagName("body"));
      await body.click();
      this._pagesSinceLastStats = (this._pagesSinceLastStats || 0) + 1;
    }
  }

  _getRandomPageTime() {
    const speed = this.config.speed || "slow";
    const ranges = { slow: [30, 90], normal: [15, 60], fast: [8, 30] };
    const [min, max] = ranges[speed] || ranges.slow;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _sleep(ms) {
    return new Promise((resolve, reject) => {
      this._sleepResolve = resolve;
      this._sleepReject = reject;
      this._timer = setTimeout(() => {
        this._timer = null;
        this._sleepResolve = null;
        this._sleepReject = null;
        resolve();
      }, ms);
    });
  }

  async stop() {
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._sleepReject) {
      this._sleepReject(new Error("Sleep cancelled"));
      this._sleepReject = null;
    }
    if (this.driver) {
      try {
        await this.saveCookies();
        await this.driver.quit();
      } catch (_) {}
      this.driver = null;
    }
    this.emitter?.emit("update", {
      running: false,
      minutes: this.elapsedMinutes,
      targetMinutes: this.config.duration,
    });
  }

  getStatus() {
    return {
      running: this.running,
      minutes: this.elapsedMinutes,
      targetMinutes: this.config.duration || 68,
    };
  }
}

module.exports = { WeReadAutomation };
