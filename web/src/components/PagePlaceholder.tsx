import type { ReactNode } from 'react';

interface PagePlaceholderProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function PagePlaceholder({ title, description, children }: PagePlaceholderProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        This view is part of the migration scaffold and will be wired to the API in the next phase.
      </p>
    </section>
  );
}
