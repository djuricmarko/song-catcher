import { Dialog } from '@base-ui/react/dialog';
import { useNavigate } from 'react-router-dom';

import type { TaskSource } from '@song-catcher/shared';

import { SourceLabel } from '../SourceLogo';

import styles from './SourcePicker.module.css';

interface SourcePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourcePicker({ open, onOpenChange }: SourcePickerProps) {
  const navigate = useNavigate();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className="sr-only">New download</Dialog.Title>
          {(['youtube', 'deezer'] satisfies TaskSource[]).map((source) => (
            <button
              key={source}
              type="button"
              className={styles.option}
              onClick={() => {
                onOpenChange(false);
                void navigate(`/${source}`);
              }}
            >
              <SourceLabel source={source} />
            </button>
          ))}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
