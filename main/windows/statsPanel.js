const { BrowserWindow } = require("electron");
const path = require("path");

let statsPanel = null;

function createStatsPanel() {
  if (statsPanel) {
    statsPanel.focus();
    return statsPanel;
  }

  statsPanel = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  statsPanel.loadFile(path.join(__dirname, "..", "..", "renderer", "statsPanel.html"));

  statsPanel.on("closed", () => {
    statsPanel = null;
  });

  return statsPanel;
}

module.exports = { createStatsPanel };
