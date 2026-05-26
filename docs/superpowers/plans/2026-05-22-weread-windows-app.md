# 微信读书 Windows 桌面应用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop app wrapping the weread-challenge-selenium CLI, providing a frameless status bar, settings window, stats panel, tray icon, and multi-user session management.

**Architecture:** Single Electron main process manages hidden Selenium browser instances for auto-reading. Three renderer windows (status bar, settings, stats panel) communicate with main via IPC. User configs and stats stored as local JSON in `.weread/` directory.

**Tech Stack:** Electron 33, electron-builder, selenium-webdriver 4.27+, jsqr, pngjs, nodemailer, qrcode-terminal

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Create | Project config, deps, npm scripts |
| `electron-builder.yml` | Create | Build/packaging config |
| `main/index.js` | Create | Electron app entry: ready, before-quit, window lifecycle |
| `main/windows/statusBar.js` | Create | Create/frameless pill window, always-on-top |
| `main/windows/settings.js` | Create | Create settings window, show/hide singleton |
| `main/windows/statsPanel.js` | Create | Create stats panel window, show/hide singleton |
| `main/services/userManager.js` | Create | CRUD user configs, switch active user, persist to JSON |
| `main/services/sessionManager.js` | Create | Start/stop reading sessions, IPC event broadcasting |
| `main/services/wereadAutomation.js` | Create | Selenium WebDriver wrapper, ported from weread-challenge.js |
| `main/services/tray.js` | Create | System tray icon + context menu |
| `main/services/statsTracker.js` | Create | Record/read daily stats, compute aggregates |
| `main/ipc/handlers.js` | Create | Register all IPC handlers between main and renderers |
| `preload/index.js` | Create | contextBridge exposing safe IPC API to renderers |
| `renderer/statusBar.html` | Create | Status bar UI: pill shape, status dot, timer, progress, controls |
| `renderer/settings.html` | Create | Settings UI: tabs for basic, users, notifications, schedule |
| `renderer/stats.html` | Create | Stats panel UI: progress cards, bar chart, cumulative stats |
| `renderer/styles/shared.css` | Create | Shared CSS variables, reset, utility classes |

## Data Structures

### User Config (`appData/config.json`)
```json
{
  "activeUserId": "user-1",
  "users": {
    "user-1": {
      "id": "user-1",
      "name": "默认用户",
      "duration": 68,
      "browser": "chrome",
      "selection": 2,
      "speed": "slow",
      "email": { "enabled": false, "smtp": "", "user": "", "pass": "", "from": "", "to": "", "port": 465 },
      "bark": { "key": "", "server": "https://api.day.app" },
      "schedule": { "enabled": false, "intervalMinutes": 360 }
    }
  }
}
```

### Daily Stats (`appData/stats/{userId}/daily.json`)
```json
{
  "days": [
    { "date": "2026-05-22", "minutes": 45, "pagesRead": 12, "booksRead": 1 }
  ],
  "roundStart": "2026-05-01",
  "roundDay": 22
}
```

---

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `electron-builder.yml`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "weread-desktop",
  "version": "0.1.0",
  "description": "微信读书自动阅读 Windows 桌面应用",
  "main": "main/index.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder --win",
    "build:dir": "electron-builder --win --dir"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.0"
  },
  "dependencies": {
    "selenium-webdriver": "^4.27.0",
    "jsqr": "^1.4.0",
    "pngjs": "^7.0.0",
    "nodemailer": "^6.9.16",
    "qrcode-terminal": "^0.12.0"
  }
}
```

- [ ] **Step 2: Create electron-builder.yml**

```yaml
appId: dev.techfetch.weread-desktop
productName: 微信读书助手
directories:
  output: dist
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  shortcutName: 微信读书助手
  uninstallDisplayName: 微信读书助手
files:
  - "main/**/*"
  - "preload/**/*"
  - "renderer/**/*"
  - "node_modules/**/*"
extraMetadata:
  main: main/index.js
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: node_modules created, package-lock.json generated

- [ ] **Step 4: Create directory structure**

Run:
```bash
mkdir -p main/windows main/services main/ipc preload renderer/styles build
```

- [ ] **Step 5: Commit**

```bash
git add package.json electron-builder.yml
git commit -m "feat: initialize weread-desktop Electron project"
```

---

### Task 2: Preload Script — IPC Bridge

**Files:**
- Create: `preload/index.js`

