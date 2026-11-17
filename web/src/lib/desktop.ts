import type { SettingsBridge } from '@song-catcher/shared';

export interface DesktopApp {
  platform: string;
  settings: SettingsBridge;
  onOpenSettings: (listener: () => void) => () => void;
  showMenu?: (x: number, y: number) => void;
}

declare global {
  interface Window {
    songCatcherApp?: DesktopApp;
  }
}

export function desktopApp(): DesktopApp | undefined {
  return window.songCatcherApp;
}
