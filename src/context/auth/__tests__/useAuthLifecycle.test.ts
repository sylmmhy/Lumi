/**
 * auth/useAuthLifecycle.ts 单元测试
 *
 * 验证认证生命周期 Hook 的核心行为：
 * - restoreSession 初始化
 * - onAuthStateChange 订阅（SIGNED_IN / SIGNED_OUT）
 * - triggerSessionCheckNow 会话修复
 * - storage 跨标签页同步
 * - Native Login 事件处理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// AuthState type derived from LOGGED_OUT constant inside vi.hoisted()

// ==========================================
// Mock 模块
// ==========================================

const {
  mockGetSession,
  mockSetSession,
  mockOnAuthStateChange,
  mockSupabaseClient,
  mockValidateSession,
  mockSyncAfterLogin,
  mockFetchHabit,
  mockParseNativeAuth,
  mockInitNativeBridge,
  mockHasOAuthParams,
  mockReadAuthFromStorage,
  LOGGED_OUT,
} = vi.hoisted(() => {
  const LOGGED_OUT: {
    isLoggedIn: boolean;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
    userPicture: string | null;
    isNewUser: boolean;
    sessionToken: string | null;
    refreshToken: string | null;
    isNativeLogin: boolean;
    isSessionValidated: boolean;
    hasCompletedHabitOnboarding: boolean;
  } = {
    isLoggedIn: false,
    userId: null,
    userEmail: null,
    userName: null,
    userPicture: null,
    isNewUser: false,
    sessionToken: null,
    refreshToken: null,
    isNativeLogin: false,
    isSessionValidated: true,
    hasCompletedHabitOnboarding: false,
  };

  const mockGetSession = vi.fn();
  const mockSetSession = vi.fn();
  const mockOnAuthStateChange = vi.fn();

  const mockSupabaseClient = {
    auth: {
      getSession: mockGetSession,
      setSession: mockSetSession,
      onAuthStateChange: mockOnAuthStateChange,
      getUser: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOtp: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };

  const mockValidateSession = vi.fn();
  const mockSyncAfterLogin = vi.fn();
  const mockFetchHabit = vi.fn();
  const mockParseNativeAuth = vi.fn((p: unknown) => p || {});
  const mockInitNativeBridge = vi.fn();
  const mockHasOAuthParams = vi.fn().mockReturnValue(false);
  const mockReadAuthFromStorage = vi.fn();

  return {
    LOGGED_OUT,
    mockGetSession,
    mockSetSession,
    mockOnAuthStateChange,
    mockSupabaseClient,
    mockValidateSession,
    mockSyncAfterLogin,
    mockFetchHabit,
    mockParseNativeAuth,
    mockInitNativeBridge,
    mockHasOAuthParams,
    mockReadAuthFromStorage,
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: mockSupabaseClient,
  getSupabaseClient: () => mockSupabaseClient,
}));

vi.mock('../sessionValidation', () => ({
  validateSessionWithSupabase: mockValidateSession,
}));

vi.mock('../postLoginSync', () => ({
  syncAfterLogin: mockSyncAfterLogin,
}));

vi.mock('../analyticsSync', () => ({
  bindAnalyticsUser: vi.fn(),
  bindAnalyticsUserSync: vi.fn().mockResolvedValue(undefined),
  resetAnalyticsUser: vi.fn(),
}));

vi.mock('../oauthCallback', () => ({
  getOAuthCallbackParams: vi.fn().mockReturnValue({}),
  hasOAuthCallbackParams: mockHasOAuthParams,
  clearOAuthCallbackParams: vi.fn(),
}));

vi.mock('../nativeAuthBridge', () => ({
  notifyNativeLogout: vi.fn(),
  notifyAuthConfirmed: vi.fn(),
  requestNativeAuth: vi.fn(),
  initNativeAuthBridge: mockInitNativeBridge,
  parseNativeAuthPayload: mockParseNativeAuth,
  isValidJwt: vi.fn().mockReturnValue(true),
  isValidSupabaseUuid: vi.fn().mockReturnValue(true),
  isInNativeWebView: vi.fn().mockReturnValue(false),
  notifyNativeLoginSuccess: vi.fn(),
}));

vi.mock('../userProfile', () => ({
  updateUserProfile: vi.fn().mockResolvedValue({ error: null }),
  syncUserProfileToStorage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../habitOnboarding', () => ({
  fetchHabitOnboardingCompleted: mockFetchHabit,
}));

vi.mock('../storage', () => ({
  NATIVE_LOGIN_FLAG_KEY: 'native_login_flag',
  LOGGED_OUT_STATE: {
    isLoggedIn: false,
    userId: null,
    userEmail: null,
    userName: null,
    userPicture: null,
    isNewUser: false,
    sessionToken: null,
    refreshToken: null,
    isNativeLogin: false,
    isSessionValidated: true,
    hasCompletedHabitOnboarding: false,
  },
  readAuthFromStorage: mockReadAuthFromStorage,
  persistSessionToStorage: vi.fn(),
  clearAuthStorage: vi.fn(),
}));

vi.mock('../sessionLock', () => ({
  canExecuteSetSession: vi.fn().mockReturnValue(true),
  acquireSetSessionLock: vi.fn(),
  releaseSetSessionLock: vi.fn(),
  isNetworkError: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../constants/routes', () => ({
  DEFAULT_APP_PATH: '/app',
}));

import { useAuthLifecycle, type UseAuthLifecycleParams } from '../useAuthLifecycle';
import { resetAnalyticsUser } from '../analyticsSync';
import { clearAuthStorage } from '../storage';

type AuthStateLike = typeof LOGGED_OUT;

// ==========================================
// 测试工具
// ==========================================

let mockStorage: Record<string, string> = {};

function setupLocalStorageMock() {
  mockStorage = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => mockStorage[key] ?? null,
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => { mockStorage[key] = value; },
  );
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
    (key: string) => { delete mockStorage[key]; },
  );
}

const mockUnsubscribe = vi.fn();

function createParams(overrides?: Partial<UseAuthLifecycleParams>): UseAuthLifecycleParams {
  return {
    setAuthState: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
    loginPath: '/login/mobile',
    defaultRedirectPath: '/app',
    ...overrides,
  };
}

// ==========================================
// 测试用例
// ==========================================

describe('useAuthLifecycle', () => {
  let onAuthCallback: ((event: string, session: unknown) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setupLocalStorageMock();
    onAuthCallback = null;

    // Defaults
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockValidateSession.mockResolvedValue({ ...LOGGED_OUT });
    mockFetchHabit.mockResolvedValue(false);
    mockHasOAuthParams.mockReturnValue(false);
    mockReadAuthFromStorage.mockReturnValue({ ...LOGGED_OUT });

    // Capture onAuthStateChange callback
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        onAuthCallback = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ------------------------------------------
  // 1. restoreSession on mount
  // ------------------------------------------

  it('calls restoreSession on mount and sets auth state from stored session', async () => {
    const validatedState: AuthStateLike = {
      isLoggedIn: true,
      userId: 'user-123',
      userEmail: 'test@example.com',
      userName: 'Test',
      userPicture: null,
      isNewUser: false,
      sessionToken: 'at-123',
      refreshToken: 'rt-456',
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: false,
    };
    mockValidateSession.mockResolvedValue(validatedState);

    const params = createParams();
    renderHook(() => useAuthLifecycle(params));

    // restoreSession runs via setTimeout(0) fallback (jsdom has no requestIdleCallback)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockValidateSession).toHaveBeenCalled();

    // setAuthState should have been called (functional update for restoreSession)
    const setAuthState = params.setAuthState as ReturnType<typeof vi.fn>;
    expect(setAuthState).toHaveBeenCalled();

    // One of the calls should resolve to the validated state
    const resolvedStates = setAuthState.mock.calls.map((call: unknown[]) => {
      if (typeof call[0] === 'function') {
        return (call[0] as (prev: AuthStateLike) => AuthStateLike)({ ...LOGGED_OUT });
      }
      return call[0];
    });

    const hasValidState = resolvedStates.some(
      (s) => {
        const state = s as AuthStateLike;
        return state?.isLoggedIn === true && state?.userId === 'user-123';
      },
    );
    expect(hasValidState).toBe(true);
  });

  // ------------------------------------------
  // 2. onAuthStateChange → SIGNED_IN
  // ------------------------------------------

  it('subscribes to onAuthStateChange and handles SIGNED_IN event', async () => {
    const params = createParams();
    renderHook(() => useAuthLifecycle(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOnAuthStateChange).toHaveBeenCalled();
    expect(onAuthCallback).not.toBeNull();

    // Simulate SIGNED_IN event
    const mockSession = {
      access_token: 'new-at',
      refresh_token: 'new-rt',
      user: {
        id: 'user-signed-in',
        email: 'signed-in@example.com',
        user_metadata: { full_name: 'Signed In User' },
      },
    };
    mockSyncAfterLogin.mockResolvedValue({
      userName: 'Signed In User',
      userPicture: null,
      hasCompletedHabitOnboarding: true,
    });

    await act(async () => {
      onAuthCallback!('SIGNED_IN', mockSession);
      await vi.advanceTimersByTimeAsync(2000);
    });

    const setAuthState = params.setAuthState as ReturnType<typeof vi.fn>;
    const calls = setAuthState.mock.calls;

    // The SIGNED_IN handler calls setAuthState twice (once immediate, once after async query)
    // Check that at least one functional update sets isLoggedIn=true with correct userId
    const hasLoggedInCall = calls.some((call: unknown[]) => {
      if (typeof call[0] === 'function') {
        const result = (call[0] as (prev: AuthStateLike) => AuthStateLike)({ ...LOGGED_OUT });
        return result.isLoggedIn === true && result.userId === 'user-signed-in';
      }
      return false;
    });
    expect(hasLoggedInCall).toBe(true);
  });

  // ------------------------------------------
  // 3. onAuthStateChange → SIGNED_OUT
  // ------------------------------------------

  it('subscribes to onAuthStateChange and handles SIGNED_OUT event', async () => {
    const params = createParams();
    renderHook(() => useAuthLifecycle(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onAuthCallback).not.toBeNull();

    await act(async () => {
      onAuthCallback!('SIGNED_OUT', null);
    });

    const setAuthState = params.setAuthState as ReturnType<typeof vi.fn>;
    // The SIGNED_OUT handler calls setAuthState with { ...LOGGED_OUT_STATE }
    const lastCall = setAuthState.mock.calls[setAuthState.mock.calls.length - 1];
    expect(lastCall[0]).toEqual(expect.objectContaining({ isLoggedIn: false, userId: null }));

    expect(clearAuthStorage).toHaveBeenCalled();
    expect(resetAnalyticsUser).toHaveBeenCalled();
  });

  // ------------------------------------------
  // 4. triggerSessionCheckNow
  // ------------------------------------------

  it('triggerSessionCheckNow validates and refreshes session', async () => {
    mockStorage['session_token'] = 'stored-at';
    mockStorage['refresh_token'] = 'stored-rt';
    mockStorage['user_id'] = 'user-check';
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'refreshed-at',
          refresh_token: 'refreshed-rt',
          user: { id: 'user-check', email: 'check@test.com' },
        },
      },
      error: null,
    });

    const params = createParams();
    const { result } = renderHook(() => useAuthLifecycle(params));

    // Let mount effects + initial delay run, then wait for debounce window to pass
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    // Re-set localStorage (initial effects may have overwritten with refreshed tokens)
    mockStorage['session_token'] = 'manual-at';
    mockStorage['refresh_token'] = 'manual-rt';
    mockStorage['user_id'] = 'user-check';

    // Reset the mock to isolate the manual call
    mockSetSession.mockClear();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'recovered-at',
          refresh_token: 'recovered-rt',
          user: { id: 'user-check', email: 'check@test.com' },
        },
      },
      error: null,
    });

    await act(async () => {
      await result.current.triggerSessionCheckNow('test_reason');
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'manual-at',
      refresh_token: 'manual-rt',
    });
  });

  // ------------------------------------------
  // 5. storage event (cross-tab sync)
  // ------------------------------------------

  it('storage event from another tab triggers state update', async () => {
    const params = createParams();
    renderHook(() => useAuthLifecycle(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const newTabState: AuthStateLike = {
      isLoggedIn: true,
      userId: 'user-other-tab',
      userEmail: 'other@tab.com',
      userName: null,
      userPicture: null,
      isNewUser: false,
      sessionToken: 'other-tab-at',
      refreshToken: 'other-tab-rt',
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: false,
    };
    mockValidateSession.mockResolvedValue(newTabState);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'session_token',
          newValue: 'other-tab-at',
          oldValue: null,
        }),
      );
      await vi.advanceTimersByTimeAsync(1000);
    });

    const setAuthState = params.setAuthState as ReturnType<typeof vi.fn>;
    expect(setAuthState).toHaveBeenCalledWith(newTabState);
  });

  // ------------------------------------------
  // 6. native login event
  // ------------------------------------------

  it('native login event (mindboat:nativeLogin) triggers applyNativeLogin', async () => {
    const nativePayload = {
      userId: 'native-user-1',
      email: 'native@test.com',
      accessToken: 'native-at',
      refreshToken: 'native-rt',
    };
    mockParseNativeAuth.mockReturnValue(nativePayload);
    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'native-at',
          refresh_token: 'native-rt',
          user: { id: 'native-user-1', email: 'native@test.com' },
        },
      },
      error: null,
    });

    const params = createParams();
    renderHook(() => useAuthLifecycle(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Dispatch native login CustomEvent
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('mindboat:nativeLogin', { detail: nativePayload }),
      );
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockParseNativeAuth).toHaveBeenCalledWith(nativePayload);

    const setAuthState = params.setAuthState as ReturnType<typeof vi.fn>;
    const hasNativeLoginCall = setAuthState.mock.calls.some((call: unknown[]) => {
      if (typeof call[0] === 'function') {
        const result = (call[0] as (prev: AuthStateLike) => AuthStateLike)({ ...LOGGED_OUT });
        return result.isLoggedIn === true && result.userId === 'native-user-1';
      }
      return false;
    });
    expect(hasNativeLoginCall).toBe(true);
  });
});
