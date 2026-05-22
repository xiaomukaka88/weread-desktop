const { app, BrowserWindow } = require("electron");
const { showStatusBar, sendStatusUpdate, sendLog } = require("./windows/statusBar");
const { createTray } = require("./services/tray");
const { SessionManager } = require("./services/sessionManager");

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

let tray = null;
let sessionManager = null;

app.whenReady().then(async () => {
  sessionManager = new SessionManager();
  sessionManager.on("update", (data) => sendStatusUpdate(data));
  sessionManager.on("log", (data) => sendLog(data));

  const { registerIpcHandlers } = require("./ipc/handlers");
  registerIpcHandlers(sessionManager);

  showStatusBar();

  try {
    tray = createTray(sessionManager);
  } catch (err) {
    console.error("Tray creation failed:", err.message);
  }

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
