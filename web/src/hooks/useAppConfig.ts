import { useQuery } from '@tanstack/react-query';

import { getConfig } from '../api/client';

export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
