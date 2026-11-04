import { describe, expect, it } from 'vitest';

import { cn } from '../../src/lib/cn';

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, null)).toBe('');
  });
});
