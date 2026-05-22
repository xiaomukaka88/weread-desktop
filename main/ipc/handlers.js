const { ipcMain } = require("electron");

function registerIpcHandlers(sessionManager) {
  ipcMain.handle("get-users", async () => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    return um.getConfig();
  });

  ipcMain.handle("save-users", async (_event, data) => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    um.save(data);
    return { success: true };
  });

  ipcMain.handle("get-active-user", async () => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    return um.getActiveUser();
  });

  ipcMain.handle("set-active-user", async (_event, userId) => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    um.setActiveUser(userId);
    return { success: true };
  });

  ipcMain.handle("add-user", async (_event, user) => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    um.addUser(user);
    return { success: true };
  });

  ipcMain.handle("remove-user", async (_event, userId) => {
    const { UserManager } = require("../services/userManager");
    const um = new UserManager();
    um.removeUser(userId);
    return { success: true };
  });

  ipcMain.handle("get-session-status", async () => {
    return sessionManager.getStatus();
  });

  ipcMain.handle("start-reading", async (_event, userId) => {
    await sessionManager.start(userId);
    return { success: true };
  });

  ipcMain.handle("stop-reading", async () => {
    await sessionManager.stop();
    return { success: true };
  });

  ipcMain.handle("get-stats", async (_event, userId) => {
    return { userId, totalMinutes: 0, sessions: [] };
  });

  ipcMain.handle("get-daily-stats", async (_event, userId) => {
    return { userId, daily: [] };
  });

  ipcMain.on("open-settings", () => {
    require("../windows/settings").showSettingsWindow();
  });

  ipcMain.on("open-stats", () => {
    require("../windows/statsPanel").createStatsPanel();
  });
}

module.exports = { registerIpcHandlers };
