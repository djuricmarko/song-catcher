import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type { DesktopSettingsState, QueueTask, SaveSettingsResult } from '@song-catcher/shared';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';

import { EmbeddedServer, type StartedServer } from './embedded-server.js';
import { loadSettings, saveSettings, secretsEncrypted } from './settings-store.js';
import {
  defaultSettings,
  needsRestart,
  serverEnvironment,
  settingsIssues,
  settingsSchema,
  type Settings,
  type ToolPaths,
} from './settings.js';
import { downloadYtDlp } from './tool-assets.js';
import { builderPlatform, executableName, locateTools, searchDirectories } from './tools.js';
import {
  CONTENT_SECURITY_POLICY,
  createRendererRecovery,
  isSameOrigin,
  safeExternalUrl,
  titleBarOptions,
  windowBackground,
} from './window-chrome.js';
import { loadWindowState, restoreWindowBounds, saveWindowState, type WindowState } from './window-state.js';

const isMac = process.platform === 'darwin';
const userData = app.getPath('userData');
const settingsFile = path.join(userData, 'settings.json');
const windowStateFile = path.join(userData, 'window-state.json');
const userBin = path.join(userData, 'bin');
const userYtDlp = path.join(userBin, executableName('yt-dlp'));
const bundledBin = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(import.meta.dirname, '../vendor', `${builderPlatform()}-${process.arch}`);
const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(import.meta.dirname, '../../web/dist');

const APP_USER_MODEL_ID = 'io.github.djuricmarko.song-catcher';
const MAIN_WINDOW_SIZE = { width: 1180, height: 800 };
const MAIN_WINDOW_MIN_SIZE = { width: 920, height: 560 };
const WINDOW_STATE_SAVE_DELAY_MS = 500;

const LOGIN_REJECTED =
  'Deezer did not accept the ARL cookie, so Deezer downloads will fail. Paste a fresh one from your browser. ' +
  'YouTube downloads keep working.';

let settings: Settings;
let defaults: Settings;
let mainWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let settingsNotice: string | undefined;
let quitConfirmed = false;

const server = new EmbeddedServer(() => {
  if (quitConfirmed) {
    return;
  }
  openSettingsWindow('The download service stopped unexpectedly. Save to start it again.');
  mainWindow?.destroy();
});

function toolDirectories(): string[] {
  return [userBin, bundledBin, ...searchDirectories(process.env.PATH)];
}

function findTools(): ToolPaths {
  return locateTools(toolDirectories());
}

function seedYtDlp(): void {
  const bundled = path.join(bundledBin, executableName('yt-dlp'));
  if (existsSync(userYtDlp) || !existsSync(bundled)) {
    return;
  }
  mkdirSync(userBin, { recursive: true });
  copyFileSync(bundled, userYtDlp);
}

async function startServer(): Promise<StartedServer> {
  const started = await server.start((port) =>
    serverEnvironment(
      settings,
      {
        tools: findTools(),
        searchPath: toolDirectories().join(path.delimiter),
        webRoot,
        logFile: path.join(app.getPath('logs'), 'song-catcher.log'),
        port,
        password: server.password,
        version: app.getVersion(),
      },
      process.env,
    ),
  );

  const appRequests = { urls: [`${started.origin}/*`] };
  session.defaultSession.webRequest.onBeforeSendHeaders(appRequests, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, Authorization: server.authorization } });
  });
  session.defaultSession.webRequest.onHeadersReceived(appRequests, (details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CONTENT_SECURITY_POLICY] },
    });
  });
  return started;
}

async function pendingDownloads(): Promise<number> {
  if (!server.origin) {
    return 0;
  }
  try {
    const response = await fetch(`${server.origin}/api/queue`, { headers: { Authorization: server.authorization } });
    const tasks = (await response.json()) as QueueTask[];
    return tasks.filter((task) => task.state === 'active' || task.state === 'waiting').length;
  } catch {
    return 0;
  }
}

