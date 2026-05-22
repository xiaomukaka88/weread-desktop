const { BrowserWindow } = require("electron");
const path = require("path");

let statsPanel = null;

function createStatsPanel(userId) {
  if (statsPanel) {
    statsPanel.focus();
    return statsPanel;
  }

  statsPanel = new BrowserWindow({
    width: 480,
    height: 420,
    title: "阅读统计",
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  statsPanel.loadFile(path.join(__dirname, "..", "..", "renderer", "stats.html"), {
    query: { userId },
  });

  statsPanel.on("closed", () => {
    statsPanel = null;
  });

  return statsPanel;
}

module.exports = { createStatsPanel };
