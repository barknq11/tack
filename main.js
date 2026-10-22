// Tack desktop app (Electron).
// Everything Tack remembers lives in one file, %APPDATA%\Tack\store.json:
//  - written after every change, crash-safe (write to a temp file, flush to disk, then swap it in)
//  - the version before the latest change is kept as store.prev.json
//  - copied to backups\store-YYYY-MM-DD.json once a day (last 30 days kept)
//  - if store.json is ever damaged, it's set aside (never deleted) and the newest good copy is used
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.TACK_DATA || path.join(app.getPath('appData'), 'Tack'); // TACK_DATA is for testing
const storeFile = path.join(dataDir, 'store.json');
const prevFile = path.join(dataDir, 'store.prev.json');
const backupDir = path.join(dataDir, 'backups');
app.setPath('userData', path.join(dataDir, 'electron'));

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
function writeStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = storeFile + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, JSON.stringify(store));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  if (fs.existsSync(storeFile)) fs.copyFileSync(storeFile, prevFile);
  fs.renameSync(tmp, storeFile);
  dailyBackup();
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
const icon = path.join(__dirname, 'icon.ico');

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
  if (recovered) writeStore(); // put the recovered copy back in place right away

  ipcMain.on('store:load', e => { e.returnValue = store; });
  ipcMain.on('store:set', (e, key, value) => {
    store[key] = value;
    try { writeStore(); e.returnValue = true; } catch (err) { console.error(err); e.returnValue = false; }
  });
  ipcMain.on('store:open-folder', () => shell.openPath(dataDir));
  ipcMain.on('edit', (e, command) => { if (['cut', 'copy', 'paste', 'selectAll'].includes(command)) e.sender[command](); });

  app.whenReady().then(() => { dailyBackup(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
