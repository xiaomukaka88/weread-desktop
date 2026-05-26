const { Tray, Menu, app, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

function ensureIconExists() {
  const iconPath = path.join(app.getAppPath(), "build", "tray-icon.png");
  if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 100) return iconPath;

  // Generate a minimal icon programmatically
  try {
    const pngjs = require("pngjs");
    const size = 32;
    const png = new pngjs.PNG({ width: size, height: size });
    const bgR = 0x1a, bgG = 0x1a, bgB = 0x2e;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) << 2;
        const cx = x - size / 2, cy = y - size / 2;
        const dist = Math.max(Math.abs(cx), Math.abs(cy));
        const radius = size / 2 - 2;
        if (dist < radius) {
          png.data[idx] = bgR;
          png.data[idx + 1] = bgG;
          png.data[idx + 2] = bgB;
          png.data[idx + 3] = 255;
        } else {
          png.data[idx] = 0;
          png.data[idx + 1] = 0;
          png.data[idx + 2] = 0;
          png.data[idx + 3] = 0;
        }
      }
    }

    const buf = pngjs.PNG.sync.write(png);
    fs.writeFileSync(iconPath, buf);
  } catch (_) {}

  return iconPath;
}

function createTray(sessionManager) {
  const iconPath = ensureIconExists();
  let tray;

  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = icon.isEmpty() ? new Tray(nativeImage.createEmpty()) : new Tray(icon);
  } catch (_) {
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
            await sessionManager.start();
          }
          updateMenu();
        },
      },
      { label: "打开主窗口", click: () => require("../windows/mainWindow").showMainWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]));
  };

  updateMenu();
  sessionManager.on("update", () => updateMenu());
  return tray;
}

module.exports = { createTray };
