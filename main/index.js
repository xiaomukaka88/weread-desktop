const { app, Menu } = require("electron");
const { createMainWindow, sendStatusUpdate, sendLog, showMainWindow } = require("./windows/mainWindow");
const { createTray } = require("./services/tray");
const { SessionManager } = require("./services/sessionManager");

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

let tray = null;
let sessionManager = null;

app.whenReady().then(async () => {
  // Remove default Electron menu bar
  Menu.setApplicationMenu(null);

  // Create main window with embedded BrowserView
  createMainWindow();

  sessionManager = new SessionManager();
  sessionManager.on("update", (data) => sendStatusUpdate(data));
  sessionManager.on("log", (data) => sendLog(data));

  const { registerIpcHandlers } = require("./ipc/handlers");
  registerIpcHandlers(sessionManager);

  try {
    tray = createTray(sessionManager);
  } catch (err) {
    console.error("Tray creation failed:", err.message);
  }

  app.on("activate", () => {
    showMainWindow();
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
