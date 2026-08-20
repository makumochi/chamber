/* =========================================================================
   THE CHAMBER - Electron main process
   =========================================================================

   Why this exists: in a browser, everything you write lives in IndexedDB,
   which the browser is allowed to throw away (storage pressure, "clear site
   data", a different profile, a different origin). As a desktop app the same
   page keeps its data in ordinary files under the user's app-data folder,
   where nothing but the user can remove it.

   ON DISK
     %APPDATA%\the-chamber\
       chamber.json          the whole document (notes, chats, layout, config)
       backups\backup-N.json rolling snapshots, oldest rotated out
       assets\<id>.bin       binary blobs: audio tracks, sprites, wallpaper

   Every write to chamber.json is atomic: it goes to a .tmp file, gets flushed,
   and is then renamed over the real one. A crash mid-write therefore leaves
   the previous good file intact rather than a half-written one.
   ========================================================================= */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const DATA_DIR    = app.getPath("userData");
const DOC_PATH    = path.join(DATA_DIR, "chamber.json");
const BACKUP_DIR  = path.join(DATA_DIR, "backups");
const ASSET_DIR   = path.join(DATA_DIR, "assets");
const BACKUP_KEEP = 5;

let win = null;

/* ---------------------------------------------------------------- helpers */

async function ensureDirs(){
  for (const d of [DATA_DIR, BACKUP_DIR, ASSET_DIR]){
    await fsp.mkdir(d, { recursive: true });
  }
}

/* write -> fsync -> rename, so a crash can never truncate the live file */
async function atomicWrite(file, text){
  const tmp = file + ".tmp";
  const fh = await fsp.open(tmp, "w");
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, file);
}

function emptyDoc(){
  return { kv:{}, messages:[], layout:[], stores:{ tracks:[], sprites:[], roomConfig:[] } };
}

async function readDoc(){
  try {
    const raw = await fsp.readFile(DOC_PATH, "utf8");
    const doc = JSON.parse(raw);
    if (doc && typeof doc === "object") return doc;
    throw new Error("document is not an object");
  } catch (err){
    if (err.code === "ENOENT") return emptyDoc();      // first run
    console.error("[chamber] main document unreadable:", err.message);
    // fall back to the newest backup that parses
    try {
      const files = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith(".json")).sort().reverse();
      for (const f of files){
        try {
          const doc = JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, f), "utf8"));
          console.warn("[chamber] recovered from backup", f);
          return doc;
        } catch (e){ /* try the next one */ }
      }
    } catch (e){ /* no backup dir */ }
    return emptyDoc();
  }
}

async function rotateBackup(text){
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.writeFile(path.join(BACKUP_DIR, "backup-" + stamp + ".json"), text, "utf8");
    const files = (await fsp.readdir(BACKUP_DIR)).filter(f => f.startsWith("backup-")).sort();
    while (files.length > BACKUP_KEEP){
      await fsp.unlink(path.join(BACKUP_DIR, files.shift())).catch(() => {});
    }
  } catch (err){ console.warn("[chamber] backup rotation failed:", err.message); }
}

let lastBackupAt = 0;

/* ------------------------------------------------------------------- IPC */

ipcMain.handle("store:load", async () => {
  await ensureDirs();
  return await readDoc();
});

ipcMain.handle("store:save", async (_ev, doc) => {
  await ensureDirs();
  const text = JSON.stringify(doc);
  await atomicWrite(DOC_PATH, text);
  if (Date.now() - lastBackupAt > 5 * 60 * 1000){   // a snapshot at most every 5 min
    lastBackupAt = Date.now();
    await rotateBackup(text);
  }
  return { ok:true, bytes: text.length, path: DOC_PATH };
});

ipcMain.handle("store:putAsset", async (_ev, id, buffer) => {
  await ensureDirs();
  await fsp.writeFile(path.join(ASSET_DIR, id + ".bin"), Buffer.from(buffer));
  return { ok:true };
});

