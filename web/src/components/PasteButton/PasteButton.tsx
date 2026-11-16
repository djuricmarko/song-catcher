import { ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';

import styles from './PasteButton.module.css';

function canReadClipboard(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `clipboard` is missing in some browsers, whatever the DOM types say
  return typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.readText === 'function';
}

interface PasteButtonProps {
  onPaste: (text: string) => void;
  label?: string;
}

export function PasteButton({ onPaste, label = 'Paste from clipboard' }: PasteButtonProps) {
  if (!canReadClipboard()) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.readText().then(
          (text) => {
            const trimmed = text.trim();
            if (trimmed) {
              onPaste(trimmed);
            } else {
              toast.info('Clipboard is empty');
            }
          },
          () => toast.error('Clipboard access was blocked'),
        );
      }}
    >
      <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