function openExternal(raw: string): void {
  const url = safeExternalUrl(raw);
  if (url) {
    void shell.openExternal(url);
  }
}

function syncAppearance(window: BrowserWindow): void {
  const dark = nativeTheme.shouldUseDarkColors;
  window.setBackgroundColor(windowBackground(dark));
  const { titleBarOverlay } = titleBarOptions(process.platform, dark);
  if (typeof titleBarOverlay === 'object') {
    window.setTitleBarOverlay(titleBarOverlay);
  }
}

function revealWhenReady(window: BrowserWindow, reveal: () => void): void {
  let revealed = false;
  const show = () => {
    if (!revealed && !window.isDestroyed()) {
      revealed = true;
      reveal();
    }
  };
  window.once('ready-to-show', show);
  // ready-to-show is unreliable for hidden windows on Linux, so a finished load reveals the window too.
  if (process.platform === 'linux') {
    window.webContents.once('did-finish-load', show);
  }
}

function recoverRenderer(window: BrowserWindow): void {
  const recoveryDelay = createRendererRecovery();
  window.webContents.on('render-process-gone', (_event, details) => {
    const delay = recoveryDelay(details.reason, Date.now());
    if (delay === undefined) {
      return;
    }
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.webContents.reload();
      }
    }, delay);
  });
}

// Electron shows no context menu of its own, which leaves text fields without cut, copy and paste.
function installContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];
    const link = safeExternalUrl(params.linkURL);
    if (link) {
      template.push({
        label: 'Copy Link',
        click: () => {
          void clipboard.writeText(link);
        },
      });
    }
    if (params.isEditable) {
      template.push(
        ...(link ? [{ type: 'separator' } satisfies MenuItemConstructorOptions] : []),
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      );
    } else if (params.selectionText.trim() !== '') {
      template.push({ role: 'copy' });
    }
    if (template.length > 0 && !window.isDestroyed()) {
      Menu.buildFromTemplate(template).popup({ window });
    }
  });
}

function trackWindowState(window: BrowserWindow, initial: WindowState | undefined): void {
  let state = initial;
  let timer: NodeJS.Timeout | undefined;

  const save = () => {
    clearTimeout(timer);
    // A minimized window reports stale geometry, so it keeps what was seen before it was minimized.
    if (!window.isDestroyed() && !window.isMinimized()) {
      const maximized = window.isMaximized();
      const bounds = maximized || window.isFullScreen() ? window.getNormalBounds() : window.getBounds();
      state = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        maximized,
      };
    }
    if (state) {
      saveWindowState(windowStateFile, state);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, WINDOW_STATE_SAVE_DELAY_MS);
  };

  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', save);
  window.on('closed', () => {
    clearTimeout(timer);
  });
}

function loadApp(window: BrowserWindow, origin: string, withSettings: boolean): void {
  if (withSettings) {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('app:open-settings');
    });
  }
  void window.loadURL(`${origin}/`);
}

