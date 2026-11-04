import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeSwitch } from '../../src/components/ThemeSwitch';

describe('ThemeSwitch', () => {
  it('switches and persists the theme, ignoring deselection', async () => {
    render(<ThemeSwitch />);
    const auto = screen.getByRole('button', { name: 'Auto theme' });
    expect(auto).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(window.localStorage.getItem('dd-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(window.localStorage.getItem('dd-theme')).toBe('dark');
  });
});
