const { getBrowserView } = require("../windows/mainWindow");
const fs = require("fs");
const path = require("path");

class WeReadAutomation {
  constructor(config, eventEmitter) {
    this.config = config;
    this.emitter = eventEmitter;
    this.running = false;
    this.elapsedMinutes = 0;
    this._timer = null;
    this._sleepResolve = null;
    this._sleepReject = null;
    this._currentBookIndex = 0;
    this._backToBeginningCount = 0;
    this._lastBookFinishedTime = 0;
    this._pagesSinceLastStats = 0;
    this._booksSinceLastStats = 0;

    // Per-run log file
    const logDir = path.join(".weread", "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this._logFile = path.join(logDir, `${timestamp}.log`);
    fs.writeFileSync(this._logFile, "", "utf8");
  }

  _localTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  _debug(msg) {
    const line = `[${this._localTime()}] ${msg}\n`;
    try {
      fs.appendFileSync(this._logFile, line, "utf8");
    } catch (_) {}
    this.emitter?.emit("log", { userId: this.config.userId, message: `[${this._localTime()}] ${msg}` });
  }

  get cookieFile() { return path.join(".weread", this.config.userId, "cookies.json"); }

  async init() {
    const dir = path.dirname(this.cookieFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _wc() {
    const view = getBrowserView();
    if (!view || !view.webContents) return null;
    return view.webContents;
  }

  async _js(code) {
    const wc = this._wc();
    if (!wc) throw new Error("BrowserView not available");
    return wc.executeJavaScript(code, true);
  }

  async _wait(fn, timeoutMs = 5000, intervalMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await fn();
        if (result) return result;
      } catch (_) {}
      await this._sleep(intervalMs);
    }
    throw new Error(`Wait timeout after ${timeoutMs}ms`);
  }

  async _load(url) {
    const wc = this._wc();
    if (!wc) throw new Error("BrowserView not available");
    return new Promise((resolve) => {
      const handler = () => {
        wc.removeListener("did-finish-load", handler);
        clearTimeout(timeout);
        resolve();
      };
      wc.once("did-finish-load", handler);
      const timeout = setTimeout(() => {
        wc.removeListener("did-finish-load", handler);
        resolve();
      }, 30000);
      wc.loadURL(url);
    });
  }

  async _isLoggedIn() {
    try {
      const wc = this._wc();
      if (!wc) return false;
      const cookies = await wc.session.cookies.get({ name: "wr_vid" });
      return cookies.length > 0;
    } catch (_) { return false; }
  }

  async saveCookies() {
    try {
      const wc = this._wc();
      if (!wc) return;
      const cookies = await wc.session.cookies.get({ url: "https://weread.qq.com" });
      fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
      this._debug("Cookies saved");
    } catch (err) {
      this._debug("Failed to save cookies: " + err.message);
    }
  }

  async waitForLogin() {
    this._debug("等待扫码登录...");
    this.emitter?.emit("update", {
      running: true, minutes: 0, targetMinutes: 0, status: "login",
    });

    // Already on shelf/reader?
    const wc = this._wc();
    const currentUrl = wc?.getURL() || "";
    this._debug(`当前页面: ${currentUrl}`);

    if (currentUrl.includes("reader") || currentUrl.includes("web/shelf")) {
      this._debug("已在书架/阅读器，跳过扫码");
      await this.saveCookies();
      return true;
    }

    // Already has wr_vid cookie?
    if (await this._isLoggedIn()) {
      this._debug("已有 wr_vid cookie 跳过扫码");
      await this.saveCookies();
      return true;
    }

    this._debug("请在 BrowserView 中扫码登录...");

    while (this.running) {
      try {
        await this._wait(async () => {
          const wc = this._wc();
          if (!wc) return false;
          const url = wc.getURL();
          // Log only once per 30s
          if (Math.floor(Date.now() / 30000) !== this._lastLogSec) {
            this._debug(`等待登录, 当前URL: ${url}`);
            this._lastLogSec = Math.floor(Date.now() / 30000);
          }
          if (url.includes("reader") || url.includes("web/shelf")) return true;
          return await this._isLoggedIn();
        }, 300000, 2000);

        await this.saveCookies();
        this._debug("登录成功");
        return true;
      } catch (_) {
        if (!this.running) return false;
        this._debug("二维码过期，刷新页面...");
        const wc = this._wc();
        if (wc) wc.reload();
      }
    }
    return false;
  }

  async startReading() {
    this._debug("=== startReading called ===");
    this.running = true;
    this.elapsedMinutes = 0;
    this._pagesSinceLastStats = 0;
    this._booksSinceLastStats = 0;
    this._lastLogSec = 0;

    await this.init();
    this._debug("init done");

    // Wait for BrowserView
    this._debug("等待 BrowserView 就绪...");
    try {
      await this._wait(() => this._wc() !== null, 10000, 500);
    } catch (e) {
      this._debug("BrowserView 未就绪: " + e.message);
      this.running = false;
      return;
    }
    this._debug(`BrowserView URL: ${this._wc()?.getURL()}`);

    // Login
    const loginOk = await this.waitForLogin();
    if (!loginOk || !this.running) {
      await this.stop();
      return;
    }

    // Navigate to shelf if not already there
    const wc = this._wc();
    const curUrl = wc?.getURL() || "";
    if (!curUrl.includes("web/shelf")) {
      this._debug("导航到书架...");
      await this._load("https://weread.qq.com/web/shelf");
      await this._sleep(3000);
    } else {
      this._debug("已在书架页");
    }

    // Focus the BrowserView so it receives keyboard events
    if (wc) {
      try { wc.focus(); } catch (_) {}
    }

    await this._navigateToBook();

    this._debug("开始阅读循环...");
    this.emitter?.emit("update", {
      running: true, minutes: 0, targetMinutes: 0, status: "reading",
    });

    await this._readingLoop();
  }

  async _readingLoop() {
    this._debug("阅读循环开始（无限模式）");
    const startTime = Date.now();
    let lastFocusTime = 0;

    // Speed config
    const speedMap = { slow: [4000, 8000], normal: [2000, 4000], fast: [1000, 2000] };
    const speed = speedMap[this.config.speed] || speedMap.normal;

    while (this.running) {
      try {
        if (await this._isBookFinished()) {
          this._debug("检测到书已读完，回到开头...");
          await this._backToBeginning();
          continue;
        }

        const wc = this._wc();
        const url = wc?.getURL() || "";
        if (!url.includes("reader")) {
          this._debug("离开阅读器，重新导航...");
          await this._navigateToBook();
        }

        // Re-focus BrowserView every 30 seconds
        const now = Date.now();
        if (now - lastFocusTime > 30000 && wc) {
          try { wc.focus(); } catch (_) {}
          lastFocusTime = now;
        }

        const interval = Math.floor(Math.random() * (speed[1] - speed[0])) + speed[0];
        await this._sleep(interval);

        await this._turnPage();
      } catch (err) {
        if (!this.running) return;
        this._debug("阅读循环错误: " + err.message);
        try { await this._sleep(10000); } catch (_) {}
      }

      const elapsed = Math.floor((Date.now() - startTime) / 60000);
      if (elapsed !== this.elapsedMinutes) {
        this.elapsedMinutes = elapsed;
        this.emitter?.emit("update", {
          running: true, minutes: this.elapsedMinutes, targetMinutes: 0, status: "reading",
        });

        if (this.elapsedMinutes > 0 && this.elapsedMinutes % 5 === 0) {
          await this.saveCookies();
          this.emitter?.emit("stats", {
            minutes: 5,
            pagesRead: this._pagesSinceLastStats || 0,
            booksRead: this._booksSinceLastStats || 0,
          });
          this._pagesSinceLastStats = 0;
          this._booksSinceLastStats = 0;
        }
      }
    }

    this._debug(`阅读结束，总计 ${this.elapsedMinutes} 分钟`);
    this.emitter?.emit("complete", { minutes: this.elapsedMinutes });
    await this.stop();
  }

  async _navigateToBook() {
    const selection = this.config.selection ?? 3;
    const fallbackUrl = "https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7";

    // If already in a reader, just wait for it to load
    const wc = this._wc();
    const curUrl = wc?.getURL() || "";
    this._debug(`_navigateToBook: 当前URL=${curUrl}, selection=${selection}`);

    if (curUrl.includes("reader")) {
      this._debug("已在阅读器，等待加载");
      await this._sleep(2000);
      return;
    }

    // Navigate to shelf
    this._debug("打开书架...");
    await this._load("https://weread.qq.com/web/shelf");
    await this._sleep(3000);

    // Find books using reference project's selector
    try {
      const books = await this._js(`
        (function() {
          // Try multiple selectors matching reference project
          const cards = document.querySelectorAll('.wr_index_mini_shelf_card');
          if (cards.length > 0) {
            return Array.from(cards).map(c => ({ tag: c.tagName, outer: c.outerHTML?.slice(0, 100) }));
          }
          // Fallback: look for reader links
          const links = document.querySelectorAll('a[href*="/web/reader/"]');
          if (links.length > 0) {
            return Array.from(links).map(l => ({ tag: 'A', outer: l.outerHTML?.slice(0, 100) }));
          }
          return [];
        })()
      `);
      this._debug(`书架找到 ${books.length} 个元素`);
      if (books.length > 0) {
        this._debug(`第一个元素: ${books[0]?.outer || "N/A"}`);
      }
    } catch (e) {
      this._debug("查找书架元素失败: " + e.message);
    }

    // Try clicking book using reference project's selector
    let clicked = false;
    try {
      clicked = await this._js(`
        (function() {
          var idx = ${selection - 1};
          // Try shelf cards first (reference project selector)
          var cards = document.querySelectorAll('.wr_index_mini_shelf_card');
          if (cards.length > idx) {
            cards[idx].click();
            return 'card-' + (idx + 1);
          }
          if (cards.length > 0) {
            cards[0].click();
            return 'card-1';
          }
          // Fallback: reader links
          var links = document.querySelectorAll('a[href*="/web/reader/"]');
          if (links.length > idx) {
            links[idx].click();
            return 'link-' + (idx + 1);
          }
          if (links.length > 0) {
            links[0].click();
            return 'link-1';
          }
          return 'none';
        })()
      `);
      this._debug(`点击结果: ${clicked}`);
    } catch (e) {
      this._debug("点击书籍失败: " + e.message);
    }

    if (clicked === 'none') {
      this._debug("未找到书籍，使用默认 URL");
      await this._load(fallbackUrl);
    }

    await this._sleep(3000);
    const afterUrl = this._wc()?.getURL() || "";
    this._debug(`点击后 URL: ${afterUrl}`);

    if (!afterUrl.includes("reader")) {
      this._debug("点击后未进入阅读器，使用默认 URL");
      await this._load(fallbackUrl);
      await this._sleep(3000);
    }

    // Switch to vertical scroll mode
    await this._switchToVerticalMode();
    this._booksSinceLastStats = (this._booksSinceLastStats || 0) + 1;
  }

  async _isBookFinished() {
    const now = Date.now();
    if (now - this._lastBookFinishedTime < 10000) return false;

    try {
      const title = await this._js("document.title");
      if (title.includes("已读完")) {
        this._debug("检测到已读完（标题）");
        return true;
      }

      const hasPaid = await this._js(`
        Array.from(document.querySelectorAll('span')).some(el => el.textContent.includes('开通后即可阅读'))
      `);
      if (hasPaid) { this._debug("检测到付费提示"); return true; }

      const hasComplete = await this._js(`
        Array.from(document.querySelectorAll('div')).some(el => el.textContent.includes('全 书 完'))
      `);
      if (hasComplete) { this._debug("检测到全书完标记"); return true; }

      return false;
    } catch (e) {
      this._debug("检测完成状态失败: " + e.message);
      return false;
    }
  }

  async _backToBeginning() {
    this._debug("返回目录点击第一章...");
    const wc = this._wc();
    if (!wc) return;

    // Hide masks
    await this._js(`
      document.querySelectorAll('.wr_mask, .wr_mask_Show, .wr_readerMask').forEach(function(m) {
        m.style.display = 'none'; m.style.pointerEvents = 'none';
      });
    `).catch(() => {});

    // Click catalog button via real mouse click
    try {
      const btnInfo = await this._js(`
        (function() {
          var btn = document.querySelector('button[title="目录"]');
          if (!btn) return null;
          var r = btn.getBoundingClientRect();
          return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
        })()
      `);
      if (btnInfo) {
        this._debug("真实点击目录按钮 (" + btnInfo.x + "," + btnInfo.y + ")");
        wc.sendInputEvent({ type: "mouseDown", x: btnInfo.x, y: btnInfo.y, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseUp", x: btnInfo.x, y: btnInfo.y, button: "left" });
        await this._sleep(2000);
      } else {
        this._debug("未找到目录按钮");
      }
    } catch (e) { this._debug("点击目录失败: " + e.message); }

    // Click first chapter via real mouse click
    try {
      const chapterInfo = await this._js(`
        (function() {
          var chapters = document.querySelectorAll('li.readerCatalog_list_item');
          if (chapters.length === 0) return null;
          // Scroll first chapter into view
          chapters[0].scrollIntoView();
          // Click second chapter if available (skips cover/title page)
          var target = chapters.length > 1 ? chapters[1] : chapters[0];
          var r = target.getBoundingClientRect();
          return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), idx: chapters.length > 1 ? 2 : 1 };
        })()
      `);
      if (chapterInfo) {
        this._debug("真实点击第 " + chapterInfo.idx + " 个章节 (" + chapterInfo.x + "," + chapterInfo.y + ")");
        wc.sendInputEvent({ type: "mouseDown", x: chapterInfo.x, y: chapterInfo.y, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseUp", x: chapterInfo.x, y: chapterInfo.y, button: "left" });
        await this._sleep(3000);
        this._backToBeginningCount++;
        this._booksSinceLastStats = (this._booksSinceLastStats || 0) + 1;
      } else {
        this._debug("未找到章节列表");
      }
    } catch (e) { this._debug("点击章节失败: " + e.message); }

    this._lastBookFinishedTime = Date.now();
    await this._switchToVerticalMode();
  }

  async _turnPage() {
    const wc = this._wc();
    if (!wc) return;
    const url = wc?.getURL() || "";
    if (!url.includes("reader")) {
      this._debug("不在阅读器，尝试进入...");
      await this._navigateToBook();
      return;
    }

    let turned = false;

    // 1. Direct scroll (primary: works in vertical scroll mode)
    try {
      const scrollResult = await this._js(`
        (function() {
          var containers = [
            document.querySelector('.readerContentContainer'),
            document.querySelector('.wr_readerContent'),
            document.querySelector('.appContainer'),
            document.querySelector('.renderTarget'),
            document.querySelector('.readerContainer'),
            document.querySelector('[class*="readerContent"]'),
            document.querySelector('[class*="scroll"]'),
            document.documentElement,
            document.body
          ];
          for (var i = 0; i < containers.length; i++) {
            var el = containers[i];
            if (!el || el.scrollHeight <= el.clientHeight) continue;
            var before = el.scrollTop;
            el.scrollTop += 800;
            var after = el.scrollTop;
            if (after > before) return 'scroll ' + (after - before) + 'px';
          }
          var sy = window.scrollY;
          window.scrollBy(0, 800);
          if (window.scrollY > sy) return 'window-scroll ' + (window.scrollY - sy) + 'px';
          return 'no-scroll';
        })()
      `);
      if (scrollResult && scrollResult !== 'no-scroll') {
        this._debug("翻页: " + scrollResult);
        turned = true;
      } else {
        this._debug("无法滚动");
      }
    } catch (e) {
      this._debug("滚动异常: " + e.message);
    }

    // 2. "下一章/下一页" button - use real mouse click for React trust
    try {
      const btnInfo = await this._js(`
        (function() {
          var btn = document.querySelector('button[title="下一章"], button[title="下一页"]');
          if (!btn) return null;
          var r = btn.getBoundingClientRect();
          if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) return null;
          return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
        })()
      `);
      if (btnInfo && btnInfo.x && btnInfo.y) {
        this._debug("真实鼠标点击下一章/下一页  (" + btnInfo.x + "," + btnInfo.y + ")");
        // Use Electron input event for trusted click
        wc.sendInputEvent({ type: "mouseDown", x: btnInfo.x, y: btnInfo.y, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseUp", x: btnInfo.x, y: btnInfo.y, button: "left" });
        turned = true;
        // Wait for new chapter content to load
        await this._sleep(5000);
        // Try scrolling to kick-start content loading
        await this._js("window.scrollBy(0, 400);").catch(() => {});
      }
    } catch (e) {
      this._debug("下一章按钮异常: " + e.message);
    }

    // 3. Retry button
    if (!turned) {
      try {
        const retry = await this._js(`
          Array.from(document.querySelectorAll('div')).some(function(el) {
            if (el.textContent.includes('点击重试')) { el.click(); return true; }
            return false;
          })
        `);
        if (retry) { this._debug("点击重试"); turned = true; }
      } catch (_) {}
    }

    if (turned) this._pagesSinceLastStats++;
  }

  async _switchToVerticalMode() {
    try {
      const result = await this._js(`
        (function() {
          // Check what buttons exist for debugging
          var allBtns = document.querySelectorAll('button');
          var btnInfo = Array.from(allBtns).slice(0, 10).map(function(b) {
            return '{title: "' + (b.title || '') + '", class: "' + (b.className || '') + '", text: "' + (b.textContent || '').trim().slice(0, 20) + '"}';
          });

          // Try multiple selectors for the scroll mode toggle
          var btn = document.querySelector(
            'button[title="切换到上下滚动阅读"], ' +
            'button[title="切换到滚动阅读"], ' +
            'button.readerControls_item.isHorizontalReader'
          );
          if (btn) { btn.click(); return 'switched:' + btnInfo.join('|'); }
          return 'not-found:' + btnInfo.join('|');
        })()
      `);
      if (result && result.startsWith('switched')) {
        await this._sleep(1000);
        this._debug("已切换到上下滚动模式");
      } else {
        this._debug("切换按钮信息: " + (result || 'no result'));
      }
    } catch (e) {
      this._debug("切换垂直模式失败: " + e.message);
    }
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
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._sleepReject) { this._sleepReject(new Error("Sleep cancelled")); this._sleepReject = null; }
    await this.saveCookies();
    this.emitter?.emit("update", {
      running: false, minutes: this.elapsedMinutes, targetMinutes: 0,
    });
  }

  getStatus() {
    return { running: this.running, minutes: this.elapsedMinutes, targetMinutes: 0 };
  }
}

module.exports = { WeReadAutomation };