function showMainWindow(origin: string, withSettings: boolean): void {
  if (mainWindow) {
    loadApp(mainWindow, origin, withSettings);
    mainWindow.focus();
    return;
  }

  const savedState = loadWindowState(windowStateFile);
  const window = new BrowserWindow({
    ...restoreWindowBounds(
      savedState,
      screen.getAllDisplays().map((display) => display.bounds),
      MAIN_WINDOW_SIZE,
      MAIN_WINDOW_MIN_SIZE,
    ),
    minWidth: MAIN_WINDOW_MIN_SIZE.width,
    minHeight: MAIN_WINDOW_MIN_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    title: 'Song Catcher',
    icon: path.join(webRoot, 'icon-512.png'),
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors),
    ...titleBarOptions(process.platform, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'app-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;

  revealWhenReady(window, () => {
    if (savedState?.maximized) {
      window.maximize();
    }
    window.show();
  });
  trackWindowState(window, savedState);
  recoverRenderer(window);
  installContextMenu(window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url, server.origin)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.on('close', (event) => {
    if (quitConfirmed) {
      return;
    }
    event.preventDefault();
    void pendingDownloads().then((count) => {
      const stay =
        count > 0 &&
        dialog.showMessageBoxSync(window, {
          type: 'question',
          buttons: ['Keep downloading', 'Quit'],
          defaultId: 0,
          cancelId: 0,
          message: count === 1 ? '1 download is still in progress' : `${count} downloads are still in progress`,
          detail: 'Quitting now stops them.',
        }) === 0;
      if (!stay) {
        quitConfirmed = true;
        app.quit();
      }
    });
  });
  window.on('closed', () => {
    mainWindow = undefined;
  });

  loadApp(window, origin, withSettings);
}

function openSettings(): void {
  if (!mainWindow) {
    openSettingsWindow();
    return;
  }
  mainWindow.webContents.send('app:open-settings');
  mainWindow.focus();
}

function openSettingsWindow(notice?: string): void {
  if (notice) {
    settingsNotice = notice;
  }
  if (settingsWindow) {
    settingsWindow.reload();
    settingsWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Song Catcher Settings',
    icon: path.join(webRoot, 'icon-512.png'),
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors),
    ...titleBarOptions(process.platform, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  settingsWindow = window;
  window.removeMenu();

  revealWhenReady(window, () => {
    window.show();
  });
  recoverRenderer(window);
  installContextMenu(window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.on('closed', () => {
    settingsWindow = undefined;
  });

  void window.loadFile(path.join(import.meta.dirname, 'settings/index.html'));
}

async function launch(): Promise<void> {
  if (!settings.arl) {
    openSettingsWindow('Enter your Deezer ARL cookie to get started.');
    return;
  }
  try {
    const { origin, loggedIn } = await startServer();
    settingsNotice = loggedIn ? undefined : LOGIN_REJECTED;
    showMainWindow(origin, !loggedIn);
  } catch (error) {
    openSettingsWindow(startupFailure(error));
  }
}

function startupFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll('DEEZER_COOKIE_ARL', 'the ARL cookie');
}

async function restartService(): Promise<SaveSettingsResult> {
  try {
    const { origin, loggedIn } = await startServer();
    settingsNotice = loggedIn ? undefined : LOGIN_REJECTED;
    settingsWindow?.close();
    showMainWindow(origin, !loggedIn);
    return { ok: true };
  } catch (error) {
    const message = startupFailure(error);
    if (mainWindow) {
      openSettingsWindow(message);
      mainWindow.destroy();
    }
    return { ok: false, message };
  }
}

function fromSettingsUi(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return [settingsWindow, mainWindow].some((window) => window?.webContents === event.sender);
}

function registerSettingsIpc(): void {
  ipcMain.handle('settings:load', async (event): Promise<DesktopSettingsState | undefined> => {
    if (!fromSettingsUi(event)) {
      return undefined;
    }
    const tools = findTools();
    return {
      settings,
      defaults,
      notice: settingsNotice,
      tools: {
        'yt-dlp': tools['yt-dlp'] !== undefined,
        ffmpeg: tools.ffmpeg !== undefined,
        metaflac: tools.metaflac !== undefined,
      },
      secretsEncrypted: await secretsEncrypted(),
      version: app.getVersion(),
    };
  });

  ipcMain.handle('settings:save', async (event, input: unknown): Promise<SaveSettingsResult> => {
    if (!fromSettingsUi(event)) {
      return { ok: false, message: 'Settings can only be saved from Song Catcher.' };
    }
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: settingsIssues(parsed.error) };
    }
    if (!parsed.data.arl) {
      return { ok: false, message: 'Enter your Deezer ARL cookie.' };
    }

    const restart = !server.running || settingsNotice !== undefined || needsRestart(settings, parsed.data);
    settings = parsed.data;
    nativeTheme.themeSource = settings.theme;
    await saveSettings(settingsFile, settings);
    return restart ? restartService() : { ok: true };
  });

  ipcMain.handle('settings:choose-directory', async (event, current: unknown): Promise<string | undefined> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !fromSettingsUi(event)) {
      return undefined;
    }
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Choose the download folder',
      defaultPath: typeof current === 'string' ? current : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return filePaths[0];
  });

  ipcMain.on('settings:set-theme', (event, input: unknown) => {
    const theme = settingsSchema.shape.theme.safeParse(input);
    if (!fromSettingsUi(event) || !theme.success) {
      return;
    }
    settings = { ...settings, theme: theme.data };
    nativeTheme.themeSource = theme.data;
    void saveSettings(settingsFile, settings);
  });

  ipcMain.on('app:show-menu', (event, x: unknown, y: unknown) => {
    if (event.sender !== mainWindow?.webContents || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    // The page reports CSS pixels, which the zoom level scales away from window coordinates.
    const zoom = event.sender.getZoomFactor();
    Menu.getApplicationMenu()?.popup({
      window: mainWindow,
      x: Math.round((x as number) * zoom),
      y: Math.round((y as number) * zoom),
    });
  });

  ipcMain.on('settings:close', (event) => {
    if (event.sender === settingsWindow?.webContents) {
      settingsWindow.close();
    }
  });
}

