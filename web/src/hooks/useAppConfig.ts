import { useQuery } from '@tanstack/react-query';

import { getConfig, getHealth } from '../api/client';

export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 10_000,
  });
}
