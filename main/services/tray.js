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
