interface DesktopApp {
  openSettings: () => void;
}

declare global {
  interface Window {
    songCatcherApp?: DesktopApp;
  }
}

export function desktopApp(): DesktopApp | undefined {
  return window.songCatcherApp;
}
