import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { safeStorage } from 'electron';

import { mergeSettings, type Settings } from './settings.js';

interface StoredSettings extends Omit<Settings, 'arl'> {
  arl?: string;
  arlEncrypted?: string;
}

export async function secretsEncrypted(): Promise<boolean> {
  const weakLinuxFallback = process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text';
  return !weakLinuxFallback && (await safeStorage.isAsyncEncryptionAvailable());
}

export async function loadSettings(file: string, defaults: Settings): Promise<Settings> {
  let stored: StoredSettings;
  try {
    stored = JSON.parse(await readFile(file, 'utf8')) as StoredSettings;
  } catch {
    return defaults;
  }

  const { arlEncrypted, ...plain } = stored;
  if (!arlEncrypted) {
    return mergeSettings(defaults, plain);
  }
  try {
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(arlEncrypted, 'base64'));
    return mergeSettings(defaults, { ...plain, arl: result });
  } catch {
    return mergeSettings(defaults, { ...plain, arl: '' });
  }
}

export async function saveSettings(file: string, settings: Settings): Promise<void> {
  const { arl, ...rest } = settings;
  const stored: StoredSettings = (await secretsEncrypted())
    ? { ...rest, arlEncrypted: (await safeStorage.encryptStringAsync(arl)).toString('base64') }
    : { ...rest, arl };

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
}
