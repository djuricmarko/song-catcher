interface DesktopApp {
  platform: string;
  openSettings: () => void;
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
