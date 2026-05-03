const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("evimDesktop", {
  quit() {
    ipcRenderer.send("evim-quit");
  },
  onControlKey(handler) {
    const listener = (_event, key) => handler(key);
    ipcRenderer.on("evim-control-key", listener);
    return () => ipcRenderer.removeListener("evim-control-key", listener);
  }
});
