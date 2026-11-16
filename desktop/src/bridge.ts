import type { Settings, ToolName } from './settings.js';

export interface SettingsState {
  settings: Settings;
  notice: string | undefined;
  tools: Record<ToolName, boolean>;
  secretsEncrypted: boolean;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export interface DesktopBridge {
  platform: string;
  load: () => Promise<SettingsState>;
  save: (settings: Settings) => Promise<SaveResult>;
  chooseDirectory: (current: string) => Promise<string | undefined>;
  setTheme: (theme: Settings['theme']) => void;
  close: () => void;
}

export interface AppBridge {
  platform: string;
  openSettings: () => void;
  /** Pops up the application menu at a point in the page. Absent on macOS, which keeps its menu bar. */
  showMenu?: (x: number, y: number) => void;
}
