import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesktopSettings } from '../../web/src/components/SettingsDialog/DesktopSettings';
import { syncWindowChrome } from '../../web/src/lib/windowChrome';
import '../../web/src/styles/global.css';
import type { DesktopBridge } from '../src/bridge';

declare global {
  interface Window {
    songCatcher: DesktopBridge;
  }
}

function followSystemTheme(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light';
  };
  dark.addEventListener('change', apply);
  apply();
}

followSystemTheme();
syncWindowChrome(window.songCatcher.platform);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <DesktopSettings
      bridge={window.songCatcher}
      mode="window"
      onClose={() => {
        window.songCatcher.close();
      }}
    />
  </StrictMode>,
);
