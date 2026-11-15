import { describe, expect, it } from 'vitest';

import { errorMessage, isAbortError } from '../../src/lib/errors';

describe('errorMessage', () => {
  it('uses the message of an Error and the string form of anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('offline')).toBe('offline');
    expect(errorMessage(503)).toBe('503');
  });
});

describe('isAbortError', () => {
  it('recognizes only DOM abort errors', () => {
    expect(isAbortError(new DOMException('stopped', 'AbortError'))).toBe(true);
    expect(isAbortError(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(isAbortError(Object.assign(new Error('stopped'), { name: 'AbortError' }))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
