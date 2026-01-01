/**
 * WebView 检测工具
 *
 * 检测网页是否在各种 WebView 环境中打开
 * 用于处理 OAuth 登录兼容性问题（如 Google 登录在 WebView 中不可用）
 */

/**
 * WebView 环境类型
 */
export type WebViewType =
  | 'native-app'      // 自家原生 App
  | 'wechat'          // 微信
  | 'alipay'          // 支付宝
  | 'weibo'           // 微博
  | 'qq'              // QQ
  | 'douyin'          // 抖音/TikTok
  | 'xiaohongshu'     // 小红书
  | 'facebook'        // Facebook
  | 'instagram'       // Instagram
  | 'line'            // Line
  | 'twitter'         // Twitter/X
  | 'linkedin'        // LinkedIn
  | 'snapchat'        // Snapchat
  | 'android-webview' // 通用 Android WebView
  | 'ios-webview'     // 通用 iOS WebView
  | 'unknown-webview' // 未知 WebView
  | 'browser';        // 正常浏览器

/**
 * 检测结果
 */
export interface WebViewDetectionResult {
  /** 是否在 WebView 中 */
  isWebView: boolean;
  /** 是否在自家 App 中 */
  isNativeApp: boolean;
  /** WebView 类型 */
  type: WebViewType;
  /** User-Agent 字符串 */
  userAgent: string;
}

/**
 * 检测是否在自家原生 App 中
 * 通过检测 App 注入的 JavaScript Bridge
 */
function detectNativeApp(): boolean {
  if (typeof window === 'undefined') return false;

  // Android: 检测 AndroidBridge
  if ('AndroidBridge' in window) {
    return true;
  }

  // iOS: 检测 WKWebView messageHandler
  if (
    'webkit' in window &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkit?.messageHandlers?.nativeApp
  ) {
    return true;
  }

  return false;
}

/**
 * 通过 User-Agent 检测 WebView 类型
 */
function detectWebViewByUserAgent(ua: string): WebViewType {
  const uaLower = ua.toLowerCase();

  // 中国常用 App
  if (uaLower.includes('micromessenger')) return 'wechat';
  if (uaLower.includes('alipayclient') || uaLower.includes('alipay')) return 'alipay';
  if (uaLower.includes('weibo')) return 'weibo';
  if (/\bqq\b/.test(uaLower) && !uaLower.includes('qqbrowser')) return 'qq';
  if (uaLower.includes('bytedancewebview') || uaLower.includes('aweme')) return 'douyin';
  if (uaLower.includes('xhswebview') || uaLower.includes('xiaohongshu')) return 'xiaohongshu';

  // 国际常用 App
  if (uaLower.includes('fban') || uaLower.includes('fbav')) return 'facebook';
  if (uaLower.includes('instagram')) return 'instagram';
  if (/\bline\b/.test(uaLower)) return 'line';
  if (uaLower.includes('twitter')) return 'twitter';
  if (uaLower.includes('linkedin')) return 'linkedin';
  if (uaLower.includes('snapchat')) return 'snapchat';

  // 通用 WebView 检测
  // Android WebView 特征：包含 wv 或 Version/x.x Chrome 但不是完整 Chrome
  if (uaLower.includes('android')) {
    // 检测 Android WebView 的特征
    if (uaLower.includes('; wv)') || uaLower.includes(';wv)')) {
      return 'android-webview';
    }
    // 某些 WebView 没有 wv 标记，但有特殊特征
    if (/version\/[\d.]+ chrome\/[\d.]+/i.test(ua) && !uaLower.includes('chrome/')) {
      return 'android-webview';
    }
  }

  // iOS WebView 特征：有 AppleWebKit 但没有 Safari
  if (uaLower.includes('iphone') || uaLower.includes('ipad') || uaLower.includes('ipod')) {
    if (uaLower.includes('applewebkit') && !uaLower.includes('safari')) {
      return 'ios-webview';
    }
    // 某些 iOS WebView 会包含 Safari 但有其他特征
    // CriOS = Chrome iOS, FxiOS = Firefox iOS - 这些是正常浏览器
    if (!uaLower.includes('crios') && !uaLower.includes('fxios') && !uaLower.includes('safari/')) {
      return 'ios-webview';
    }
  }

  return 'browser';
}

/**
 * 检测额外的 WebView 特征
 * 某些 WebView 会限制或修改某些 API
 */
function detectWebViewByFeatures(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // 检测 standalone 模式（PWA 或 WebView）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (nav.standalone === true) {
      return true;
    }

    // 检测某些 WebView 特有的全局变量
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (
      win.__wxjs_environment || // 微信
      win.WeixinJSBridge ||     // 微信
      win.AlipayJSBridge ||     // 支付宝
      win.ToutiaoJSBridge       // 头条系
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 综合检测当前环境是否为 WebView
 *
 * @returns WebView 检测结果
 *
 * @example
 * ```typescript
 * const result = detectWebView();
 * if (result.isWebView) {
 *   console.log(`检测到 WebView 环境: ${result.type}`);
 * }
 * ```
 */
export function detectWebView(): WebViewDetectionResult {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // 1. 首先检测是否在自家 App 中
  const isNativeApp = detectNativeApp();
  if (isNativeApp) {
    return {
      isWebView: true,
      isNativeApp: true,
      type: 'native-app',
      userAgent,
    };
  }

  // 2. 通过 User-Agent 检测
  const uaType = detectWebViewByUserAgent(userAgent);
  if (uaType !== 'browser') {
    return {
      isWebView: true,
      isNativeApp: false,
      type: uaType,
      userAgent,
    };
  }

  // 3. 通过 JavaScript 特征检测
  const hasWebViewFeatures = detectWebViewByFeatures();
  if (hasWebViewFeatures) {
    return {
      isWebView: true,
      isNativeApp: false,
      type: 'unknown-webview',
      userAgent,
    };
  }

  // 4. 正常浏览器
  return {
    isWebView: false,
    isNativeApp: false,
    type: 'browser',
    userAgent,
  };
}

/**
 * 快捷方法：检测是否在任何 WebView 中
 *
 * @returns 是否在 WebView 中
 */
export function isInWebView(): boolean {
  return detectWebView().isWebView;
}

/**
 * 快捷方法：检测是否在第三方 App 的 WebView 中（排除自家 App）
 *
 * @returns 是否在第三方 WebView 中
 */
export function isInThirdPartyWebView(): boolean {
  const result = detectWebView();
  return result.isWebView && !result.isNativeApp;
}

/**
 * 快捷方法：检测 Google 登录是否可用
 *
 * Google 登录在所有 WebView 中都不可用（包括自家 App）
 * 因为 Google 禁止在 WebView 中进行 OAuth 登录
 *
 * @returns Google 登录是否可用（只在正常浏览器中返回 true）
 */
export function isGoogleLoginAvailable(): boolean {
  return !detectWebView().isWebView;
}
