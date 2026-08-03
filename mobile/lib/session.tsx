import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  request,
  type AuthTokens,
  type Caller,
  type Role,
  type RequestOptions,
} from './api';

/**
 * Session state and the authenticated request path.
 *
 * ── Why SecureStore and not AsyncStorage ──
 * A refresh token is a 30-day credential. AsyncStorage is plain, unencrypted
 * files readable by anything with access to the app sandbox (and trivially
 * on a rooted device). SecureStore puts it in the Android Keystore. The
 * difference matters here because this credential can fund escrow.
 *
 * ── Why the role is fetched, not decoded ──
 * The access token carries only `sub`. The backend re-reads role and party
 * from the database on every request, so a role change or suspension takes
 * effect immediately rather than lingering until the token expires. This
 * app therefore ASKS (`GET /v1/auth/me`) instead of decoding a claim that
 * deliberately is not there.
 *
 * ── The role gates rendering, never authority ──
 * Everything below decides which tabs to draw. It is not access control:
 * the server authorises every request independently (NFR-1), and a tampered
 * client changes the menu and nothing else.
 */

const ACCESS_KEY = 'hfr.accessToken';
const REFRESH_KEY = 'hfr.refreshToken';

interface SessionValue {
  caller: Caller | null;
  role: Role | null;
  loading: boolean;
  signIn(primaryPhone: string, password: string): Promise<void>;
  register(input: {
    displayName: string;
    primaryPhone: string;
    password: string;
    role: 'tenant' | 'lister';
  }): Promise<void>;
  signOut(): Promise<void>;
  /** An authenticated call that refreshes and retries once on a 401. */
  authed<T>(path: string, options?: Omit<RequestOptions, 'token'>): Promise<T>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [caller, setCaller] = useState<Caller | null>(null);
  const [loading, setLoading] = useState(true);
  const accessToken = useRef<string | null>(null);
  const refreshToken = useRef<string | null>(null);
  /** Collapses concurrent 401s into ONE refresh — see `refreshOnce`. */
  const inFlightRefresh = useRef<Promise<boolean> | null>(null);

  const persist = useCallback(async (tokens: AuthTokens) => {
    accessToken.current = tokens.accessToken;
    refreshToken.current = tokens.refreshToken;
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    ]);
  }, []);

  const clear = useCallback(async () => {
    accessToken.current = null;
    refreshToken.current = null;
    setCaller(null);
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  }, []);

  /**
   * Refresh tokens are ROTATED server-side: each one works exactly once.
   * If several requests 401 at the same moment and each refreshed, the
   * first would rotate the token and the rest would present a spent one —
   * which the server treats as a compromised session and revokes. So all
   * callers await a single in-flight refresh.
   */
  const refreshOnce = useCallback(async (): Promise<boolean> => {
    if (inFlightRefresh.current) return inFlightRefresh.current;
    if (!refreshToken.current) return false;

    const attempt = (async () => {
      try {
        const tokens = await request<AuthTokens>('/v1/auth/refresh', {
          method: 'POST',
          body: { refreshToken: refreshToken.current },
        });
        await persist(tokens);
        return true;
      } catch {
        await clear();
        return false;
      } finally {
        inFlightRefresh.current = null;
      }
    })();

    inFlightRefresh.current = attempt;
    return attempt;
  }, [persist, clear]);

  const authed = useCallback(
    async <T,>(
      path: string,
      options: Omit<RequestOptions, 'token'> = {},
    ): Promise<T> => {
      try {
        return await request<T>(path, {
          ...options,
          token: accessToken.current,
        });
      } catch (err) {
        // Only a 401 is retried. A 403 means the role is wrong and a new
        // token would not help; a 409 or 422 is the domain answering, and
        // retrying a money call on either would be reckless.
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        if (!(await refreshOnce())) throw err;
        return request<T>(path, { ...options, token: accessToken.current });
      }
    },
    [refreshOnce],
  );

  const loadCaller = useCallback(async () => {
    const me = await request<Caller>('/v1/auth/me', {
      token: accessToken.current,
    });
    setCaller(me);
  }, []);

  const signIn = useCallback(
    async (primaryPhone: string, password: string) => {
      const tokens = await request<AuthTokens>('/v1/auth/login', {
        method: 'POST',
        body: { primaryPhone: primaryPhone.trim(), password },
      });
      await persist(tokens);
      await loadCaller();
    },
    [persist, loadCaller],
  );

  const register = useCallback(
    async (input: {
      displayName: string;
      primaryPhone: string;
      password: string;
      role: 'tenant' | 'lister';
    }) => {
      // `foo` and `admin` are absent from this signature by design — the
      // server refuses them here too, but a client that could not even
      // express the request is a smaller surface (API Spec §3).
      await request('/v1/auth/register', {
        method: 'POST',
        body: { ...input, primaryPhone: input.primaryPhone.trim() },
      });
      await signIn(input.primaryPhone, input.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    const token = refreshToken.current;
    if (token) {
      // Revoke server-side too. Clearing the device alone would only forget
      // the credential, leaving it valid for anyone who captured it.
      try {
        await request('/v1/auth/logout', {
          method: 'POST',
          body: { refreshToken: token },
        });
      } catch {
        // A failed revoke must not strand the user in a signed-in shell.
      }
    }
    await clear();
  }, [clear]);

  // Restore a session on cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [access, refresh] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
        ]);
        accessToken.current = access;
        refreshToken.current = refresh;

        if (!access && !refresh) return;
        try {
          await loadCaller();
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            if (await refreshOnce()) await loadCaller();
          } else {
            // Offline on cold start: keep the stored tokens rather than
            // signing the user out for having no signal.
            throw err;
          }
        }
      } catch {
        // Leave `caller` null; the app shows the sign-in screen.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCaller, refreshOnce]);

  const value = useMemo<SessionValue>(
    () => ({
      caller,
      role: caller?.role ?? null,
      loading,
      signIn,
      register,
      signOut,
      authed,
    }),
    [caller, loading, signIn, register, signOut, authed],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
