import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { MockEventSource, setMatchMedia } from './utils';

beforeEach(() => {
  setMatchMedia({});
  vi.stubGlobal('EventSource', MockEventSource);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  MockEventSource.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
});
