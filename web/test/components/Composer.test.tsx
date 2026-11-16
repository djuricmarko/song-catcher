import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Composer, ComposerStage } from '../../src/components/Composer';
import { Select } from '../../src/components/ui/Select';
import { ToggleChip } from '../../src/components/ui/ToggleChip';

function Harness({ onSubmit, busy = false }: { onSubmit: (value: string) => void; busy?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onValueChange={setValue}
      onSubmit={() => {
        onSubmit(value);
      }}
      busy={busy}
      placeholder="Paste a link"
      inputLabel="Link"
      submitLabel="Download"
    />
  );
}

describe('Composer', () => {
  it('submits what was typed with the button and with Enter', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Link');
    expect(input).toHaveAttribute('placeholder', 'Paste a link');

    await userEvent.type(input, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    await userEvent.type(input, 'd{Enter}');
    expect(onSubmit.mock.calls).toEqual([['abc'], ['abcd']]);
  });

  it('cannot be submitted with the button while busy', () => {
    render(<Harness onSubmit={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('puts extra controls on a second row next to the send button', () => {
    render(
      <Composer
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Search"
        inputLabel="Query"
        submitLabel="Search"
        footer={<span>controls</span>}
      />,
    );
    const footer = screen.getByText('controls').closest('.footer');
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Search' }));
  });
});

describe('ComposerStage', () => {
  it('moves its content to the top once there is something below the composer', () => {
    const { rerender, container } = render(<ComposerStage>x</ComposerStage>);
    expect(container.firstElementChild).not.toHaveClass('stageRaised');
    rerender(<ComposerStage raised>x</ComposerStage>);
    expect(container.firstElementChild).toHaveClass('stageRaised');
  });
});

describe('Select', () => {
  it('shows the current option and reports a new choice', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="Kind"
        value="a"
        onValueChange={onValueChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Kind' });
    expect(trigger).toHaveTextContent('Alpha');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});

describe('ToggleChip', () => {
  it('reports presses and reflects its state', async () => {
    function Chip() {
      const [pressed, setPressed] = useState(false);
      return <ToggleChip pressed={pressed} onPressedChange={setPressed} label="Entire playlist" title="hint" />;
    }
    render(<Chip />);
    const chip = screen.getByRole('button', { name: 'Entire playlist' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute('title', 'hint');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});
