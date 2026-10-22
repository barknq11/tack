// Tack desktop app (Electron).
// Everything Tack remembers lives in one file, %APPDATA%\Tack\store.json:
//  - written after every change, crash-safe (write to a temp file, flush to disk, then swap it in)
//  - the version before the latest change is kept as store.prev.json
//  - copied to backups\store-YYYY-MM-DD.json once a day (last 30 days kept)
//  - if store.json is ever damaged, it's set aside (never deleted) and the newest good copy is used
//  - a save can never quietly drop tasks that are already on disk (see keepTasksOnDisk)
//  - what happens at startup is written to tack.log
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.TACK_DATA || path.join(app.getPath('appData'), 'Tack'); // TACK_DATA is for testing
const storeFile = path.join(dataDir, 'store.json');
const prevFile = path.join(dataDir, 'store.prev.json');
const backupDir = path.join(dataDir, 'backups');
const logFile = path.join(dataDir, 'tack.log');
app.setPath('userData', path.join(dataDir, 'electron'));

function log(message) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 256 * 1024) {
      const text = fs.readFileSync(logFile, 'utf8');
      fs.writeFileSync(logFile, text.slice(text.length / 2));
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()}  ${message}\n`);
  } catch {}
}
const taskCount = s => Array.isArray(s?.['tack.tasks']) ? s['tack.tasks'].length : 'none';

const listBackups = () => fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter(f => /^store-\d{4}-\d\d-\d\d\.json$/.test(f)).sort().reverse() : [];

// Returns [data, recovered]: recovered is true when store.json was missing or damaged and a copy was used
function loadStore() {
  if (fs.existsSync(storeFile)) {
    try { return [JSON.parse(fs.readFileSync(storeFile, 'utf8')), false]; }
    catch { try { fs.renameSync(storeFile, storeFile.replace(/\.json$/, `.damaged-${Date.now()}.json`)); } catch {} }
  }
  for (const f of [prevFile, ...listBackups().map(b => path.join(backupDir, b))]) {
    try { return [JSON.parse(fs.readFileSync(f, 'utf8')), true]; } catch {}
  }
  return [{}, false]; // a brand-new install
}
// Safety net: if this save would remove two or more tasks that are on disk (or leave none at all),
// something is out of sync, e.g. a window that never loaded your data. Keep those tasks instead.
// Removing a single task (undoing an add) is normal and allowed; deleting a task never removes it from the list.
function keepTasksOnDisk() {
  let onDisk;
  try { onDisk = JSON.parse(fs.readFileSync(storeFile, 'utf8'))['tack.tasks']; } catch { return false; }
  if (!Array.isArray(onDisk) || !onDisk.length) return false;
  const inMemory = Array.isArray(store['tack.tasks']) ? store['tack.tasks'] : [];
  const have = new Set(inMemory.map(t => t.uuid));
  const missing = onDisk.filter(t => !have.has(t.uuid));
  if (!missing.length || (missing.length === 1 && inMemory.length)) return false;
  store['tack.tasks'] = [...inMemory, ...missing];
  log(`SAFEGUARD kept ${missing.length} task(s) that were on disk but missing from the app (app had ${inMemory.length})`);
  return true;
}
function writeStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const kept = keepTasksOnDisk();
  const tmp = storeFile + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, JSON.stringify(store));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  if (fs.existsSync(storeFile)) fs.copyFileSync(storeFile, prevFile);
  fs.renameSync(tmp, storeFile);
  dailyBackup();
  // The window was showing an out-of-date list: reload it so you see everything
  if (kept && win && !win.isDestroyed()) setImmediate(() => win.webContents.reload());
}
function dailyBackup() {
  if (!fs.existsSync(storeFile)) return;
  const today = path.join(backupDir, `store-${new Date().toLocaleDateString('sv')}.json`);
  if (fs.existsSync(today)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(storeFile, today);
  for (const f of listBackups().slice(30)) fs.rmSync(path.join(backupDir, f));
}

let store = {};
let win, mini;
let pageConnected = false;
const icon = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow() {
  const b = store['win.bounds'] || {};
  win = new BrowserWindow({
    width: b.width || 1100, height: b.height || 760, x: b.x, y: b.y, minWidth: 360, minHeight: 420,
    title: 'Tack', icon, show: false, autoHideMenuBar: true,
    backgroundColor: '#111113',
    // backgroundThrottling off: while pinned, this hidden window still drives the mini window's live timer
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  if (b.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', e => e.preventDefault());

  // Self-heal: the page must ask for your data right after it loads. If it doesn't (it couldn't
  // connect to the data file), reload it once; if it still can't, the page shows a warning and saves nothing.
  const wc = win.webContents;
  let reloads = 0;
  wc.on('did-finish-load', () => {
    pageConnected = false;
    setTimeout(() => {
      if (pageConnected || win.isDestroyed()) return;
      log(`page did not connect to the data file${reloads ? ' after a reload' : '; reloading it'}`);
      if (!reloads++) wc.reload();
    }, 4000);
  });
  wc.on('preload-error', (e, file, err) => log(`preload error: ${err?.stack || err}`));
  wc.on('render-process-gone', (e, d) => log(`page crashed: ${d.reason}`));
  wc.on('console-message', (...args) => {
    const d = args.length > 1 ? { level: args[1], message: args[2] } : args[0];
    if (d.level === 3 || d.level === 'error') log(`page error: ${d.message}`);
  });

  // The pinned "Running" mini window: a small always-on-top window the page fills itself
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === 'tack-mini') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 320, height: 400, minWidth: 240, minHeight: 220, title: 'Tack · Running', icon,
          alwaysOnTop: true, autoHideMenuBar: true, maximizable: false, fullscreenable: false,
          backgroundColor: '#111113',
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // One mode at a time: pinning hides the full window; closing the mini window brings it back
  win.webContents.on('did-create-window', child => {
    mini = child;
    child.setAlwaysOnTop(true, 'floating');
    child.setMenu(null);
    win.hide();
    child.on('closed', () => {
      mini = null;
      if (!win.isDestroyed()) { win.show(); win.focus(); }
    });
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    store['win.bounds'] = { ...(win.isMaximized() ? store['win.bounds'] : win.getNormalBounds()), maximized: win.isMaximized() };
    try { writeStore(); } catch {}
  };
  let boundsTimer;
  const saveSoon = () => { clearTimeout(boundsTimer); boundsTimer = setTimeout(saveBounds, 800); };
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(ev, saveSoon);
  win.on('close', saveBounds);
  win.on('closed', () => app.quit()); // closing the main window also closes the mini window
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const w = mini && !mini.isDestroyed() ? mini : win; // opening Tack again while pinned shows the pinned window
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  });
  app.setAppUserModelId('io.github.barknq11.tack'); // matches "appId" in package.json
  Menu.setApplicationMenu(null);
  let recovered;
  [store, recovered] = loadStore();
  const size = fs.existsSync(storeFile) ? `${fs.statSync(storeFile).size} bytes` : 'missing';
  log(`start v${app.getVersion()} | data ${storeFile} (${size}) | ${taskCount(store)} tasks loaded${recovered ? ' from a backup copy' : ''}`);
  if (recovered) writeStore(); // put the recovered copy back in place right away

  ipcMain.on('store:load', e => {
    if (e.sender === win?.webContents) { pageConnected = true; log(`page connected, ${taskCount(store)} tasks`); }
    e.returnValue = store;
  });
  ipcMain.on('store:set', (e, key, value) => {
    store[key] = value;
    try { writeStore(); e.returnValue = true; } catch (err) { console.error(err); e.returnValue = false; }
  });
  ipcMain.on('store:open-folder', () => shell.openPath(dataDir));
  ipcMain.on('edit', (e, command) => { if (['cut', 'copy', 'paste', 'selectAll'].includes(command)) e.sender[command](); });

  app.whenReady().then(() => { dailyBackup(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
