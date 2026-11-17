import type { SettingsBridge } from '@song-catcher/shared';

import { useQueue } from '../../hooks/useQueue';
import { desktopApp } from '../../lib/desktop';
import { LargeDialog } from '../LargeDialog';
import { DesktopSettings } from './DesktopSettings';
import { WebSettings } from './WebSettings';

function AppSettings({ bridge, onClose }: { bridge: SettingsBridge; onClose: () => void }) {
  const { tasks } = useQueue();
  const activeDownloads = tasks.filter((task) => task.state === 'active' || task.state === 'waiting').length;
  return <DesktopSettings bridge={bridge} mode="dialog" onClose={onClose} activeDownloads={activeDownloads} />;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const desktop = desktopApp();
  const close = () => {
    onOpenChange(false);
  };

  return (
    <LargeDialog open={open} onOpenChange={onOpenChange} label="Settings">
      {desktop ? <AppSettings bridge={desktop.settings} onClose={close} /> : <WebSettings onClose={close} />}
    </LargeDialog>
  );
}
