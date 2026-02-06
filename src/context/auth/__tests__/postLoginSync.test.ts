/**
 * auth/postLoginSync.ts 单元测试
 *
 * 验证 syncAfterLogin 统一管道的各步骤：
 * persistSessionToStorage、syncUserProfileToStorage、
 * userName/userPicture 计算、bindAnalyticsUserSync、fetchHabitOnboardingCompleted。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// Mock 模块
// ==========================================

const { mockPersistSession, mockSyncProfile, mockBindAnalytics, mockFetchHabit } = vi.hoisted(() => ({
  mockPersistSession: vi.fn(),
  mockSyncProfile: vi.fn().mockResolvedValue(undefined),
  mockBindAnalytics: vi.fn().mockResolvedValue(undefined),
  mockFetchHabit: vi.fn().mockResolvedValue(false),
}));

vi.mock('../storage', () => ({
  persistSessionToStorage: mockPersistSession,
}));

vi.mock('../userProfile', () => ({
  syncUserProfileToStorage: mockSyncProfile,
}));

vi.mock('../analyticsSync', () => ({
  bindAnalyticsUserSync: mockBindAnalytics,
}));

vi.mock('../habitOnboarding', () => ({
  fetchHabitOnboardingCompleted: mockFetchHabit,
}));

import { syncAfterLogin } from '../postLoginSync';

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
}

// ==========================================
// 工具
// ==========================================

function makeSession(overrides?: Partial<Session>): Session {
  return {
    access_token: 'at-123',
    refresh_token: 'rt-456',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Date.now() / 1000 + 3600,
    user: {
      id: 'u-1',
      email: 'alice@test.com',
      app_metadata: {},
      user_metadata: { full_name: 'Alice OAuth', avatar_url: 'https://pic/oauth' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    ...overrides,
  } as Session;
}

const mockClient = {} as SupabaseClient;

// ==========================================
// 测试用例
// ==========================================

describe('auth/postLoginSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorageMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls persistSessionToStorage with correct session', async () => {
    const session = makeSession();

    await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(mockPersistSession).toHaveBeenCalledWith(session);
  });

  it('calls syncUserProfileToStorage with client and userId', async () => {
    const session = makeSession();

    await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(mockSyncProfile).toHaveBeenCalledWith(mockClient, 'u-1');
  });

  it('returns userName from localStorage when available', async () => {
    mockStorage['user_name'] = 'LocalAlice';
    const session = makeSession();

    const result = await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(result.userName).toBe('LocalAlice');
  });

  it('falls back to user_metadata for userName when localStorage is empty', async () => {
    // localStorage has no user_name
    const session = makeSession();

    const result = await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(result.userName).toBe('Alice OAuth');
  });

  it('returns correct hasCompletedHabitOnboarding value', async () => {
    mockFetchHabit.mockResolvedValue(true);
    const session = makeSession();

    const result = await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(result.hasCompletedHabitOnboarding).toBe(true);
  });

  it('calls bindAnalyticsUserSync with userId and email', async () => {
    const session = makeSession();

    await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(mockBindAnalytics).toHaveBeenCalledWith('u-1', 'alice@test.com');
  });

  it('returns null for userName/userPicture when neither localStorage nor metadata has values', async () => {
    const session = makeSession();
    // Override user_metadata to have no name/avatar
    session.user.user_metadata = {};

    const result = await syncAfterLogin({ client: mockClient, session, userId: 'u-1', source: 'test' });

    expect(result.userName).toBeNull();
    expect(result.userPicture).toBeNull();
  });
});
