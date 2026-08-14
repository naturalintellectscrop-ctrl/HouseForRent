import { useCallback, useEffect, useState } from 'react';
import { ApiError, OfflineError, request } from './api';
import { useSession } from './session';

export interface AsyncState<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  loading: boolean;
  refreshing: boolean;
  reload(): void;
  refresh(): void;
}

export function describeError(err: unknown): { message: string; code?: string } {
  if (err instanceof OfflineError) return { message: err.message };
  if (err instanceof ApiError) return { message: err.message, code: err.code };
  return { message: 'Something went wrong. Pull down to try again.' };
}

/**
 * A minimal fetch-on-focus hook.
 *
 * ── Why not a data library ──
 * React Query and friends are excellent and would add a dependency, a cache
 * layer and a bundle cost to what this app actually does: fetch a list,
 * fetch a detail, POST an intent. NFR-5 makes that cost real on a mid-range
 * Android. `reload` and `refresh` differ only in whether the screen shows a
 * blocking spinner or a pull-to-refresh one — which is the entire
 * state-management need here.
 */
export function useAuthedRequest<T>(
  path: string | null,
  deps: unknown[] = [],
): AsyncState<T> {
  const { authed } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AsyncState<T>['error']>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      if (!path) return;
      mode === 'load' ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        setData(await authed<T>(path));
      } catch (err) {
        setError(describeError(err));
      } finally {
        mode === 'load' ? setLoading(false) : setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authed, path, ...deps],
  );

  useEffect(() => {
    void run('load');
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => void run('load'),
    refresh: () => void run('refresh'),
  };
}

/** The same, for endpoints that need no session (the public feed). */
export function usePublicRequest<T>(
  path: string,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AsyncState<T>['error']>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      mode === 'load' ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        setData(await request<T>(path));
      } catch (err) {
        setError(describeError(err));
      } finally {
        mode === 'load' ? setLoading(false) : setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  );

  useEffect(() => {
    void run('load');
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => void run('load'),
    refresh: () => void run('refresh'),
  };
}
