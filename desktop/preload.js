/* =========================================================================
   Preload bridge.
   The page itself stays a plain sandboxed renderer with no access to Node.
   Everything it can do to the filesystem is exactly what is listed here.
   ========================================================================= */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chamberDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },

  /* the whole document, read and written as one JSON file */
  load:        ()      => ipcRenderer.invoke("store:load"),
  save:        (doc)   => ipcRenderer.invoke("store:save", doc),

  /* binary blobs live beside it as individual files */
  putAsset:    (id, buffer) => ipcRenderer.invoke("store:putAsset", id, buffer),
  getAsset:    (id)    => ipcRenderer.invoke("store:getAsset", id),
  deleteAsset: (id)    => ipcRenderer.invoke("store:deleteAsset", id),

  paths:          ()   => ipcRenderer.invoke("app:paths"),
  openDataFolder: ()   => ipcRenderer.invoke("app:openDataFolder"),
  exportJson:  (text, suggested) => ipcRenderer.invoke("app:exportJson", text, suggested),
  importJson:  ()      => ipcRenderer.invoke("app:importJson"),
  pickFiles:   (opts)  => ipcRenderer.invoke("app:pickFiles", opts),

  /* menu items call back into the page */
  onMenu: (fn) => {
    ipcRenderer.on("menu:export", () => fn("export"));
    ipcRenderer.on("menu:import", () => fn("import"));
  }
});
