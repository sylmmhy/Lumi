import { useCallback, useContext } from 'react';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { AuthContext, type AuthState } from '../context/AuthContextDefinition';

export type { AuthState };

/**
 * 用户认证状态 Hook
 * 
 * 职责：
 * - 检查用户登录状态
 * - 处理"已完成新手引导但未登录"的情况
 * - 提供登录跳转功能
 */
export interface UseAuthOptions {
  /** 是否在未登录且已完成引导时重定向到登录页 */
  requireLoginAfterOnboarding?: boolean;
  /** 重定向目标路径 */
  redirectPath?: string;
}

export function useAuth(options: UseAuthOptions = {}) {
  const {
    requireLoginAfterOnboarding = true,
    redirectPath = DEFAULT_APP_PATH,
  } = options;

  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  /**
   * 检查是否需要重定向到登录页（不触发额外状态更新）
   * 场景：用户已完成过新手引导，但现在未登录
   */
  const checkOnboardingLoginRequirement = useCallback(() => {
    if (!requireLoginAfterOnboarding) return false;

    const hasCompletedOnboarding = localStorage.getItem('has_completed_onboarding') === 'true';
    const isLoggedIn = context.isLoggedIn;

    if (hasCompletedOnboarding && !isLoggedIn) {
      if (import.meta.env.DEV) {
        console.log('🔒 用户已完成引导但未登录 - 重定向到登录页');
      }
      context.navigateToLogin(redirectPath);
      return true;
    }

    return false;
  }, [requireLoginAfterOnboarding, redirectPath, context]);

  /**
   * 跳转到登录页
   */
  const navigateToLogin = useCallback((customRedirect?: string) => {
    const finalRedirect = customRedirect || redirectPath;
    context.navigateToLogin(finalRedirect);
  }, [context, redirectPath]);

  return {
    ...context,
    checkOnboardingLoginRequirement,
    navigateToLogin,
  };
}