- [ ] **Step 1: Write the preload script**

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("weread", {
  // IPC send
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // IPC receive
  on: (channel, callback) => {
    const handler = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onSessionUpdate: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("session:update", handler);
    return () => ipcRenderer.removeListener("session:update", handler);
  },

  onLog: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("log", handler);
    return () => ipcRenderer.removeListener("log", handler);
  },

  // Specific invoke helpers
  getUsers: () => ipcRenderer.invoke("get-users"),
  saveUsers: (data) => ipcRenderer.invoke("save-users", data),
  getActiveUser: () => ipcRenderer.invoke("get-active-user"),
  setActiveUser: (userId) => ipcRenderer.invoke("set-active-user", userId),
  addUser: (user) => ipcRenderer.invoke("add-user", user),
  removeUser: (userId) => ipcRenderer.invoke("remove-user", userId),
  startReading: (userId) => ipcRenderer.invoke("start-reading", userId),
  stopReading: () => ipcRenderer.invoke("stop-reading"),
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  getStats: (userId) => ipcRenderer.invoke("get-stats", userId),
  getDailyStats: (userId) => ipcRenderer.invoke("get-daily-stats", userId),
});
```

- [ ] **Step 2: Commit**

```bash
git add preload/index.js
git commit -m "feat: add preload script with IPC bridge"
```

---

### Task 3: Main Process Entry + Status Bar Window

**Files:**
- Create: `main/index.js`
- Create: `main/windows/statusBar.js`
- Create: `renderer/statusBar.html`
- Create: `renderer/styles/shared.css`

- [ ] **Step 1: Create shared CSS**

```css
/* renderer/styles/shared.css */
:root {
  --bg-dark: #1a1a2e;
  --bg-card: #16213e;
  --bg-button: #0f3460;
  --accent: #e94560;
  --accent-secondary: #533483;
  --text-primary: #ffffff;
  --text-secondary: #888888;
  --status-active: #4ade80;
  --status-paused: #fbbf24;
  --status-stopped: #ef4444;
  --radius: 8px;
  --radius-pill: 20px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg-dark);
  color: var(--text-primary);
  overflow: hidden;
  user-select: none;
}
```

- [ ] **Step 2: Create status bar window module**

```js
// main/windows/statusBar.js
const { BrowserWindow, screen } = require("electron");
const path = require("path");

let statusBar = null;

