import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from '../../src/components/Alert';
import { EmptyState } from '../../src/components/EmptyState';

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
