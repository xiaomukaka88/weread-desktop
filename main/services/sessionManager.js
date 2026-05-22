const { EventEmitter } = require("events");

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this._status = { running: false, minutes: 0, targetMinutes: 68 };
  }

  async start(userId) {
    this._status = { ...this._status, running: true };
    this.emit("update", this._status);
  }

  async stop() {
    this._status = { ...this._status, running: false };
    this.emit("update", this._status);
  }

  getStatus() {
    return this._status;
  }
}

module.exports = { SessionManager };