ipcMain.handle("store:getAsset", async (_ev, id) => {
  try {
    const buf = await fsp.readFile(path.join(ASSET_DIR, id + ".bin"));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (err){ return null; }
});

ipcMain.handle("store:deleteAsset", async (_ev, id) => {
  await fsp.unlink(path.join(ASSET_DIR, id + ".bin")).catch(() => {});
  return { ok:true };
});

ipcMain.handle("app:paths", async () => ({
  dataDir: DATA_DIR, doc: DOC_PATH, backups: BACKUP_DIR, assets: ASSET_DIR
}));

ipcMain.handle("app:openDataFolder", async () => { shell.openPath(DATA_DIR); });

ipcMain.handle("app:exportJson", async (_ev, text, suggested) => {
  const res = await dialog.showSaveDialog(win, {
    title: "Export a backup",
    defaultPath: path.join(app.getPath("documents"), suggested || "chamber-backup.json"),
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (res.canceled || !res.filePath) return { canceled:true };
  await fsp.writeFile(res.filePath, text, "utf8");
  return { canceled:false, path: res.filePath };
});

ipcMain.handle("app:importJson", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Import a backup",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled:true };
  return { canceled:false, text: await fsp.readFile(res.filePaths[0], "utf8") };
});

/* pick real files (audio, images) - the desktop stand-in for the file picker */
ipcMain.handle("app:pickFiles", async (_ev, opts) => {
  const res = await dialog.showOpenDialog(win, {
    title: (opts && opts.title) || "Choose files",
    properties: ["openFile"].concat(opts && opts.multiple ? ["multiSelections"] : []),
    filters: (opts && opts.filters) || []
  });
  if (res.canceled) return [];
  const out = [];
  for (const p of res.filePaths){
    const buf = await fsp.readFile(p);
    out.push({ name: path.basename(p), path: p, size: buf.length,
               buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  }
  return out;
});

/* ---------------------------------------------------------------- window */

function buildMenu(){
  const template = [
    { label: "File", submenu: [
        { label: "Export backup...", accelerator: "CmdOrCtrl+E",
          click: () => win && win.webContents.send("menu:export") },
        { label: "Import backup...", accelerator: "CmdOrCtrl+I",
          click: () => win && win.webContents.send("menu:import") },
        { type: "separator" },
        { label: "Open data folder", click: () => shell.openPath(DATA_DIR) },
        { type: "separator" },
        { role: "quit" }
    ]},
    { label: "View", submenu: [
        { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" }
    ]},
    { label: "Help", submenu: [
        { label: "Where is my data?", click: () => {
            dialog.showMessageBox(win, {
              type: "info",
              title: "Where your data lives",
              message: "Everything is stored in plain files on this machine.",
              detail: "Document:\n" + DOC_PATH +
                      "\n\nRolling backups:\n" + BACKUP_DIR +
                      "\n\nImages and audio:\n" + ASSET_DIR +
                      "\n\nNo browser can clear these. Copy the folder anywhere to move or back up your room."
            });
        }},
        { label: "Open the web version", click: () => shell.openExternal("https://makumochi.github.io/chamber/") }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(){
  win = new BrowserWindow({
    width: 1360, height: 840, minWidth: 900, minHeight: 620,
    backgroundColor: "#0e0906",
    title: "The Chamber",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,      // renderer cannot touch node
      nodeIntegration: false,
      sandbox: false               // preload needs ipcRenderer
    }
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));

  /* The wall-portrait bookmarks call window.open(). Those must go to the
     user's real browser, never open a chromeless Electron window, and only
     ever for http/https. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(url);
    } catch (err){ /* ignore anything unparseable */ }
    return { action: "deny" };
  });

  /* Nothing may navigate this window away from the bundled page. */
  win.webContents.on("will-navigate", (ev, url) => {
    if (url !== win.webContents.getURL()) ev.preventDefault();
  });

  win.on("closed", () => { win = null; });
}

app.whenReady().then(async () => {
  await ensureDirs();
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
