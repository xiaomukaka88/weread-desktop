const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_SEND_CHANNELS = new Set(["quit-app"]);
const ALLOWED_INVOKE_CHANNELS = new Set([
  "get-config", "save-config",
  "start-reading", "stop-reading",
  "get-session-status", "get-stats", "get-daily-stats",
]);
const ALLOWED_LISTEN_CHANNELS = new Set(["session:update", "log"]);

function filterSend(channel, data) {
  if (ALLOWED_SEND_CHANNELS.has(channel)) {
    ipcRenderer.send(channel, data);
  }
}

function filterInvoke(channel, data) {
  if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return ipcRenderer.invoke(channel, data);
  }
}

function filterOn(channel, callback) {
  if (ALLOWED_LISTEN_CHANNELS.has(channel)) {
    const handler = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
}

contextBridge.exposeInMainWorld("weread", {
  send: filterSend,
  invoke: filterInvoke,
  on: filterOn,

  onSessionUpdate: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("session:update", handler);
    return () => ipcRenderer.removeListener("session:update", handler);
  },

  onLog: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("log", handler);
    return () => ipcRenderer.removeListener("log", handler);
  },

  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (data) => ipcRenderer.invoke("save-config", data),
  startReading: () => ipcRenderer.invoke("start-reading"),
  stopReading: () => ipcRenderer.invoke("stop-reading"),
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  getStats: () => ipcRenderer.invoke("get-stats"),
  getDailyStats: () => ipcRenderer.invoke("get-daily-stats"),
});