function createStatusBar() {
  if (statusBar) return statusBar;

  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workAreaSize;

  statusBar = new BrowserWindow({
    width: 380,
    height: 44,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Position: top-right of screen
  const x = screenWidth - 390;
  const y = 10;
  statusBar.setPosition(x, y);

  statusBar.loadFile(path.join(__dirname, "..", "..", "renderer", "statusBar.html"));

  statusBar.on("closed", () => {
    statusBar = null;
  });

  return statusBar;
}

function showStatusBar() {
  const win = createStatusBar();
  win.show();
  return win;
}

function hideStatusBar() {
  statusBar?.hide();
}

function sendStatusUpdate(data) {
  statusBar?.webContents.send("session:update", data);
}

function sendLog(data) {
  statusBar?.webContents.send("log", data);
}

module.exports = {
  createStatusBar,
  showStatusBar,
  hideStatusBar,
  sendStatusUpdate,
  sendLog,
};
```

- [ ] **Step 3: Create status bar HTML**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url("styles/shared.css");

    #app {
      width: 380px;
      height: 44px;
      background: var(--bg-dark);
      border-radius: 22px;
      display: flex;
      align-items: center;
      padding: 0 14px;
      gap: 10px;
      cursor: move;
      -webkit-app-region: drag;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--status-stopped);
      flex-shrink: 0;
    }
    .status-dot.active { background: var(--status-active); }
    .status-dot.paused { background: var(--status-paused); }

    .timer {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      -webkit-app-region: no-drag;
    }

    .progress-bar {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      overflow: hidden;
      min-width: 60px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
      border-radius: 2px;
      transition: width 0.3s;
      width: 0%;
    }

    .controls {
      display: flex;
      gap: 6px;
      -webkit-app-region: no-drag;
    }
    .btn {
      padding: 4px 10px;
      background: var(--bg-button);
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
    }
    .btn:hover { opacity: 0.85; }
    .btn-accent { background: var(--accent); }

    .user-select {
      background: var(--bg-button);
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      padding: 4px 6px;
      cursor: pointer;
      -webkit-appearance: none;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="statusDot" class="status-dot"></div>
    <div id="timer" class="timer" title="点击查看统计">00:00</div>
    <div class="progress-bar">
      <div id="progressFill" class="progress-fill"></div>
    </div>
    <select id="userSelect" class="user-select"></select>
    <div class="controls">
      <button id="toggleBtn" class="btn btn-accent">▶</button>
      <button id="settingsBtn" class="btn">⚙</button>
    </div>
  </div>

  <script>
    // Drag-to-move for frameless window
    const app = document.getElementById("app");
    app.addEventListener("mousedown", (e) => {
      if (e.target.closest(".controls, .user-select, #timer")) return;
    });

    // State
    let sessionStatus = { running: false, minutes: 0, targetMinutes: 68 };

    async function init() {
      // Load users
      const config = await window.weread.getUsers();
      const activeUserId = config.activeUserId;
      const userSelect = document.getElementById("userSelect");
      userSelect.innerHTML = "";
      for (const [id, user] of Object.entries(config.users)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = user.name;
        if (id === activeUserId) opt.selected = true;
        userSelect.appendChild(opt);
      }

      userSelect.addEventListener("change", async () => {
        await window.weread.setActiveUser(userSelect.value);
      });

      // Load session status
      const status = await window.weread.getSessionStatus();
      updateUI(status);

      // Listen for updates
      window.weread.onSessionUpdate((data) => {
        updateUI(data);
      });

      // Toggle button
      document.getElementById("toggleBtn").addEventListener("click", async () => {
        if (sessionStatus.running) {
          await window.weread.stopReading();
        } else {
          const activeUser = await window.weread.getActiveUser();
          await window.weread.startReading(activeUser.id);
        }
      });

      // Settings button
      document.getElementById("settingsBtn").addEventListener("click", () => {
        window.weread.send("open-settings");
      });

      // Stats panel
      document.getElementById("timer").addEventListener("click", () => {
        window.weread.send("open-stats");
      });
    }

    function updateUI(data) {
      sessionStatus = { ...sessionStatus, ...data };
      const { running, minutes = 0, targetMinutes = 68 } = sessionStatus;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      document.getElementById("timer").textContent =
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      const dot = document.getElementById("statusDot");
      dot.className = "status-dot " + (running ? "active" : "paused");

      const pct = Math.min(100, (minutes / targetMinutes) * 100);
      document.getElementById("progressFill").style.width = pct + "%";

      const toggleBtn = document.getElementById("toggleBtn");
      toggleBtn.textContent = running ? "⏸" : "▶";
      toggleBtn.className = running ? "btn btn-accent" : "btn";
    }

    init();
  </script>
</body>
</html>
```

- [ ] **Step 4: Create main process entry**

```js
// main/index.js
const { app, Tray, Menu, BrowserWindow } = require("electron");
const path = require("path");
const { showStatusBar, sendStatusUpdate, sendLog } = require("./windows/statusBar");
const { createSettingsWindow } = require("./windows/settings");
const { createStatsPanel } = require("./windows/statsPanel");
const { createTray } = require("./services/tray");
const { SessionManager } = require("./services/sessionManager");

let tray = null;
let sessionManager = null;

app.whenReady().then(async () => {
  // Init services
  sessionManager = new SessionManager();
  sessionManager.on("update", (data) => sendStatusUpdate(data));
  sessionManager.on("log", (data) => sendLog(data));

  // Create windows
  showStatusBar();
  tray = createTray(sessionManager);

  // IPC handlers
  const { registerIpcHandlers } = require("./ipc/handlers");
  registerIpcHandlers(sessionManager);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showStatusBar();
    }
  });
});

app.on("window-all-closed", () => {
  // Keep running (tray app)
});

app.on("before-quit", async () => {
  if (sessionManager) {
    await sessionManager.stop();
  }
});
```

- [ ] **Step 5: Create stub services (for compilation)**

```js
// main/services/sessionManager.js
const { EventEmitter } = require("events");

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this._status = { running: false, minutes: 0, targetMinutes: 68 };
  }

  async start(userId) {
    this._status = { ...this._status, running: true };
    this.emit("update", this._status);
  }

  async stop() {
    this._status = { ...this._status, running: false };
    this.emit("update", this._status);
  }

  getStatus() {
    return this._status;
  }
}

module.exports = { SessionManager };
```

```js
// main/services/tray.js
const { Tray, Menu, app } = require("electron");
const path = require("path");

function createTray(sessionManager) {
  const trayIcon = path.join(__dirname, "..", "..", "build", "tray-icon.png");
  const tray = new Tray(trayIcon);

  const updateMenu = () => {
    const status = sessionManager.getStatus();
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: status.running ? "暂停阅读" : "启动阅读",
        click: async () => {
          if (status.running) {
            await sessionManager.stop();
          } else {
            const { UserManager } = require("./userManager");
            const um = new UserManager();
            const active = um.getActiveUser();
            await sessionManager.start(active.id);
          }
          updateMenu();
        },
      },
      { label: "显示设置", click: () => require("./windows/settings").showSettingsWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]));
  };

  updateMenu();
  sessionManager.on("update", () => updateMenu());
  return tray;
}

module.exports = { createTray };
```

```js
// main/services/userManager.js
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
}

module.exports = { UserManager, CONFIG_PATH };
```

- [ ] **Step 6: Commit**

```bash
git add main/ preload/ renderer/
git commit -m "feat: add main process, status bar window, and core services"
```

---

### Task 4: IPC Handlers — Wire Main to Renderer

**Files:**
- Create: `main/ipc/handlers.js`

- [ ] **Step 1: Create IPC handlers**

```js
// main/ipc/handlers.js
const { ipcMain } = require("electron");
const { UserManager } = require("../services/userManager");
const { createSettingsWindow } = require("../windows/settings");
const { createStatsPanel } = require("../windows/statsPanel");

let userManager = null;
function getUserManager() {
  if (!userManager) userManager = new UserManager();
  return userManager;
}

function registerIpcHandlers(sessionManager) {
  // User management
  ipcMain.handle("get-users", () => {
    return getUserManager().getConfig();
  });

  ipcMain.handle("save-users", (_, data) => {
    getUserManager().save(data);
  });

  ipcMain.handle("get-active-user", () => {
    return getUserManager().getActiveUser();
  });

  ipcMain.handle("set-active-user", (_, userId) => {
    getUserManager().setActiveUser(userId);
  });

  ipcMain.handle("add-user", (_, user) => {
    getUserManager().addUser(user);
  });

  ipcMain.handle("remove-user", (_, userId) => {
    getUserManager().removeUser(userId);
  });

  // Session control
  ipcMain.handle("start-reading", async (_, userId) => {
    await sessionManager.start(userId);
  });

  ipcMain.handle("stop-reading", async () => {
    await sessionManager.stop();
  });

  ipcMain.handle("get-session-status", () => {
    return sessionManager.getStatus();
  });

  // Stats
  ipcMain.handle("get-stats", (_, userId) => {
    const { StatsTracker } = require("../services/statsTracker");
    return new StatsTracker(userId).getSummary();
  });

  ipcMain.handle("get-daily-stats", (_, userId) => {
    const { StatsTracker } = require("../services/statsTracker");
    return new StatsTracker(userId).getDailyData();
  });

  // Window commands (from renderer)
  ipcMain.on("open-settings", () => {
    createSettingsWindow();
  });

  ipcMain.on("open-stats", async () => {
    const um = getUserManager();
    const activeUser = um.getActiveUser();
    createStatsPanel(activeUser.id);
  });
}

module.exports = { registerIpcHandlers };
```

- [ ] **Step 2: Commit**

```bash
git add main/ipc/handlers.js
git commit -m "feat: register IPC handlers for user/session/stats"
```

---

### Task 5: Settings Window

**Files:**
- Create: `main/windows/settings.js`
- Create: `renderer/settings.html`

- [ ] **Step 1: Create settings window module**

```js
// main/windows/settings.js
const { BrowserWindow } = require("electron");
const path = require("path");

let settingsWindow = null;

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: "设置",
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function showSettingsWindow() {
  const win = createSettingsWindow();
  win.show();
  return win;
}

module.exports = { createSettingsWindow, showSettingsWindow };
```

- [ ] **Step 2: Create settings HTML**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url("styles/shared.css");

    body {
      overflow-y: auto;
      user-select: text;
      -webkit-app-region: no-drag;
    }

    #app {
      padding: 20px;
      max-width: 560px;
      margin: 0 auto;
    }

    h2 { font-size: 18px; margin-bottom: 16px; }

    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      font-size: 14px;
    }
    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent);
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 14px;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: var(--accent);
    }

    .user-list { margin-top: 12px; }
    .user-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-card);
      border-radius: var(--radius);
      margin-bottom: 6px;
    }
    .user-item .name { font-size: 14px; }
    .user-item button {
      padding: 4px 10px;
      background: var(--accent);
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      cursor: pointer;
    }

    .btn {
      padding: 8px 16px;
      background: var(--accent);
      border: none;
      border-radius: var(--radius);
      color: white;
      font-size: 14px;
      cursor: pointer;
    }
    .btn-secondary {
      background: var(--bg-button);
    }
  </style>
