/**
 * AuthContext baseline integration tests
 *
 * 这些测试验证 AuthContext 的核心行为，作为后续重构的回归安全网。
 * 测试策略：mock Supabase client + localStorage，渲染 AuthProvider，
 * 通过消费组件读取 context 值。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useContext, type ReactNode } from 'react';
import { AuthContext } from '../AuthContextDefinition';
import type { AuthContextValue } from '../AuthContextDefinition';

// ==========================================
// Mock 模块
// vi.hoisted() 让变量在 vi.mock 工厂函数中可用（vi.mock 会被提升）
// ==========================================

const {
  mockGetSession,
  mockSignInWithPassword,
  mockSignOut,
  mockOnAuthStateChange,
  mockSupabaseClient,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignOut = vi.fn();
  const mockSetSession = vi.fn();
  const mockOnAuthStateChange = vi.fn();
  const mockGetUser = vi.fn();
  const mockExchangeCodeForSession = vi.fn();
  const mockSignUp = vi.fn();
  const mockVerifyOtp = vi.fn();
  const mockSignInWithOtp = vi.fn();

  const mockSupabaseClient = {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      setSession: mockSetSession,
      onAuthStateChange: mockOnAuthStateChange,
      getUser: mockGetUser,
      exchangeCodeForSession: mockExchangeCodeForSession,
      signUp: mockSignUp,
      verifyOtp: mockVerifyOtp,
      signInWithOtp: mockSignInWithOtp,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };

  return {
    mockGetSession,
    mockSignInWithPassword,
    mockSignOut,
    mockSetSession,
    mockOnAuthStateChange,
    mockSupabaseClient,
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: mockSupabaseClient,
  getSupabaseClient: () => mockSupabaseClient,
}));

vi.mock('../auth/analyticsSync', () => ({
  bindAnalyticsUser: vi.fn(),
  bindAnalyticsUserSync: vi.fn().mockResolvedValue(undefined),
  resetAnalyticsUser: vi.fn(),
}));

vi.mock('../auth/oauthCallback', () => ({
  getOAuthCallbackParams: vi.fn().mockReturnValue({}),
  hasOAuthCallbackParams: vi.fn().mockReturnValue(false),
  clearOAuthCallbackParams: vi.fn(),
}));

vi.mock('../auth/nativeAuthBridge', () => ({
  notifyNativeLogout: vi.fn(),
  notifyAuthConfirmed: vi.fn(),
  requestNativeAuth: vi.fn(),
  initNativeAuthBridge: vi.fn(),
  parseNativeAuthPayload: vi.fn((p: unknown) => p || {}),
  isValidJwt: vi.fn().mockReturnValue(true),
  isValidSupabaseUuid: vi.fn().mockReturnValue(true),
  isInNativeWebView: vi.fn().mockReturnValue(false),
  notifyNativeLoginSuccess: vi.fn(),
}));

vi.mock('../auth/userProfile', () => ({
  updateUserProfile: vi.fn().mockResolvedValue({ error: null }),
  syncUserProfileToStorage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../auth/habitOnboarding', () => ({
  fetchHabitOnboardingCompleted: vi.fn().mockResolvedValue(false),
}));

// AuthProvider 的静态导入 - vi.mock 在编译时被提升，
// 因此当此 import 执行时 mock 已就位
import { AuthProvider } from '../AuthContext';

// ==========================================
// 测试工具
// ==========================================

/** localStorage 模拟存储 */
let mockStorage: Record<string, string> = {};

function setupLocalStorageMock() {
  mockStorage = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => mockStorage[key] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    mockStorage[key] = value;
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete mockStorage[key];
  });
  vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
    mockStorage = {};
  });
  Object.defineProperty(Storage.prototype, 'length', {
    get: () => Object.keys(mockStorage).length,
    configurable: true,
  });
  vi.spyOn(Storage.prototype, 'key').mockImplementation((index: number) => {
    return Object.keys(mockStorage)[index] ?? null;
  });
}

