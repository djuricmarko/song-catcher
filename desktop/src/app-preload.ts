import { contextBridge, ipcRenderer } from 'electron';

import type { AppBridge } from './bridge.js';

const bridge: AppBridge = {
  platform: process.platform,
  openSettings: () => {
    ipcRenderer.send('app:open-settings');
  },
  ...(process.platform === 'darwin'
    ? {}
    : {
        showMenu: (x: number, y: number) => {
          ipcRenderer.send('app:show-menu', x, y);
        },
      }),
};

contextBridge.exposeInMainWorld('songCatcherApp', bridge);
