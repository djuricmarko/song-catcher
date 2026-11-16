import { contextBridge, ipcRenderer } from 'electron';

import type { AppBridge } from './bridge.js';

const bridge: AppBridge = {
  openSettings: () => {
    ipcRenderer.send('app:open-settings');
  },
};

contextBridge.exposeInMainWorld('songCatcherApp', bridge);
