import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useAppConfig } from '../../src/hooks/useAppConfig';
import { createQueryClient, mockFetch } from '../utils';

describe('useAppConfig', () => {
  it('loads the config once', async () => {
    const fetchMock = mockFetch({ 'GET /config': { version: '1.2.3', useMpd: true, urlPrefix: '' } });
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAppConfig(), { wrapper });
    await waitFor(() => {
      expect(result.current.data?.version).toBe('1.2.3');
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
