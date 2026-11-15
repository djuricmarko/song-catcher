import type { Settings, ToolName } from './settings.js';

export interface SettingsState {
  settings: Settings;
  notice: string | undefined;
  tools: Record<ToolName, boolean>;
  secretsEncrypted: boolean;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export interface DesktopBridge {
  load: () => Promise<SettingsState>;
  save: (settings: Settings) => Promise<SaveResult>;
  chooseDirectory: (current: string) => Promise<string | undefined>;
  close: () => void;
}
