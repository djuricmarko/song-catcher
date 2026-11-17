import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

import styles from './LargeDialog.module.css';

interface LargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  className?: string;
  children: ReactNode;
}

export function LargeDialog({ open, onOpenChange, label, className, children }: LargeDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={cn(styles.popup, className)} aria-label={label}>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface LargeDialogHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function LargeDialogHeader({ title, actions, onClose, className }: LargeDialogHeaderProps) {
  return (
    <header className={cn(styles.header, className)}>
      <h2 className={styles.title}>{title}</h2>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {onClose ? (
        <button type="button" className={styles.close} aria-label="Close" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </header>
  );
}
