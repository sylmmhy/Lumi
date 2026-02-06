/**
 * auth/sessionLock.ts 单元测试
 *
 * 验证 setSession 互斥锁、防抖和网络错误判断的正确性。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canExecuteSetSession,
  acquireSetSessionLock,
  releaseSetSessionLock,
  isNetworkError,
  GLOBAL_SET_SESSION_DEBOUNCE_MS,
  _resetForTesting,
} from '../sessionLock';

describe('auth/sessionLock', () => {
  beforeEach(() => {
    _resetForTesting();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------
  // acquireSetSessionLock / releaseSetSessionLock
  // ------------------------------------------

  describe('acquireSetSessionLock', () => {
    it('returns true from canExecuteSetSession when lock is free', () => {
      expect(canExecuteSetSession('test')).toBe(true);
    });

    it('acquireSetSessionLock makes canExecuteSetSession return false', () => {
      acquireSetSessionLock('test');
      expect(canExecuteSetSession('test')).toBe(false);
    });
  });

  describe('releaseSetSessionLock', () => {
    it('frees the lock so canExecuteSetSession needs only debounce to expire', () => {
      acquireSetSessionLock('test');
      releaseSetSessionLock('test');

      // 锁已释放但防抖窗口内仍返回 false
      expect(canExecuteSetSession('test')).toBe(false);
    });
  });

  // ------------------------------------------
  // canExecuteSetSession 防抖
  // ------------------------------------------

  describe('canExecuteSetSession debounce', () => {
    it('returns false within GLOBAL_SET_SESSION_DEBOUNCE_MS window', () => {
      acquireSetSessionLock('first');
      releaseSetSessionLock('first');

      // 防抖窗口内
      expect(canExecuteSetSession('second')).toBe(false);
    });

    it('returns true after debounce window expires', () => {
      const originalNow = Date.now;

      // 获取并释放锁
      acquireSetSessionLock('first');
      releaseSetSessionLock('first');

      // 模拟时间跳过防抖窗口
      const lockTime = Date.now();
      Date.now = () => lockTime + GLOBAL_SET_SESSION_DEBOUNCE_MS + 1;

      expect(canExecuteSetSession('second')).toBe(true);

      Date.now = originalNow;
    });
  });

  // ------------------------------------------
  // isNetworkError
  // ------------------------------------------

  describe('isNetworkError', () => {
    it('returns true for TypeError("Failed to fetch")', () => {
      expect(isNetworkError({ message: 'Failed to fetch' })).toBe(true);
    });

    it('returns true for "NetworkError" message', () => {
      expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    });

    it('returns true for timeout error', () => {
      expect(isNetworkError({ message: 'Request timeout' })).toBe(true);
    });

    it('returns true for connection error code', () => {
      expect(isNetworkError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('returns false for regular Error', () => {
      expect(isNetworkError({ message: 'Invalid credentials' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isNetworkError(null)).toBe(false);
    });

    it('returns false for error without network keywords', () => {
      expect(isNetworkError({ message: 'refresh_token_already_used' })).toBe(false);
    });
  });
});
