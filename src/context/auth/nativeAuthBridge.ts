/**
 * Native Auth Bridge Module
 *
 * 负责与 iOS/Android 原生 App 的认证通信
 * 从 AuthContext 中拆分出来，保持单一职责
 */

import type { NativeAuthPayload } from '../AuthContextDefinition';

/**
 * 通知原生 App 用户已登出
 * iOS: 使用 WKScriptMessageHandler (window.webkit.messageHandlers.userLogout)
 * Android: 使用 AndroidBridge (window.AndroidBridge.onLogout)
 */
export function notifyNativeLogout(): void {
  try {
    // iOS: 使用 WKScriptMessageHandler 通知原生端
    if (window.webkit?.messageHandlers?.userLogout) {
      window.webkit.messageHandlers.userLogout.postMessage({});
      if (import.meta.env.DEV) {
        console.log('📱 已通过 WKScriptMessageHandler 通知 iOS 原生端登出');
      }
    }

    // Android: 使用 AndroidBridge 通知原生端
    if (window.AndroidBridge?.logout) {
      window.AndroidBridge.logout();
      if (import.meta.env.DEV) {
        console.log('📱 已通过 AndroidBridge 通知 Android 原生端登出');
      }
    }

    // 如果不在 WebView 中，仅在开发模式下提示
    if (import.meta.env.DEV && !window.webkit?.messageHandlers?.userLogout && !window.AndroidBridge?.logout) {
      console.log('ℹ️ 非原生 WebView 环境，跳过原生登出通知');
    }
  } catch (error) {
    console.error('❌ 通知原生端登出失败:', error);
  }
}

/**
 * 通知 Native 端网页已确认收到登录态，Native 可以停止重试
 * @param reason - 确认原因（用于调试）
 */
export function notifyAuthConfirmed(reason: string = 'confirmed'): void {
  try {
    if (window.webkit?.messageHandlers?.authConfirmed) {
      window.webkit.messageHandlers.authConfirmed.postMessage({
        success: true,
        reason,
      });
      console.log('🔐 Web: 已通知 Native 停止重试, reason:', reason);
    }
  } catch (error) {
    console.error('❌ 通知 Native authConfirmed 失败:', error);
  }
}

/**
 * 向 Native 端主动请求登录态
 * 当网页加载完成但没有发现 MindBoatNativeAuth 时调用
 */
export function requestNativeAuth(): void {
  try {
    if (window.webkit?.messageHandlers?.requestNativeAuth) {
      window.webkit.messageHandlers.requestNativeAuth.postMessage({});
      console.log('🔐 Web: 已向 Native 请求登录态');
    }
  } catch (error) {
    console.error('❌ 向 Native 请求登录态失败:', error);
  }
}

/**
 * 检查 token 是否为有效的 JWT 格式
 * @param token - 要检查的 token
 * @returns 是否为 JWT 格式
 */
export function isValidJwt(token?: string | null): boolean {
  return Boolean(token && token.split('.').length === 3);
}

/**
 * 解析 Native Auth Payload，统一处理不同的字段命名
 * Native 端可能使用不同的字段名，这里做统一转换
 *
 * @param payload - 原生传入的登录数据
 * @returns 标准化后的登录数据
 */
export function parseNativeAuthPayload(payload?: NativeAuthPayload): {
  userId: string | undefined;
  email: string | undefined;
  accessToken: string | undefined;
  refreshToken: string | undefined;
  userName: string | undefined;
  pictureUrl: string | undefined;
} {
  const authPayload = payload || window.MindBoatNativeAuth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPayload = authPayload as any;

  return {
    userId: authPayload?.userId ?? anyPayload?.user_id,
    email: authPayload?.email ?? anyPayload?.user_email,
    accessToken: authPayload?.accessToken
      ?? authPayload?.sessionToken
      ?? anyPayload?.access_token
      ?? anyPayload?.session_token,
    refreshToken: authPayload?.refreshToken ?? anyPayload?.refresh_token,
    userName: authPayload?.name ?? anyPayload?.user_name ?? anyPayload?.full_name,
    pictureUrl: authPayload?.pictureUrl ?? anyPayload?.picture_url ?? anyPayload?.avatar_url,
  };
}

/**
 * 验证 userId 是否为有效的 Supabase UUID
 * @param userId - 要验证的用户 ID
 * @returns 是否为有效的 UUID
 */
export function isValidSupabaseUuid(userId: string): boolean {
  const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidPattern.test(userId);
}

/**
 * 初始化 Native Auth Bridge
 * 设置 __MindBoatAuthReady 标志，告诉 Native 网页已准备好
 *
 * @param onAuthPayloadFound - 当发现已有登录态时的回调
 */
export function initNativeAuthBridge(onAuthPayloadFound: (payload: NativeAuthPayload) => void): void {
  // 标记网页已准备好接收登录态
  window.__MindBoatAuthReady = true;
  console.log('🔐 Web: Native Auth Bridge 已初始化');

  // 检查是否已经有 Native 设置的登录态
  if (window.MindBoatNativeAuth) {
    console.log('🔐 Web: 发现已设置的登录态，立即处理');
    onAuthPayloadFound(window.MindBoatNativeAuth);
  } else {
    // 没有登录态，主动向 Native 请求
    console.log('🔐 Web: 没有登录态，向 Native 请求...');
    requestNativeAuth();
  }
}
