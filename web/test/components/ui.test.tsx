import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/components/ui/Button';
import { Checkbox } from '../../src/components/ui/Checkbox';
import { Input } from '../../src/components/ui/Input';
import { Panel } from '../../src/components/ui/Panel';
import { Segmented } from '../../src/components/ui/Segmented';

describe('Button', () => {
  it('defaults to type=button and forwards refs and clicks', async () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <Button ref={ref} className="mine" variant="ghost" size="lg" onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('mine', 'ghost', 'lg');
    expect(ref.current).toBe(button);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('honours an explicit submit type', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });
});

describe('Checkbox', () => {
  it('toggles through its label and shows a hint', async () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return <Checkbox checked={checked} onCheckedChange={setChecked} label="Zip" hint="One archive" />;
    }
    render(<Harness />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    expect(screen.getByText('One archive')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Zip'));
    expect(box).toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onChange} label="Zip" disabled />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('renders adornments and forwards refs', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Field" leading={<span>L</span>} trailing={<span>T</span>} size="lg" />);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Field' }));
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders without adornments', () => {
    const { container } = render(<Input aria-label="Field" className="wrap" />);
    expect(container.firstElementChild).toHaveClass('wrap', 'md');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });
});

describe('Panel', () => {
  it('renders a div by default', () => {
    const { container } = render(<Panel>Body</Panel>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('renders a section', () => {
    const { container } = render(<Panel as="section">Body</Panel>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('renders a form that submits', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <Panel as="form" onSubmit={onSubmit}>
        <button type="submit">Send</button>
      </Panel>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe('Segmented', () => {
  it('selects options and ignores deselecting the current one', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="Mode"
        value="a"
        onValueChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
    onChange.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
