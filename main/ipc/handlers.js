const { ipcMain, app } = require("electron");
const { UserManager } = require("../services/userManager");

let userManager = null;
function getUserManager() {
  if (!userManager) userManager = new UserManager();
  return userManager;
}

function registerIpcHandlers(sessionManager) {
  // Config (single user, hardcoded settings)
  ipcMain.handle("get-config", () => {
    return getUserManager().getConfig();
  });

  ipcMain.handle("save-config", (_, data) => {
    getUserManager().save(data);
  });

  // Session control — always starts with QR scan
  ipcMain.handle("start-reading", async () => {
    sessionManager.start().catch((err) => {
      console.error("start-reading error:", err);
    });
    return { ok: true };
  });

  ipcMain.handle("stop-reading", async () => {
    await sessionManager.stop();
  });

  ipcMain.handle("get-session-status", () => {
    return sessionManager.getStatus();
  });

  // Stats
  ipcMain.handle("get-stats", () => {
    const { StatsTracker } = require("../services/statsTracker");
    return new StatsTracker("user-1").getSummary();
  });

  ipcMain.handle("get-daily-stats", () => {
    const { StatsTracker } = require("../services/statsTracker");
    return new StatsTracker("user-1").getDailyData();
  });

  // Quit app
  ipcMain.on("quit-app", () => {
    app.quit();
  });
}

module.exports = { registerIpcHandlers };
