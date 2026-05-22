const { app, BrowserWindow } = require("electron");
const { showStatusBar, sendStatusUpdate, sendLog } = require("./windows/statusBar");
const { createTray } = require("./services/tray");
const { SessionManager } = require("./services/sessionManager");

let tray = null;
let sessionManager = null;

app.whenReady().then(async () => {
  sessionManager = new SessionManager();
  sessionManager.on("update", (data) => sendStatusUpdate(data));
  sessionManager.on("log", (data) => sendLog(data));

  showStatusBar();
  tray = createTray(sessionManager);

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
