/**
 * OAuth Callback Module
 *
 * 负责解析和处理 OAuth 回调参数
 * 从 AuthContext 中拆分出来，保持单一职责
 */

/** OAuth 回调可能包含的 URL 参数键 */
const OAUTH_PARAM_KEYS = [
  'code',
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'provider_token',
  'provider_refresh_token',
  'state',
  'error',
  'error_description',
] as const;

/** OAuth 回调参数结构 */
export interface OAuthCallbackParams {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
}

/**
 * 读取当前 URL 中的 OAuth 回调参数（支持 query 与 hash）。
 *
 * @returns {OAuthCallbackParams} 解析出的 OAuth 回调参数集合
 */
export function getOAuthCallbackParams(): OAuthCallbackParams {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return {
    code: urlParams.get('code'),
    accessToken: hashParams.get('access_token') || urlParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token') || urlParams.get('refresh_token'),
    error: urlParams.get('error') || hashParams.get('error'),
    errorDescription: urlParams.get('error_description') || hashParams.get('error_description'),
  };
}

/**
 * 判断当前 URL 是否包含 OAuth 回调参数，用于阻止过早跳转。
 *
 * @returns {boolean} 是否存在 OAuth 回调参数
 */
export function hasOAuthCallbackParams(): boolean {
  const { code, accessToken, error } = getOAuthCallbackParams();
  return Boolean(code || accessToken || error);
}

/**
 * 清理 URL 中的 OAuth 参数，避免 token 暴露在地址栏。
 */
export function clearOAuthCallbackParams(): void {
  const url = new URL(window.location.href);
  for (const key of OAUTH_PARAM_KEYS) {
    url.searchParams.delete(key);
  }
  url.hash = '';

  const cleaned = url.searchParams.toString();
  const nextUrl = cleaned ? `${url.pathname}?${cleaned}` : url.pathname;
  window.history.replaceState({}, '', nextUrl);
}
