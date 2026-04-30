const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bvimDesktop", {
  quit() {
    ipcRenderer.send("bvim-quit");
  },
  onControlKey(handler) {
    const listener = (_event, key) => handler(key);
    ipcRenderer.on("bvim-control-key", listener);
    return () => ipcRenderer.removeListener("bvim-control-key", listener);
  }
});
