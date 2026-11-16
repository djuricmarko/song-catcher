import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { useAppConfig } from '../../hooks/useAppConfig';
import { ThemeSwitch } from '../ThemeSwitch';

import styles from './SettingsDialog.module.css';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const config = useAppConfig();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <div className={styles.head}>
            <Dialog.Title className={styles.title}>Settings</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close settings">
              <X size={14} strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.row}>
            <span>Theme</span>
            <ThemeSwitch />
          </div>
          {config.data ? (
            <>
              <div className={styles.row}>
                <span>MPD</span>
                <span className={styles.value}>{config.data.useMpd ? 'Linked' : 'Off'}</span>
              </div>
              <div className={styles.row}>
                <span>Version</span>
                <span className={styles.value}>v{config.data.version}</span>
              </div>
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
