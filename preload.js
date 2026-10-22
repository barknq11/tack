// Gives the page access to Tack's data file (see main.js), and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tackStore', {
  load: () => ipcRenderer.sendSync('store:load'),
  set: (key, value) => ipcRenderer.sendSync('store:set', key, value),
  openFolder: () => ipcRenderer.send('store:open-folder'),
  edit: command => ipcRenderer.send('edit', command), // cut / copy / paste / selectAll in this window
});
