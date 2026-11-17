import type { SettingsBridge } from '@song-catcher/shared';

export interface DesktopBridge extends SettingsBridge {
  platform: string;
  close: () => void;
}

export interface AppBridge {
  platform: string;
  settings: SettingsBridge;
  onOpenSettings: (listener: () => void) => () => void;
  /** Pops up the application menu at a point in the page. Absent on macOS, which keeps its menu bar. */
  showMenu?: (x: number, y: number) => void;
}
