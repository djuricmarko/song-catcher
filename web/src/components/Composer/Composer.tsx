import { ArrowRight } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode, SubmitEvent } from 'react';

import { cn } from '../../lib/cn';
import { PasteButton } from '../PasteButton';

import styles from './Composer.module.css';

interface ComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  inputLabel: string;
  submitLabel: string;
  busy?: boolean;
  inputMode?: ComponentPropsWithoutRef<'input'>['inputMode'];
  footer?: ReactNode;
}

export function Composer({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  inputLabel,
  submitLabel,
  busy = false,
  inputMode,
  footer,
}: ComposerProps) {
  const send = (
    <button type="submit" className={styles.send} disabled={busy} aria-label={submitLabel} title={submitLabel}>
      <ArrowRight size={15} strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <form
      className={styles.composer}
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.row}>
        <input
          className={styles.input}
          data-composer-input
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          placeholder={placeholder}
          aria-label={inputLabel}
          inputMode={inputMode}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <PasteButton onPaste={onValueChange} />
        {footer ? null : send}
      </div>
      {footer ? (
        <div className={styles.footer}>
          <div className={styles.controls}>{footer}</div>
          {send}
        </div>
      ) : null}
    </form>
  );
}

export function ComposerStage({ raised = false, children }: { raised?: boolean; children: ReactNode }) {
  return <div className={cn(styles.stage, raised && styles.stageRaised)}>{children}</div>;
}