async function updateYtDlp(): Promise<void> {
  const usedBefore = findTools()['yt-dlp'];
  try {
    await downloadYtDlp(userYtDlp, process.platform, process.arch);
  } catch (error) {
    dialog.showErrorBox('Could not update yt-dlp', error instanceof Error ? error.message : String(error));
    return;
  }
  await dialog.showMessageBox({
    type: 'info',
    message: 'yt-dlp is up to date',
    detail:
      usedBefore === userYtDlp
        ? 'The next YouTube download uses the new version.'
        : 'Restart Song Catcher to use the new version.',
  });
}

function buildMenu(): Menu {
  const settingsItem: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => {
      openSettings();
    },
  };
  const appItems: MenuItemConstructorOptions[] = [
    {
      label: 'Open Downloads Folder',
      click: () => {
        void shell.openPath(settings.downloadDir);
      },
    },
    {
      label: 'Update yt-dlp',
      click: () => {
        void updateYtDlp();
      },
    },
  ];

  return Menu.buildFromTemplate([
    ...(isMac
      ? [
          {
            role: 'appMenu',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: isMac ? appItems : [settingsItem, ...appItems, { type: 'separator' }, { role: 'quit' }],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // On Windows and Linux the window menu would bind Ctrl+M, which the web UI uses to focus search.
    ...(isMac ? [{ role: 'windowMenu' } satisfies MenuItemConstructorOptions] : []),
  ]);
}

function restrictPermissions(): void {
  const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fileSystem']);
  const fromApp = (url: string) =>
    server.origin !== undefined && (url === server.origin || url.startsWith(`${server.origin}/`));

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowed.has(permission) && fromApp(webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, origin) => allowed.has(permission) && fromApp(origin),
  );
}

if (app.requestSingleInstanceLock()) {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }

  app.on('second-instance', () => {
    const window = mainWindow ?? settingsWindow;
    if (window?.isMinimized()) {
      window.restore();
    }
    window?.focus();
  });

  app.on('window-all-closed', () => {
    quitConfirmed = true;
    app.quit();
  });

  app.on('will-quit', (event) => {
    if (server.running) {
      event.preventDefault();
      void server.stop().finally(() => {
        app.quit();
      });
    }
  });

  void app.whenReady().then(async () => {
    defaults = defaultSettings(path.join(app.getPath('music'), 'Song Catcher'));
    settings = await loadSettings(settingsFile, defaults);
    nativeTheme.themeSource = settings.theme;
    seedYtDlp();
    restrictPermissions();
    registerSettingsIpc();
    nativeTheme.on('updated', () => {
      BrowserWindow.getAllWindows().forEach(syncAppearance);
    });
    Menu.setApplicationMenu(buildMenu());
    await launch();
  });
} else {
  app.quit();
}