/** 用于读取 AuthContext 值的消费组件 */
let capturedContext: AuthContextValue | undefined;

function AuthConsumer() {
  capturedContext = useContext(AuthContext);
  if (!capturedContext) return <div data-testid="no-context">No context</div>;
  return (
    <div data-testid="auth-state">
      <span data-testid="isLoggedIn">{String(capturedContext.isLoggedIn)}</span>
      <span data-testid="userId">{capturedContext.userId ?? 'null'}</span>
      <span data-testid="userEmail">{capturedContext.userEmail ?? 'null'}</span>
      <span data-testid="sessionToken">{capturedContext.sessionToken ?? 'null'}</span>
      <span data-testid="isSessionValidated">{String(capturedContext.isSessionValidated)}</span>
    </div>
  );
}

/** 默认 subscription mock */
const mockUnsubscribe = vi.fn();

function setupDefaultMocks() {
  // onAuthStateChange: 捕获 callback 并在下一个微任务中触发 INITIAL_SESSION
  // 模拟真实 Supabase 行为
  mockOnAuthStateChange.mockImplementation(
    (callback: (event: string, session: unknown) => void) => {
      // Supabase 会在注册后异步触发 INITIAL_SESSION
      // 使用 queueMicrotask 让调用者先完成设置
      queueMicrotask(() => {
        // 获取当前 getSession mock 的结果来决定触发什么
        void mockGetSession().then((result: { data: { session: unknown } }) => {
          if (result?.data?.session) {
            callback('SIGNED_IN', result.data.session);
          }
        });
      });
      return {
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      };
    },
  );

  // getSession: 默认没有 session
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });

  // signOut: 默认成功
  mockSignOut.mockResolvedValue({ error: null });
}

