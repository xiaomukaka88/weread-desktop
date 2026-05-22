const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_SEND_CHANNELS = new Set(["open-settings", "open-stats"]);
const ALLOWED_INVOKE_CHANNELS = new Set([
  "get-users", "save-users", "get-active-user", "set-active-user",
  "add-user", "remove-user", "start-reading", "stop-reading",
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

  getUsers: () => ipcRenderer.invoke("get-users"),
  saveUsers: (data) => ipcRenderer.invoke("save-users", data),
  getActiveUser: () => ipcRenderer.invoke("get-active-user"),
  setActiveUser: (userId) => ipcRenderer.invoke("set-active-user", userId),
  addUser: (user) => ipcRenderer.invoke("add-user", user),
  removeUser: (userId) => ipcRenderer.invoke("remove-user", userId),
  startReading: (userId) => ipcRenderer.invoke("start-reading", userId),
  stopReading: () => ipcRenderer.invoke("stop-reading"),
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  getStats: (userId) => ipcRenderer.invoke("get-stats", userId),
  getDailyStats: (userId) => ipcRenderer.invoke("get-daily-stats", userId),
});
