const { Tray, Menu, app, nativeImage } = require("electron");
const path = require("path");

function createTray(sessionManager) {
  const trayIconPath = path.join(app.getAppPath(), "build", "tray-icon.png");
  let tray;

  try {
    const icon = nativeImage.createFromPath(trayIconPath);
    tray = icon.isEmpty() ? new Tray(nativeImage.createEmpty()) : new Tray(icon);
  } catch (_) {
    // Fallback to empty tray if icon cannot be loaded
    tray = new Tray(nativeImage.createEmpty());
  }

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
      { label: "显示设置", click: () => require("../windows/settings").showSettingsWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]));
  };

  updateMenu();
  sessionManager.on("update", () => updateMenu());
  return tray;
}

module.exports = { createTray };