/** 渲染 AuthProvider 的 wrapper */
function renderWithAuth(children?: ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        {children ?? <AuthConsumer />}
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ==========================================
// 测试用例
// ==========================================

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    capturedContext = undefined;
    setupLocalStorageMock();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('loginWithEmail', () => {
    it('successful login sets isLoggedIn=true, userId, userEmail, sessionToken in state', async () => {
      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: { full_name: 'Test User' },
        },
      };

      mockSignInWithPassword.mockResolvedValue({
        data: { session: mockSession, user: mockSession.user },
        error: null,
      });

      renderWithAuth();

      // 等待初始 restoreSession 完成
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // 执行登录
      await act(async () => {
        const result = await capturedContext!.loginWithEmail('test@example.com', 'password123');
        expect(result.error).toBeNull();
      });

      // 验证状态
      expect(screen.getByTestId('isLoggedIn').textContent).toBe('true');
      expect(screen.getByTestId('userId').textContent).toBe('user-123');
      expect(screen.getByTestId('userEmail').textContent).toBe('test@example.com');
      expect(screen.getByTestId('sessionToken').textContent).toBe('test-access-token');

      // 验证 localStorage 被正确写入
      expect(mockStorage['session_token']).toBe('test-access-token');
      expect(mockStorage['refresh_token']).toBe('test-refresh-token');
      expect(mockStorage['user_id']).toBe('user-123');
      expect(mockStorage['user_email']).toBe('test@example.com');
    });
  });

  describe('logout', () => {
    it('logout resets state to logged-out defaults', async () => {
      // 先设置已登录状态到 localStorage
      mockStorage['session_token'] = 'existing-token';
      mockStorage['refresh_token'] = 'existing-refresh';
      mockStorage['user_id'] = 'user-123';
      mockStorage['user_email'] = 'test@example.com';
      mockStorage['user_name'] = 'Test User';

      // Mock getSession 返回有效 session（restoreSession 需要）
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'existing-token',
            refresh_token: 'existing-refresh',
            user: {
              id: 'user-123',
              email: 'test@example.com',
              user_metadata: { full_name: 'Test User' },
            },
          },
        },
        error: null,
      });

      // Mock fetch for device cleanup
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;

      renderWithAuth();

      // 等待 restoreSession 完成
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // 确认已经是登录状态
      await waitFor(() => {
        expect(screen.getByTestId('isLoggedIn').textContent).toBe('true');
      });

      // 执行登出
      await act(async () => {
        await capturedContext!.logout();
      });

      // 验证状态重置
      expect(screen.getByTestId('isLoggedIn').textContent).toBe('false');
      expect(screen.getByTestId('userId').textContent).toBe('null');
      expect(screen.getByTestId('userEmail').textContent).toBe('null');
      expect(screen.getByTestId('sessionToken').textContent).toBe('null');

      // 验证 localStorage 被清除
      expect(mockStorage['session_token']).toBeUndefined();
      expect(mockStorage['user_id']).toBeUndefined();
      expect(mockStorage['user_email']).toBeUndefined();

      globalThis.fetch = originalFetch;
    });
  });

  describe('restoreSession', () => {
    it('with valid stored session, restores logged-in state', async () => {
      // 预填 localStorage
      mockStorage['session_token'] = 'stored-access-token';
      mockStorage['refresh_token'] = 'stored-refresh-token';
      mockStorage['user_id'] = 'user-456';
      mockStorage['user_email'] = 'stored@example.com';
      mockStorage['user_name'] = 'Stored User';

      // Supabase 验证成功
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'stored-access-token',
            refresh_token: 'stored-refresh-token',
            user: {
              id: 'user-456',
              email: 'stored@example.com',
              user_metadata: { full_name: 'Stored User' },
            },
          },
        },
        error: null,
      });

      renderWithAuth();

      // 等待 restoreSession + onAuthStateChange 的异步查询完成
      // restoreSession 触发 validateSessionWithSupabase → persistSessionToStorage
      // 同时 onAuthStateChange 的 SIGNED_IN 事件处理也会启动异步查询
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // 等待所有微任务（包括 onAuthStateChange 中的异步 IIFE）完成
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('isLoggedIn').textContent).toBe('true');
        expect(screen.getByTestId('isSessionValidated').textContent).toBe('true');
      });

      expect(screen.getByTestId('userId').textContent).toBe('user-456');
      expect(screen.getByTestId('userEmail').textContent).toBe('stored@example.com');
    });

    it('with no stored session, stays logged-out', async () => {
      // localStorage 为空，Supabase 也没有 session
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      renderWithAuth();

      // 等待 restoreSession 完成
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('isSessionValidated').textContent).toBe('true');
      });

      expect(screen.getByTestId('isLoggedIn').textContent).toBe('false');
      expect(screen.getByTestId('userId').textContent).toBe('null');
    });
  });

  describe('storage event (cross-tab sync)', () => {
    it('storage event from another tab triggers state sync', async () => {
      // 初始：没有 session
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      renderWithAuth();

      // 等待初始 restoreSession
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // 确认初始状态为未登录
      await waitFor(() => {
        expect(screen.getByTestId('isLoggedIn').textContent).toBe('false');
      });

      // 模拟另一个 tab 登录后 Supabase 验证返回有效 session
      mockStorage['session_token'] = 'new-tab-token';
      mockStorage['refresh_token'] = 'new-tab-refresh';
      mockStorage['user_id'] = 'user-789';
      mockStorage['user_email'] = 'newtab@example.com';

      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'new-tab-token',
            refresh_token: 'new-tab-refresh',
            user: {
              id: 'user-789',
              email: 'newtab@example.com',
              user_metadata: {},
            },
          },
        },
        error: null,
      });

      // 触发 storage 事件
      await act(async () => {
        const storageEvent = new StorageEvent('storage', {
          key: 'session_token',
          newValue: 'new-tab-token',
          oldValue: null,
        });
        window.dispatchEvent(storageEvent);
        await vi.advanceTimersByTimeAsync(5000);
      });

      // 验证状态被更新
      await waitFor(() => {
        expect(screen.getByTestId('isLoggedIn').textContent).toBe('true');
      });
      expect(screen.getByTestId('userId').textContent).toBe('user-789');
      expect(screen.getByTestId('userEmail').textContent).toBe('newtab@example.com');
    });
  });
});
