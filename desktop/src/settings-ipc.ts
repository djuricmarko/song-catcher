import type { SettingsBridge } from '@song-catcher/shared';
import { ipcRenderer } from 'electron';

export const settingsIpc: SettingsBridge = {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseDirectory: (current) => ipcRenderer.invoke('settings:choose-directory', current),
  setTheme: (theme) => {
    ipcRenderer.send('settings:set-theme', theme);
  },
};
