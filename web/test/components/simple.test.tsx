import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from '../../src/components/Alert';
import { EmptyState } from '../../src/components/EmptyState';
import { PageHeader } from '../../src/components/PageHeader';
import { TaskStateBadge } from '../../src/components/TaskStateBadge';

describe('Alert', () => {
  it('renders an alert with extra classes', () => {
    render(<Alert className="extra">Broken</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Broken');
    expect(alert).toHaveClass('extra');
  });
});

describe('EmptyState', () => {
  it('renders the title and optional body', () => {
    const { rerender, container } = render(<EmptyState title="Empty">More info</EmptyState>);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('More info')).toBeInTheDocument();
    rerender(<EmptyState title="Empty" />);
    expect(screen.queryByText('More info')).not.toBeInTheDocument();
    expect(container.querySelector('.text')).toBeNull();
  });
});

describe('PageHeader', () => {
  it('renders all parts', () => {
    render(<PageHeader index="01" eyebrow="Eyebrow" title="Title" description="Desc" actions={<button>Act</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('Desc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
  });

  it('omits optional parts', () => {
    render(<PageHeader index="01" eyebrow="Eyebrow" title="Title" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Desc')).not.toBeInTheDocument();
  });
});

describe('TaskStateBadge', () => {
  it.each([
    ['waiting', 'Waiting'],
    ['active', 'Recording'],
    ['mission accomplished', 'Done'],
    ['failed', 'Failed'],
  ] as const)('labels %s as %s', (state, label) => {
    render(<TaskStateBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
