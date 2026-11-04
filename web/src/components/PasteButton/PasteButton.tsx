import { ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';

import styles from './PasteButton.module.css';

/** The async clipboard API only exists in secure contexts (https or localhost). */
function canReadClipboard(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.readText === 'function';
}

interface PasteButtonProps {
  onPaste: (text: string) => void;
  label?: string;
}

/**
 * One-tap paste for link fields; long-press-to-paste is fiddly on phones.
 * Renders nothing where the browser cannot read the clipboard.
 */
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
      <ClipboardPaste size={18} aria-hidden />
    </button>
  );
}