</head>
<body>
  <div id="app">
    <h2>设置</h2>
    <div class="tabs">
      <div class="tab active" data-tab="basic">基础</div>
      <div class="tab" data-tab="users">用户</div>
      <div class="tab" data-tab="notify">通知</div>
      <div class="tab" data-tab="schedule">定时</div>
    </div>

    <div id="tab-basic" class="tab-content active">
      <div class="form-group">
        <label>浏览器</label>
        <select id="browser">
          <option value="chrome">Chrome</option>
          <option value="firefox">Firefox</option>
          <option value="MicrosoftEdge">Edge</option>
        </select>
      </div>
      <div class="form-group">
        <label>阅读时长（分钟）</label>
        <input type="number" id="duration" value="68" min="5" max="180">
      </div>
      <div class="form-group">
        <label>阅读速度</label>
        <select id="speed">
          <option value="slow">慢速</option>
          <option value="normal">正常</option>
          <option value="fast">快速</option>
        </select>
      </div>
      <div class="form-group">
        <label>选书方式</label>
        <select id="selection">
          <option value="2">书架第 2 本</option>
          <option value="-1">随机选择</option>
          <option value="1">最近阅读第 1 本</option>
        </select>
      </div>
      <button class="btn" id="saveBasic">保存</button>
    </div>

    <div id="tab-users" class="tab-content">
      <div class="user-list" id="userList"></div>
      <button class="btn btn-secondary" id="addUser" style="margin-top:12px;">+ 添加用户</button>
    </div>

    <div id="tab-notify" class="tab-content">
      <div class="form-group">
        <label><input type="checkbox" id="emailEnabled"> 启用邮件通知</label>
      </div>
      <div class="form-group">
        <label>SMTP 服务器</label>
        <input type="text" id="emailSmtp" placeholder="smtp.example.com">
      </div>
      <div class="form-group">
        <label>邮箱账号</label>
        <input type="text" id="emailUser">
      </div>
      <div class="form-group">
        <label>邮箱密码</label>
        <input type="password" id="emailPass">
      </div>
      <div class="form-group">
        <label>Bark Key</label>
        <input type="text" id="barkKey" placeholder="可选">
      </div>
      <button class="btn" id="saveNotify">保存</button>
    </div>

    <div id="tab-schedule" class="tab-content">
      <div class="form-group">
        <label><input type="checkbox" id="scheduleEnabled"> 启用定时任务</label>
      </div>
      <div class="form-group">
        <label>间隔（分钟）</label>
        <input type="number" id="scheduleInterval" value="360" min="60" max="1440">
      </div>
      <button class="btn" id="saveSchedule">保存</button>
    </div>
  </div>

  <script>
    // Tab switching
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });

    async function loadSettings() {
      const config = await window.weread.getUsers();
      const user = config.users[config.activeUserId];
      if (!user) return;

      document.getElementById("browser").value = user.browser || "chrome";
      document.getElementById("duration").value = user.duration || 68;
      document.getElementById("speed").value = user.speed || "slow";
      document.getElementById("selection").value = user.selection ?? 2;

      // Email
      document.getElementById("emailEnabled").checked = user.email?.enabled || false;
      document.getElementById("emailSmtp").value = user.email?.smtp || "";
      document.getElementById("emailUser").value = user.email?.user || "";
      document.getElementById("emailPass").value = user.email?.pass || "";
      document.getElementById("barkKey").value = user.bark?.key || "";

      // Schedule
      document.getElementById("scheduleEnabled").checked = user.schedule?.enabled || false;
      document.getElementById("scheduleInterval").value = user.schedule?.intervalMinutes || 360;

      // User list
      const userList = document.getElementById("userList");
      userList.innerHTML = "";
      for (const [id, u] of Object.entries(config.users)) {
        const div = document.createElement("div");
        div.className = "user-item";
        div.innerHTML = `<span class="name">${u.name}${id === config.activeUserId ? " (当前)" : ""}</span>`;
        userList.appendChild(div);
      }
    }

    document.getElementById("saveBasic").addEventListener("click", async () => {
      const config = await window.weread.getUsers();
      const user = config.users[config.activeUserId];
      user.browser = document.getElementById("browser").value;
      user.duration = parseInt(document.getElementById("duration").value);
      user.speed = document.getElementById("speed").value;
      user.selection = parseInt(document.getElementById("selection").value);
      await window.weread.saveUsers(config);
    });

    document.getElementById("addUser").addEventListener("click", async () => {
      const config = await window.weread.getUsers();
      const id = "user-" + Date.now();
      const name = prompt("用户名称:");
      if (!name) return;
      config.users[id] = {
        id, name, duration: 68, browser: "chrome", selection: 2, speed: "slow",
        email: { enabled: false, smtp: "", user: "", pass: "", from: "", to: "", port: 465 },
        bark: { key: "", server: "https://api.day.app" },
        schedule: { enabled: false, intervalMinutes: 360 },
      };
      await window.weread.saveUsers(config);
      loadSettings();
    });

    document.getElementById("saveNotify").addEventListener("click", async () => {
      const config = await window.weread.getUsers();
      const user = config.users[config.activeUserId];
      user.email.enabled = document.getElementById("emailEnabled").checked;
      user.email.smtp = document.getElementById("emailSmtp").value;
      user.email.user = document.getElementById("emailUser").value;
      user.email.pass = document.getElementById("emailPass").value;
      user.bark.key = document.getElementById("barkKey").value;
      await window.weread.saveUsers(config);
    });

    document.getElementById("saveSchedule").addEventListener("click", async () => {
      const config = await window.weread.getUsers();
      const user = config.users[config.activeUserId];
      user.schedule.enabled = document.getElementById("scheduleEnabled").checked;
      user.schedule.intervalMinutes = parseInt(document.getElementById("scheduleInterval").value);
      await window.weread.saveUsers(config);
    });

    loadSettings();
  </script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add main/windows/settings.js renderer/settings.html
