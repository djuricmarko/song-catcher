import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopBridge } from './bridge.js';

const bridge: DesktopBridge = {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseDirectory: (current) => ipcRenderer.invoke('settings:choose-directory', current),
  setTheme: (theme) => {
    ipcRenderer.send('settings:set-theme', theme);
  },
  close: () => {
    ipcRenderer.send('settings:close');
  },
};

contextBridge.exposeInMainWorld('songCatcher', bridge);
