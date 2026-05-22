const { BrowserWindow } = require("electron");
const path = require("path");

let settingsWindow = null;

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: "设置",
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function showSettingsWindow() {
  const win = createSettingsWindow();
  win.show();
  return win;
}

module.exports = { createSettingsWindow, showSettingsWindow };
