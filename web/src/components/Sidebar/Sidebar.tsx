import { Menu } from '@base-ui/react/menu';
import { Tooltip } from '@base-ui/react/tooltip';
import {
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  CircleArrowUp,
  FolderOpen,
  ListFilter,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import type { QueueTask, TaskSource, TaskState } from '@song-catcher/shared';

import { useQueue } from '../../hooks/useQueue';
import { cn } from '../../lib/cn';
import { desktopApp } from '../../lib/desktop';
import { QueueItem } from '../QueueItem';
import { SettingsDialog } from '../SettingsDialog';
import { SOURCE_NAMES } from '../SourceLogo';
import { SourcePicker } from '../SourcePicker';

import styles from './Sidebar.module.css';

type SourceFilter = 'all' | TaskSource;

const STATE_ORDER: Record<TaskState, number> = { active: 0, waiting: 1, failed: 2, 'mission accomplished': 3 };

function matches(task: QueueTask, source: SourceFilter, needle: string): boolean {
  return (
    (source === 'all' || task.source === source) &&
    `${task.title} ${task.subtitle ?? ''}`.toLowerCase().includes(needle)
  );
}

function SourceFilterMenu({
  value,
  onValueChange,
}: {
  value: SourceFilter;
  onValueChange: (value: SourceFilter) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(styles.iconButton, value !== 'all' && styles.iconButtonOn)}
        aria-label="Filter downloads"
        title="Filter downloads"
      >
        <ListFilter size={14} strokeWidth={1.75} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className={styles.menuPositioner}>
          <Menu.Popup className={styles.menu}>
            <Menu.RadioGroup
              value={value}
              onValueChange={(next: SourceFilter) => {
                onValueChange(next);
              }}
            >
              {(['all', 'youtube', 'deezer'] satisfies SourceFilter[]).map((option) => (
                <Menu.RadioItem key={option} value={option} className={styles.menuItem}>
                  {option === 'all' ? 'All sources' : SOURCE_NAMES[option]}
                  <Menu.RadioItemIndicator>
                    <Check size={12} aria-hidden />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const { tasks, error } = useQueue();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const visible = tasks.filter((task) => matches(task, source, needle));
  const pending = visible
    .filter((task) => task.state !== 'mission accomplished')
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.id - b.id);
  const completed = visible.filter((task) => task.state === 'mission accomplished').reverse();
  const filtered = needle !== '' || source !== 'all';

  return (
    <aside className={styles.sidebar}>
      <div className={cn(styles.brand, 'drag-region')}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={onCollapse}
        >
          <PanelLeft size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <p className={styles.wordmark}>
          <strong>Song</strong> Catcher
        </p>
      </div>

      <div className={styles.tools}>
        <label className={styles.search}>
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search"
            aria-label="Search downloads"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <SourceFilterMenu value={source} onValueChange={setSource} />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="New download"
          title="New download"
          onClick={() => {
            setPickerOpen(true);
          }}
        >
          <SquarePen size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <Tooltip.Provider delay={250}>
        <div className={styles.queue}>
          {error ? <p className={styles.notice}>Could not load the queue: {error}</p> : null}
          {pending.length > 0 ? (
            <ul className={styles.list} aria-label="Downloads">
              {pending.map((task) => (
                <QueueItem key={task.id} task={task} />
              ))}
            </ul>
          ) : (
            <p className={styles.notice}>{filtered ? 'Nothing matches' : 'No downloads in progress'}</p>
          )}
        </div>

        <button
          type="button"
          className={styles.completedToggle}
          aria-expanded={completedOpen}
          onClick={() => {
            setCompletedOpen((open) => !open);
          }}
        >
          Completed
          <span className={styles.completedCount}>
            {completed.length}
            <ChevronRight size={11} strokeWidth={2} aria-hidden className={styles.chevron} />
          </span>
        </button>
        {completedOpen ? (
          <div className={cn(styles.queue, styles.completedQueue)}>
            {completed.length > 0 ? (
              <ul className={styles.list} aria-label="Completed downloads">
                {completed.map((task) => (
                  <QueueItem key={task.id} task={task} />
                ))}
              </ul>
            ) : (
              <p className={styles.notice}>{filtered ? 'Nothing matches' : 'Nothing completed yet'}</p>
            )}
          </div>
        ) : null}
      </Tooltip.Provider>

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Settings"
            title="Settings"
            onClick={() => {
              const desktop = desktopApp();
              if (desktop) {
                desktop.openSettings();
              } else {
                setSettingsOpen(true);
              }
            }}
          >
            <Settings size={14} strokeWidth={1.75} aria-hidden />
          </button>
          <NavLink
            to="/debug"
            className={({ isActive }) => cn(styles.iconButton, isActive && styles.iconButtonOn)}
            aria-label="Logs"
            title="Logs"
          >
            <ChartNoAxesColumn size={14} strokeWidth={1.75} aria-hidden />
          </NavLink>
          <NavLink
            to="/files"
            className={({ isActive }) => cn(styles.iconButton, isActive && styles.iconButtonOn)}
            aria-label="Library"
            title="Library"
          >
            <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
          </NavLink>
        </div>
        <span className={styles.update} aria-hidden>
          <CircleArrowUp size={14} strokeWidth={1.75} />
        </span>
      </div>

      <SourcePicker open={pickerOpen} onOpenChange={setPickerOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
