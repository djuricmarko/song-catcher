import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700',
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-4 rounded border-zinc-300 text-violet-600 accent-violet-600"
        {...props}
      />
      {label}
    </label>
  );
}
