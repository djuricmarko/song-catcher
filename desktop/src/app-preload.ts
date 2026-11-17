import { contextBridge, ipcRenderer } from 'electron';

import type { AppBridge } from './bridge.js';
import { settingsIpc } from './settings-ipc.js';

const openSettingsListeners = new Set<() => void>();
let openSettingsPending = false;

// The main process can ask for the settings before the page has subscribed, so the request waits for it.
ipcRenderer.on('app:open-settings', () => {
  openSettingsPending = openSettingsListeners.size === 0;
  openSettingsListeners.forEach((listener) => {
    listener();
  });
});

const bridge: AppBridge = {
  platform: process.platform,
  settings: settingsIpc,
  onOpenSettings: (listener) => {
    openSettingsListeners.add(listener);
    if (openSettingsPending) {
      openSettingsPending = false;
      listener();
    }
    return () => {
      openSettingsListeners.delete(listener);
    };
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
