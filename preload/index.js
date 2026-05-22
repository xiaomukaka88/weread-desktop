const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("weread", {
  // IPC send
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // IPC receive
  on: (channel, callback) => {
    const handler = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

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

  // Specific invoke helpers
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
