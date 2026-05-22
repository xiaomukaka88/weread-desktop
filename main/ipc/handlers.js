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

  ipcMain.handle("login-user", async (_, userId) => {
    return await sessionManager.loginUser(userId);
  });

  ipcMain.handle("remove-user", (_, userId) => {
    getUserManager().removeUser(userId);
  });

  ipcMain.handle("check-user-login", (_, userId) => {
    return getUserManager().isLoggedIn(userId);
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
