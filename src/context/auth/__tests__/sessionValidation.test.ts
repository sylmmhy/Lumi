/**
 * auth/sessionValidation.ts 单元测试
 *
 * 验证 validateSessionWithSupabase 的各条代码路径：
 * 有效 session、token 恢复、网络错误、无 session、dev bypass。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock 模块
// ==========================================

const { mockGetSession, mockSetSession, mockSupabaseClient } = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockSetSession = vi.fn();
  const mockSupabaseClient = {
    auth: {
      getSession: mockGetSession,
      setSession: mockSetSession,
    },
  };
  return { mockGetSession, mockSetSession, mockSupabaseClient };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: mockSupabaseClient,
  getSupabaseClient: () => mockSupabaseClient,
}));

const { mockFetchHabitOnboarding } = vi.hoisted(() => ({
  mockFetchHabitOnboarding: vi.fn(),
}));

vi.mock('../habitOnboarding', () => ({
  fetchHabitOnboardingCompleted: mockFetchHabitOnboarding,
}));

vi.mock('../nativeAuthBridge', () => ({
  isInNativeWebView: vi.fn().mockReturnValue(false),
  requestNativeAuth: vi.fn(),
}));

// Mock sessionLock - 默认允许执行
vi.mock('../sessionLock', () => ({
  canExecuteSetSession: vi.fn().mockReturnValue(true),
  acquireSetSessionLock: vi.fn(),
  releaseSetSessionLock: vi.fn(),
  isNetworkError: vi.fn().mockReturnValue(false),
}));

// 必须在 vi.mock 之后 import
import { validateSessionWithSupabase, DEV_TEST_USER_ID } from '../sessionValidation';
import { isNetworkError } from '../sessionLock';

// ==========================================
// localStorage mock
// ==========================================

let mockStorage: Record<string, string> = {};

function setupLocalStorageMock() {
  mockStorage = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => mockStorage[key] ?? null,
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => {
      mockStorage[key] = value;
    },
  );
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
    (key: string) => {
      delete mockStorage[key];
    },
  );
}

// ==========================================
// 测试用例
// ==========================================

describe('auth/sessionValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorageMock();
    mockFetchHabitOnboarding.mockResolvedValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valid session returns isLoggedIn=true with correct userId/email/tokens', async () => {
    const mockSession = {
      access_token: 'valid-at',
      refresh_token: 'valid-rt',
      user: {
        id: 'u-1',
        email: 'alice@test.com',
        user_metadata: { full_name: 'Alice', avatar_url: 'https://pic/a' },
      },
    };

    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const state = await validateSessionWithSupabase();

    expect(state.isLoggedIn).toBe(true);
    expect(state.userId).toBe('u-1');
    expect(state.userEmail).toBe('alice@test.com');
    expect(state.sessionToken).toBe('valid-at');
    expect(state.refreshToken).toBe('valid-rt');
    expect(state.isSessionValidated).toBe(true);
    expect(state.isNativeLogin).toBe(false);
  });

  it('expired session triggers refresh via setSession and returns refreshed state', async () => {
    // Supabase getSession returns null (session expired)
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // localStorage has tokens
    mockStorage['session_token'] = 'old-at';
    mockStorage['refresh_token'] = 'old-rt';
    mockStorage['user_id'] = 'u-2';
    mockStorage['user_email'] = 'bob@test.com';

    // setSession restores with new tokens
    const restoredSession = {
      access_token: 'new-at',
      refresh_token: 'new-rt',
      user: {
        id: 'u-2',
        email: 'bob@test.com',
        user_metadata: {},
      },
    };

    mockSetSession.mockResolvedValue({
      data: { session: restoredSession },
      error: null,
    });

    const state = await validateSessionWithSupabase();

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'old-at',
      refresh_token: 'old-rt',
    });
    expect(state.isLoggedIn).toBe(true);
    expect(state.userId).toBe('u-2');
    expect(state.sessionToken).toBe('new-at');
    expect(state.refreshToken).toBe('new-rt');
    expect(state.isSessionValidated).toBe(true);
  });

  it('network error preserves local login state with isSessionValidated=false', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockStorage['session_token'] = 'stored-at';
    mockStorage['refresh_token'] = 'stored-rt';
    mockStorage['user_id'] = 'u-3';
    mockStorage['user_email'] = 'carol@test.com';

    // setSession fails with network error on all retries
    mockSetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Failed to fetch', code: 'network_error' },
    });

    // isNetworkError should return true for this error
    vi.mocked(isNetworkError).mockReturnValue(true);

    const state = await validateSessionWithSupabase();

    expect(state.isLoggedIn).toBe(true);
    expect(state.userId).toBe('u-3');
    expect(state.sessionToken).toBe('stored-at');
    expect(state.isSessionValidated).toBe(false);
  });

  it('no session (null) returns LOGGED_OUT_STATE', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // No tokens in localStorage either
    const state = await validateSessionWithSupabase();

    expect(state.isLoggedIn).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.userEmail).toBeNull();
    expect(state.sessionToken).toBeNull();
    expect(state.isSessionValidated).toBe(true);
  });

  it('DEV_TEST_USER_ID bypass returns valid state when matching', async () => {
    if (!DEV_TEST_USER_ID) {
      // 如果不在 DEV 模式，跳过此测试
      return;
    }

    mockStorage['user_id'] = DEV_TEST_USER_ID;
    mockStorage['user_email'] = 'dev@test.com';
    mockStorage['user_name'] = 'Dev User';

    const state = await validateSessionWithSupabase();

    expect(state.isLoggedIn).toBe(true);
    expect(state.userId).toBe(DEV_TEST_USER_ID);
    expect(state.isSessionValidated).toBe(true);
    expect(state.hasCompletedHabitOnboarding).toBe(true);
    // getSession should NOT have been called (bypassed)
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