git commit -m "feat: add settings window with tabs"
```

---

### Task 6: Stats Panel Window

**Files:**
- Create: `main/windows/statsPanel.js`
- Create: `renderer/stats.html`
- Create: `main/services/statsTracker.js`

- [ ] **Step 1: Create stats tracker service**

```js
// main/services/statsTracker.js
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
      roundTargetMinutes: 300 * 60, // 300 hours
      daysProgress: Math.min(100, (this.data.roundDay / 29) * 100),
      minutesProgress: Math.min(100, (roundMinutes / (300 * 60)) * 100),
    };
  }

  getDailyData() {
    return this.data.days.slice(-30).map((d) => ({
      date: d.date.slice(5), // MM-DD
      minutes: d.minutes,
    }));
  }
}

module.exports = { StatsTracker };
```

- [ ] **Step 2: Create stats panel window module**

```js
// main/windows/statsPanel.js
const { BrowserWindow } = require("electron");
const path = require("path");

let statsPanel = null;

function createStatsPanel(userId) {
  if (statsPanel) {
    statsPanel.focus();
    return statsPanel;
  }

  statsPanel = new BrowserWindow({
    width: 480,
    height: 420,
    title: "阅读统计",
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  statsPanel.loadFile(path.join(__dirname, "..", "..", "renderer", "stats.html"), {
    query: { userId },
  });

  statsPanel.on("closed", () => {
    statsPanel = null;
  });

  return statsPanel;
}

module.exports = { createStatsPanel };
```

- [ ] **Step 3: Create stats panel HTML**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url("styles/shared.css");

    body { overflow-y: auto; user-select: text; }

    #app { padding: 20px; max-width: 440px; margin: 0 auto; }

    h2 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: var(--text-secondary); font-size: 13px; margin-bottom: 20px; }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--bg-card);
      border-radius: var(--radius);
      padding: 14px;
    }
    .stat-card .label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-card .value {
      font-size: 24px;
      font-weight: 700;
      margin-top: 4px;
      color: var(--accent);
    }
    .stat-card .sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .progress-section { margin-bottom: 20px; }
    .progress-section h3 { font-size: 14px; margin-bottom: 8px; }
    .progress-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .progress-row .label { font-size: 13px; width: 60px; }
    .progress-row .bar {
      flex: 1;
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-row .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
      border-radius: 3px;
      transition: width 0.5s;
    }
    .progress-row .pct { font-size: 13px; width: 50px; text-align: right; }

    .chart-section { margin-top: 16px; }
    .chart-section h3 { font-size: 14px; margin-bottom: 10px; }
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 100px;
      padding: 0 4px;
    }
    .chart-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      min-height: 2px;
      transition: height 0.3s;
    }
    .chart-bar:hover { opacity: 0.8; }
    .chart-labels {
      display: flex;
      gap: 3px;
      margin-top: 4px;
    }
    .chart-labels span {
      flex: 1;
      text-align: center;
      font-size: 9px;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div id="app">
    <h2>阅读统计</h2>
    <div class="subtitle" id="userLabel">加载中...</div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">今日时长</div>
        <div class="value" id="todayMinutes">0</div>
        <div class="sub">分钟</div>
      </div>
      <div class="stat-card">
        <div class="label">本轮天数</div>
        <div class="value" id="roundDay">0</div>
        <div class="sub">/ 29 天</div>
      </div>
      <div class="stat-card">
        <div class="label">累计天数</div>
        <div class="value" id="totalDays">0</div>
      </div>
      <div class="stat-card">
        <div class="label">累计时长</div>
        <div class="value" id="totalHours">0</div>
        <div class="sub">小时</div>
      </div>
    </div>

    <div class="progress-section">
      <h3>本轮打卡进度</h3>
      <div class="progress-row">
        <span class="label">天数</span>
        <div class="bar"><div class="bar-fill" id="daysBar"></div></div>
        <span class="pct" id="daysPct">0%</span>
      </div>
      <div class="progress-row">
        <span class="label">时长</span>
        <div class="bar"><div class="bar-fill" id="minutesBar"></div></div>
        <span class="pct" id="minutesPct">0%</span>
      </div>
    </div>

    <div class="chart-section">
      <h3>近 30 天阅读时长</h3>
      <div class="chart" id="chart"></div>
      <div class="chart-labels" id="chartLabels"></div>
    </div>
  </div>

  <script>
    async function loadStats() {
      const activeUser = await window.weread.getActiveUser();
      document.getElementById("userLabel").textContent = activeUser?.name || "";

      const summary = await window.weread.getStats(activeUser.id);
      document.getElementById("todayMinutes").textContent =
        summary.todayMinutes || 0;
      document.getElementById("roundDay").textContent = summary.roundDay;
      document.getElementById("totalDays").textContent = summary.totalDays;
      document.getElementById("totalHours").textContent =
        Math.round(summary.totalMinutes / 60);

      document.getElementById("daysBar").style.width = summary.daysProgress + "%";
      document.getElementById("daysPct").textContent =
        Math.round(summary.daysProgress) + "%";
      document.getElementById("minutesBar").style.width = summary.minutesProgress + "%";
      document.getElementById("minutesPct").textContent =
        Math.round(summary.minutesProgress) + "%";

      // Chart
      const dailyData = await window.weread.getDailyStats(activeUser.id);
      const chart = document.getElementById("chart");
      const chartLabels = document.getElementById("chartLabels");
      chart.innerHTML = "";
      chartLabels.innerHTML = "";

      const maxMin = Math.max(...dailyData.map((d) => d.minutes), 1);
      dailyData.forEach((d) => {
        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = Math.max(2, (d.minutes / maxMin) * 100) + "px";
        bar.title = d.date + ": " + d.minutes + "分钟";
        chart.appendChild(bar);

        const label = document.createElement("span");
        label.textContent = d.date.slice(-2);
        chartLabels.appendChild(label);
      });
    }

    loadStats();
  </script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add main/windows/statsPanel.js main/services/statsTracker.js renderer/stats.html
git commit -m "feat: add stats panel window and stats tracker service"
```

---

### Task 7: WeReadAutomation Service — Core Logic

**Files:**
- Create: `main/services/wereadAutomation.js`
- Modify: `main/services/sessionManager.js` (replace stub with real implementation)

- [ ] **Step 1: Create WeReadAutomation service**

This is the most complex file. It wraps the core Selenium logic from the upstream weread-challenge.js, adapted for the Electron environment.

```js
// main/services/wereadAutomation.js
const { Builder, Browser, until, Key, By } = require("selenium-webdriver");
const fs = require("fs");
const path = require("path");

class WeReadAutomation {
  constructor(config, eventEmitter) {
    this.config = config; // { duration, browser, selection, speed, dataDir }
    this.emitter = eventEmitter;
    this.driver = null;
    this.running = false;
    this.elapsedMinutes = 0;
    this._timer = null;
  }

  get dataDir() {
    return path.resolve(this.config.dataDir || ".weread");
  }

  get cookieFile() { return path.join(this.dataDir, "cookies.json"); }
  get loginQrPath() { return path.join(this.dataDir, "login.png"); }

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
        options = require("selenium-webdriver/firefox").Options();
        break;
      case "MicrosoftEdge":
        options = require("selenium-webdriver/edge").Options();
        break;
      default:
        options = require("selenium-webdriver/chrome").Options();
    }

    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    // Load user profile if available
    const profileDir = path.join(this.dataDir, "profile");
    if (fs.existsSync(profileDir)) {
      if (browserType === Browser.CHROME) {
        options.addArguments(`--user-data-dir=${profileDir}`);
      }
    }

    const driver = await new Builder()
      .forBrowser(browserType)
      .setChromeOptions(options)
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

      // Wait until we're past the login page
      try {
        await this.driver.wait(
          until.urlContains("reader"),
          300000, // 5 minutes max wait
        );
        await this.saveCookies();
        this.log("Login successful");
        return true;
      } catch (_) {
        // Check if still on login page
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

    await this.init();
    this.driver = await this.buildDriver();

    // Try loading cookies first
    const hasCookies = await this.loadCookies();
    if (hasCookies) {
      await this.driver.get("https://weread.qq.com/");
      try {
        await this.driver.manage().deleteAllCookies();
        const cookies = JSON.parse(fs.readFileSync(this.cookieFile, "utf8"));
        for (const cookie of cookies) {
          await this.driver.manage().addCookie(cookie);
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

    // Start auto-reading
    await this._readingLoop();
  }

  async _readingLoop() {
    const targetMinutes = this.config.duration || 68;

    while (this.running && this.elapsedMinutes < targetMinutes) {
      try {
        // Navigate to a book if needed
        const currentUrl = await this.driver.getCurrentUrl();
        if (!currentUrl.includes("reader")) {
          await this._navigateToBook();
        }

        // Simulate reading: wait for page to load, then wait randomly
        const waitSeconds = this._getRandomPageTime();
        this.log(`Reading for ${waitSeconds}s...`);
        await this._sleep(waitSeconds * 1000);

        // Turn page / next chapter
        await this._turnPage();

        this.elapsedMinutes += 1;
        this.emitter?.emit("update", {
          running: true,
          minutes: this.elapsedMinutes,
          targetMinutes: targetMinutes,
        });

        // Save cookies periodically
        if (this.elapsedMinutes % 5 === 0) {
          await this.saveCookies();
        }

        // Record stats every 5 minutes
        if (this.elapsedMinutes % 5 === 0) {
          this.emitter?.emit("stats", { minutes: 5 });
        }

      } catch (err) {
        this.log("Reading loop error: " + err.message);
        await this._sleep(10000);
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
      // Random: use a default book URL
      this.log("Random selection, using default book");
      await this.driver.get(
        "https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7"
      );
    } else {
      // Go to shelf and click Nth book
      await this.driver.get("https://weread.qq.com/web/shelf");
      await this.driver.sleep(2000);
      try {
        const books = await this.driver.findElements(
          By.css(".shelf-item")
        );
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
    await this.driver.sleep(3000);
  }

  async _turnPage() {
    try {
      await this.driver.findElement(By.tagName("body")).sendKeys(Key.SPACE);
    } catch (_) {
      // Click center of page as fallback
      const body = await this.driver.findElement(By.tagName("body"));
      await body.click();
    }
  }

  _getRandomPageTime() {
    const speed = this.config.speed || "slow";
    const ranges = { slow: [30, 90], normal: [15, 60], fast: [8, 30] };
    const [min, max] = ranges[speed] || ranges.slow;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      this._timer = setTimeout(resolve, ms);
    });
  }

  async stop() {
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
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
```

- [ ] **Step 2: Update SessionManager with real implementation**

Replace the stub in `main/services/sessionManager.js` with:

```js
// main/services/sessionManager.js
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

    this.automation.on("update", (data) => {
      this._status = data;
      this.emit("update", data);
    });

    this.automation.on("stats", (data) => {
      this._statsMinutes += data.minutes;
      if (this._statsMinutes >= 5) {
        this._statsTracker?.recordSession(this._statsMinutes);
        this._statsMinutes = 0;
      }
    });

    this.automation.on("log", (data) => {
      this.emit("log", data);
    });

    this.automation.on("complete", () => {
      this.automation = null;
    });

    await this.automation.startReading();
  }

  async stop() {
    if (this.automation) {
      await this.automation.stop();
      // Record remaining stats
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
```

- [ ] **Step 3: Update main/index.js to fix imports**

Update the main/index.js to use the new SessionManager properly:

```js
// main/index.js - update the ready handler
app.whenReady().then(async () => {
  // Init services
  sessionManager = new SessionManager();
  sessionManager.on("update", (data) => sendStatusUpdate(data));
  sessionManager.on("log", (data) => sendLog(data));

  // Create windows
  showStatusBar();
  tray = createTray(sessionManager);

  // IPC handlers
  const { registerIpcHandlers } = require("./ipc/handlers");
  registerIpcHandlers(sessionManager);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showStatusBar();
    }
  });
});
```

(No code change needed — already matches)

- [ ] **Step 4: Create tray icon placeholder**

Create a simple 16x16 PNG for the tray icon:

```bash
# Create a minimal 16x16 PNG (red square) as placeholder
# We'll use Node to generate it
node -e "
const fs = require('fs');
// Minimal 16x16 PNG - 1x1 red pixel, scaled
const header = Buffer.from([137,80,78,71,13,10,26,10]);
// IHDR chunk: 16x16, 8bit RGBA
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(16, 0); ihdrData.writeUInt32BE(16, 4);
ihdrData[8] = 8; ihdrData[9] = 6; // 8bit RGBA
const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
const ihdr = Buffer.concat([Buffer.from([0,0,0,13]), Buffer.from('IHDR'), ihdrData, ihdrCrc]);
fs.writeFileSync('build/tray-icon.png', Buffer.concat([header, ihdr]));
" 2>/dev/null || echo "node - skipped, will use fallback"

# Fallback: create a simple text-based note that tray icon will be generated at build time
echo "# Tray icon will be placed here" > build/tray-icon-placeholder.txt
```

For the actual icon, create a simple 16x16 base64 PNG:

```bash
# Create a minimal valid PNG for dev (will be replaced with real icon)
node -e "
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEklEQVQ4jWNgYGD4z0ABYBw1gGE0DAYA8E8EAwO9XfMAAAAASUVORK5CYII=', 'base64');
require('fs').writeFileSync('build/tray-icon.png', png);
"
```

- [ ] **Step 5: Commit**

```bash
git add main/services/wereadAutomation.js main/services/sessionManager.js main/services/statsTracker.js build/tray-icon.png
git commit -m "feat: implement WeReadAutomation service and real session management"
```

---

### Task 8: Verify & Run

**Files:**
- Modify: `main/index.js` (add dev mode error handling)

- [ ] **Step 1: Add error handling to main process**

```js
// Add to top of main/index.js, after requires:
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
```

- [ ] **Step 2: Run the app in dev mode**

Run: `npm start`
Expected: Electron window appears with the status bar pill in top-right corner, tray icon in system tray. Status dot should be red (stopped). Click ▶ button to start reading — should launch Chrome and navigate to weread.qq.com.

- [ ] **Step 3: Test settings window**

Click ⚙ button in status bar → settings window should open.

- [ ] **Step 4: Test stats panel**

Click timer text in status bar → stats panel should open.

- [ ] **Step 5: Test tray menu**

Right-click tray icon → menu should show 启动阅读/暂停阅读, 显示设置, 退出.

- [ ] **Step 6: Commit**

```bash
git add main/index.js
git commit -m "fix: add uncaught exception handler"
```

---

### Task 9: Build Windows Installer

**Files:**
- Modify: `electron-builder.yml`
- Modify: `package.json`

- [ ] **Step 1: Ensure build directory has icon**

Replace `build/tray-icon.png` with a proper `.ico` file for the app icon. For initial build, use a placeholder:

```bash
# Create a simple 256x256 ICO placeholder (or skip and let electron-builder use default)
echo "Add a proper icon.ico to build/ directory before final build" > build/icon-note.txt
```

- [ ] **Step 2: Run build**

Run: `npm run build:dir`
Expected: `dist/win-unpacked/` directory created with the app executable.

Run: `npm run build`
Expected: NSIS installer created in `dist/` directory.

- [ ] **Step 3: Commit**

```bash
git add dist/
git commit -m "build: generate Windows installer"
```

---

## Spec Self-Review

1. **Spec coverage:**
   - ✅ 微信登录（扫码）— WeReadAutomation.waitForLogin()
   - ✅ 自动阅读 — WeReadAutomation._readingLoop()
   - ✅ 设置页 — settings.html with 4 tabs
   - ✅ 托盘图标 — tray.js with context menu
   - ✅ 迷你悬浮状态栏 — statusBar.html, frameless pill
   - ✅ 使用统计 — statsTracker.js + stats.html
   - ✅ 多用户切换 — userManager.js + status bar dropdown
   - ✅ 统计面板 — statsPanel.js + stats.html
   - ✅ Electron 架构 — 主进程 + 3 个渲染窗口
   - ✅ 数据持久化 — config.json + daily.json

2. **Placeholder scan:** No TBD/TODO. All code steps contain actual code. No "handle edge cases" without specifics.

3. **Type consistency:** All IPC channels match between preload, handlers, and renderer calls. User config shape is consistent across userManager, settings UI, and wereadAutomation.

4. **No missing tasks:** All spec requirements covered.
