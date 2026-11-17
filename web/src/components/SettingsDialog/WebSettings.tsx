import { Info, SlidersHorizontal } from 'lucide-react';

import { useAppConfig } from '../../hooks/useAppConfig';
import { useTheme } from '../../hooks/useTheme';
import { Select } from '../ui/Select';
import { SettingsLayout, SettingValue, THEME_OPTIONS } from './SettingsLayout';

export function WebSettings({ onClose }: { onClose: () => void }) {
  const config = useAppConfig();
  const { preference, setPreference } = useTheme();

  return (
    <SettingsLayout
      initialPage="general"
      onClose={onClose}
      pages={[
        {
          id: 'general',
          label: 'General',
          icon: SlidersHorizontal,
          groups: [
            {
              title: 'Appearance',
              rows: [
                {
                  title: 'Theme',
                  description: 'Follow the system or keep Song Catcher light or dark in this browser.',
                  control: (
                    <Select
                      variant="field"
                      aria-label="Theme"
                      value={preference}
                      onValueChange={setPreference}
                      options={THEME_OPTIONS}
                    />
                  ),
                },
              ],
            },
          ],
        },
        {
          id: 'about',
          label: 'About',
          icon: Info,
          bottom: true,
          groups: [
            {
              title: 'Song Catcher',
              rows: [
                {
                  title: 'Version',
                  control: <SettingValue>{config.data ? `v${config.data.version}` : '…'}</SettingValue>,
                },
                {
                  title: 'MPD',
                  description: 'Whether the server hands finished downloads to a Music Player Daemon.',
                  control: <SettingValue>{config.data ? (config.data.useMpd ? 'Linked' : 'Off') : '…'}</SettingValue>,
                },
                {
                  title: 'Server settings',
                  description:
                    'The Deezer cookie, download folders and MPD connection come from the environment of the Song Catcher server.',
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}
