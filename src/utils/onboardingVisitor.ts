/**
 * 访客管理工具函数
 *
 * 实现"一个设备一次免费体验"功能
 */

import { supabase } from '../lib/supabase';

const VISITOR_ID_KEY = 'firego_visitor_id';
const ONBOARDING_SESSION_ID_KEY = 'onboarding_session_id';

export interface OnboardingAccessResult {
  canStart: boolean;
  visitorId: string;
  reason: 'no_visitor' | 'trial_available' | 'trial_used';
}

export interface StartOnboardingResult {
  sessionId: string;
  onboardingSessionId: string;
  visitorId: string;
}

export interface CompleteOnboardingParams {
  visitorId: string;
  onboardingSessionId: string;
  workDurationSeconds?: number;
  chatDurationSeconds?: number;
}

/**
 * 检查访客是否可以开始体验任务
 */
export async function checkOnboardingAccess(): Promise<OnboardingAccessResult> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const visitorId = localStorage.getItem(VISITOR_ID_KEY);

  const { data, error } = await supabase.functions.invoke('onboarding-entry-check', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    // Pass visitorId as query parameter
    ...(visitorId && {
      // Note: Supabase functions.invoke doesn't support query params directly,
      // so we'll need to append it to the function name or use POST
      body: JSON.stringify({ visitorId })
    }),
  });

  if (error) {
    throw new Error(error.message);
  }

  // Save visitorId to localStorage
  if (data.visitorId) {
    localStorage.setItem(VISITOR_ID_KEY, data.visitorId);
  }

  return {
    canStart: data.canStartOnboarding,
    visitorId: data.visitorId,
    reason: data.reason,
  };
}

/**
 * 开始体验任务（未登录用户）
 */
export async function startOnboarding(params: {
  visitorId: string;
  taskName?: string;
  taskDescription?: string;
  deviceFingerprint?: string;
}): Promise<StartOnboardingResult> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.functions.invoke('onboarding-start', {
    method: 'POST',
    body: params,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Store session ID for later use
  if (data.onboardingSessionId) {
    sessionStorage.setItem(ONBOARDING_SESSION_ID_KEY, data.onboardingSessionId);
  }

  return data;
}

/**
 * 完成体验任务
 */
export async function completeOnboarding(params: CompleteOnboardingParams): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await supabase.functions.invoke('onboarding-complete', {
    method: 'POST',
    body: params,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * 获取当前访客 ID
 */
export function getVisitorId(): string | null {
  return localStorage.getItem(VISITOR_ID_KEY);
}

/**
 * 获取当前 Onboarding Session ID
 */
export function getOnboardingSessionId(): string | null {
  return sessionStorage.getItem(ONBOARDING_SESSION_ID_KEY);
}

/**
 * 清除访客数据（注册后调用）
 */
export function clearVisitorData(): void {
  localStorage.removeItem(VISITOR_ID_KEY);
  sessionStorage.removeItem(ONBOARDING_SESSION_ID_KEY);
}

/**
 * 使用 Fetch API 直接调用（备选方案）
 * 如果 Supabase functions.invoke 有问题，可以使用这个
 */
export async function checkOnboardingAccessDirect(): Promise<OnboardingAccessResult> {
  const visitorId = localStorage.getItem(VISITOR_ID_KEY);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase 环境变量缺失，无法检查体验资格');
  }

  const projectRef = new URL(supabaseUrl).host.split('.')[0];
  const functionsUrl = `https://${projectRef}.functions.supabase.co`;

  const response = await fetch(
    `${functionsUrl}/onboarding-entry-check?visitorId=${visitorId || ''}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to check onboarding access');
  }

  const data = await response.json();

  // Save visitorId to localStorage
  if (data.visitorId) {
    localStorage.setItem(VISITOR_ID_KEY, data.visitorId);
  }

  return {
    canStart: data.canStartOnboarding,
    visitorId: data.visitorId,
    reason: data.reason,
  };
}
