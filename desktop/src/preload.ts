import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopBridge } from './bridge.js';
import { settingsIpc } from './settings-ipc.js';

const bridge: DesktopBridge = {
  ...settingsIpc,
  platform: process.platform,
  close: () => {
    ipcRenderer.send('settings:close');
  },
};

contextBridge.exposeInMainWorld('songCatcher', bridge);
