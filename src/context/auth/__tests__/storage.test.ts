/**
 * auth/storage.ts 单元测试
 *
 * 验证 localStorage 读写工具函数的正确性。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LOGGED_OUT_STATE,
  NATIVE_LOGIN_FLAG_KEY,
  batchGetLocalStorage,
  readAuthFromStorage,
  persistSessionToStorage,
  clearAuthStorage,
} from '../storage';
import type { Session } from '@supabase/supabase-js';

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

describe('auth/storage', () => {
  beforeEach(() => {
    setupLocalStorageMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------
  // LOGGED_OUT_STATE
  // ------------------------------------------

  describe('LOGGED_OUT_STATE', () => {
    it('has all expected fields with correct default values', () => {
      expect(LOGGED_OUT_STATE).toEqual({
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
      });
    });
  });

  // ------------------------------------------
  // batchGetLocalStorage
  // ------------------------------------------

  describe('batchGetLocalStorage', () => {
    it('returns correct values for given keys', () => {
      mockStorage['key_a'] = 'value_a';
      mockStorage['key_b'] = 'value_b';

      const result = batchGetLocalStorage(['key_a', 'key_b', 'key_c'] as const);

      expect(result).toEqual({
        key_a: 'value_a',
        key_b: 'value_b',
        key_c: null,
      });
    });

    it('returns all null when localStorage is empty', () => {
      const result = batchGetLocalStorage(['x', 'y'] as const);
      expect(result).toEqual({ x: null, y: null });
    });
  });

  // ------------------------------------------
  // readAuthFromStorage
  // ------------------------------------------

  describe('readAuthFromStorage', () => {
    it('returns null/false values when localStorage is empty', () => {
      const state = readAuthFromStorage();

      expect(state.isLoggedIn).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.userEmail).toBeNull();
      expect(state.userName).toBeNull();
      expect(state.userPicture).toBeNull();
      expect(state.isNewUser).toBe(false);
      expect(state.sessionToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isNativeLogin).toBe(false);
      expect(state.isSessionValidated).toBe(false);
      expect(state.hasCompletedHabitOnboarding).toBe(false);
    });

    it('returns stored values when localStorage has data', () => {
      mockStorage['session_token'] = 'tok-123';
      mockStorage['refresh_token'] = 'ref-456';
      mockStorage['user_id'] = 'uid-789';
      mockStorage['user_email'] = 'a@b.com';
      mockStorage['user_name'] = 'Alice';
      mockStorage['user_picture'] = 'https://pic.example/a.jpg';
      mockStorage['is_new_user'] = 'true';

      const state = readAuthFromStorage();

      expect(state.isLoggedIn).toBe(true);
      expect(state.userId).toBe('uid-789');
      expect(state.userEmail).toBe('a@b.com');
      expect(state.userName).toBe('Alice');
      expect(state.userPicture).toBe('https://pic.example/a.jpg');
      expect(state.isNewUser).toBe(true);
      expect(state.sessionToken).toBe('tok-123');
      expect(state.refreshToken).toBe('ref-456');
      expect(state.isNativeLogin).toBe(false);
      expect(state.isSessionValidated).toBe(false);
    });

    it('sets isLoggedIn=true for native login with userId but no sessionToken', () => {
      mockStorage['user_id'] = 'uid-native';
      mockStorage[NATIVE_LOGIN_FLAG_KEY] = 'true';

      const state = readAuthFromStorage();

      expect(state.isLoggedIn).toBe(true);
      expect(state.isNativeLogin).toBe(true);
      expect(state.sessionToken).toBeNull();
    });
  });

  // ------------------------------------------
  // persistSessionToStorage
  // ------------------------------------------

  describe('persistSessionToStorage', () => {
    it('writes session token, refresh token, user_id, and user_email to correct keys', () => {
      const session = {
        access_token: 'at-abc',
        refresh_token: 'rt-def',
        user: { id: 'u-1', email: 'bob@test.com' },
      } as unknown as Session;

      persistSessionToStorage(session);

      expect(mockStorage['session_token']).toBe('at-abc');
      expect(mockStorage['refresh_token']).toBe('rt-def');
      expect(mockStorage['user_id']).toBe('u-1');
      expect(mockStorage['user_email']).toBe('bob@test.com');
    });

    it('does not write refresh_token when session has no refresh_token', () => {
      const session = {
        access_token: 'at-abc',
        refresh_token: '',
        user: { id: 'u-1', email: 'bob@test.com' },
      } as unknown as Session;

      persistSessionToStorage(session);

      expect(mockStorage['refresh_token']).toBeUndefined();
    });

    it('removes native_login flag', () => {
      mockStorage[NATIVE_LOGIN_FLAG_KEY] = 'true';

      const session = {
        access_token: 'at-abc',
        refresh_token: 'rt-def',
        user: { id: 'u-1', email: '' },
      } as unknown as Session;

      persistSessionToStorage(session);

      expect(mockStorage[NATIVE_LOGIN_FLAG_KEY]).toBeUndefined();
    });
  });

  // ------------------------------------------
  // clearAuthStorage
  // ------------------------------------------

  describe('clearAuthStorage', () => {
    it('removes auth keys from localStorage', () => {
      const keysToRemove = [
        'session_token',
        'refresh_token',
        'user_id',
        'user_email',
        'user_name',
        'user_picture',
        NATIVE_LOGIN_FLAG_KEY,
      ];

      // 预填所有 key
      for (const key of keysToRemove) {
        mockStorage[key] = 'some-value';
      }
      // 加一个无关 key，确认不会被误删
      mockStorage['unrelated_key'] = 'keep-me';

      clearAuthStorage();

      for (const key of keysToRemove) {
        expect(mockStorage[key]).toBeUndefined();
      }
      expect(mockStorage['unrelated_key']).toBe('keep-me');
    });
  });
});
