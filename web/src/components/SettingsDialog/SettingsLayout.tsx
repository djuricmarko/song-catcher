import { Search, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { ThemePreference } from '../../hooks/useTheme';
import { cn } from '../../lib/cn';
import { LargeDialogHeader } from '../LargeDialog';
import type { SelectOption } from '../ui/Select';

import styles from './SettingsLayout.module.css';

export interface SettingsRow {
  title: string;
  description?: string;
  controlId?: string;
  control?: ReactNode;
}

export interface SettingsGroup {
  title: string;
  rows: SettingsRow[];
}

export interface SettingsPage {
  id: string;
  label: string;
  icon: LucideIcon;
  groups: SettingsGroup[];
  bottom?: boolean;
}

interface ShownGroup {
  page: SettingsPage;
  group: SettingsGroup;
  rows: SettingsRow[];
}

export const THEME_OPTIONS: Array<SelectOption<ThemePreference>> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingValue({ children }: { children: ReactNode }) {
  return <span className={styles.value}>{children}</span>;
}

function searchGroups(pages: SettingsPage[], needle: string): ShownGroup[] {
  return pages
    .flatMap((page) =>
      page.groups.map((group) => ({
        page,
        group,
        rows: `${page.label} ${group.title}`.toLowerCase().includes(needle)
          ? group.rows
          : group.rows.filter((row) => `${row.title} ${row.description ?? ''}`.toLowerCase().includes(needle)),
      })),
    )
    .filter((shown) => shown.rows.length > 0);
}

function isEditable(target: EventTarget): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
}

interface SettingsLayoutProps {
  pages: [SettingsPage, ...SettingsPage[]];
  initialPage: string;
  notice?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  windowed?: boolean;
}

export function SettingsLayout({
  pages,
  initialPage,
  notice,
  actions,
  footer,
  onClose,
  windowed = false,
}: SettingsLayoutProps) {
  const [pageId, setPageId] = useState(initialPage);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0];
  const results = needle ? searchGroups(pages, needle) : undefined;
  const shown = results ?? page.groups.map((group) => ({ page, group, rows: group.rows }));
  const navPages = results ? pages.filter((candidate) => results.some((result) => result.page === candidate)) : pages;

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [pageId, needle]);

  return (
    <div
      className={cn(styles.layout, windowed && styles.windowed)}
      onKeyDown={(event) => {
        if (event.key === '/' && !isEditable(event.target)) {
          event.preventDefault();
          searchRef.current?.focus();
        }
      }}
    >
      <nav className={styles.nav} aria-label="Settings sections">
        <label className={styles.search}>
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search"
            aria-label="Search settings"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.kbd} aria-hidden>
            /
          </kbd>
        </label>
        <ul className={styles.pages}>
          {navPages.map((candidate) => {
            const Icon = candidate.icon;
            const current = !results && candidate.id === page.id;
            return (
              <li key={candidate.id} className={cn(candidate.bottom && styles.bottom)}>
                <button
                  type="button"
                  className={cn(styles.pageLink, current && styles.pageLinkCurrent)}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => {
                    setQuery('');
                    setPageId(candidate.id);
                  }}
                >
                  <Icon size={15} strokeWidth={1.75} aria-hidden />
                  {candidate.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className={styles.pane}>
        <LargeDialogHeader
          className={cn(windowed && styles.windowHeader, windowed && 'drag-region')}
          title={
            <>
              <span className={styles.crumbRoot}>Settings</span>
              <span className={styles.crumbRoot} aria-hidden>
                /
              </span>
              {results ? 'Search' : page.label}
            </>
          }
          actions={actions}
          onClose={onClose}
        />
        <div ref={contentRef} className={styles.content}>
          <div className={styles.inner}>
            {notice}
            {shown.length === 0 ? <p className={styles.empty}>No settings match “{query.trim()}”</p> : null}
            {shown.map(({ page: owner, group, rows }) => (
              <section key={`${owner.id}-${group.title}`} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  {results ? <span className={styles.groupPage}>{owner.label} / </span> : null}
                  {group.title}
                </h3>
                <div className={styles.card}>
                  {rows.map((row) => (
                    <div key={row.title} className={styles.row}>
                      <div className={styles.rowText}>
                        {row.controlId ? (
                          <label htmlFor={row.controlId} className={styles.rowTitle}>
                            {row.title}
                          </label>
                        ) : (
                          <p className={styles.rowTitle}>{row.title}</p>
                        )}
                        {row.description ? <p className={styles.rowDescription}>{row.description}</p> : null}
                      </div>
                      {row.control ? <div className={styles.rowControl}>{row.control}</div> : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        {footer}
      </section>
    </div>
  );
}
