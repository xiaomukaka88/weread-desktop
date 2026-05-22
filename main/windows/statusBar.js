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
