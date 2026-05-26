const { BrowserWindow, BrowserView } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let browserView = null;

function createMainWindow() {
  const { screen } = require("electron");
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.max(1200, width * 0.8),
    height: Math.max(700, height * 0.8),
    minWidth: 1000,
    minHeight: 600,
    title: "微信读书助手",
    icon: path.join(__dirname, "../../build/tray-icon.png"),
    show: false,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../../preload/index.js"),
    },
  });

  // Create BrowserView for WeRead display
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../../preload/index.js"),
    },
  });

  mainWindow.setBrowserView(browserView);
  updateViewBounds();
  browserView.webContents.loadURL("https://weread.qq.com/");

  // Load left panel
  mainWindow.loadFile(path.join(__dirname, "../../renderer/main.html"));

  mainWindow.on("ready-to-show", () => {
    updateViewBounds();
    mainWindow.show();
  });

  mainWindow.on("resized", () => {
    updateViewBounds();
  });

  mainWindow.on("move", () => {
    updateViewBounds();
  });

  return mainWindow;
}

function updateViewBounds() {
  if (!browserView || !mainWindow) return;
  const bounds = mainWindow.getBounds();
  browserView.setBounds({ x: 320, y: 0, width: bounds.width - 320, height: bounds.height });
}

function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    browserView = null;
  }
  return mainWindow;
}

function getBrowserView() {
  const win = getMainWindow();
  if (!win || !browserView) return null;
  return browserView;
}

function sendStatusUpdate(data) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("session:update", data);
  }
}

function sendLog(data) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("log", data);
  }
}

function showMainWindow() {
  const win = getMainWindow();
  if (win) {
    win.show();
    win.focus();
  }
}

function getRemoteDebugPort() {
  return 9229;
}

function getChromeUserDataDir() {
  const dir = path.join(__dirname, "../../.weread/chrome-profile");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

module.exports = {
  createMainWindow,
  getMainWindow,
  getBrowserView,
  sendStatusUpdate,
  sendLog,
  showMainWindow,
  getRemoteDebugPort,
  getChromeUserDataDir,
};
