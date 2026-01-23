/**
 * LiveKit 语音模式设置工具库
 *
 * 管理用户对语音通话模式的偏好：
 * - WebView 模式：使用网页版 Gemini Live（在 WebView 中直接通话）
 * - LiveKit 模式：弹出 iOS 原生 LiveKit 通话窗口（支持后台播放）
 *
 * 此功能仅在 iOS 原生 App 中可用。
 */

const LIVEKIT_MODE_STORAGE_KEY = 'lumi_voice_mode';

/**
 * 语音通话模式
 * - webview: WebView 模式（使用 Gemini Live API 直接在 WebView 中通话）
 * - livekit: LiveKit 原生模式（弹出 iOS 原生通话窗口）
 */
export type VoiceMode = 'webview' | 'livekit';

/**
 * 检测是否在 iOS 原生 App 中且支持原生 LiveKit 通话
 *
 * @returns true 如果在 iOS 原生 App 中且支持原生 LiveKit 通话
 *
 * 2026-01-23: 暂时禁用原生 LiveKit，iOS 默认使用 WebView 模式
 */
export function isNativeLiveKitAvailable(): boolean {
  // 暂时禁用原生 LiveKit 功能
  // TODO: 等 LiveKit Agent 延迟问题解决后重新启用
  return false;

  // 原逻辑（暂时注释）：
  // if (typeof window === 'undefined') return false;
  // const webkit = (window as any).webkit;
  // return !!webkit?.messageHandlers?.startNativeLiveKitCall;
}

/**
 * 检测是否在 iOS 原生 App 中且支持 LiveKit（向后兼容）
 */
export function isLiveKitAvailable(): boolean {
  return isNativeLiveKitAvailable();
}

/**
 * 获取用户的语音通话模式偏好
 *
 * @returns 用户设置的语音模式，iOS 环境默认为 'livekit'
 */
export function getVoiceMode(): VoiceMode {
  try {
    const stored = localStorage.getItem(LIVEKIT_MODE_STORAGE_KEY);
    if (stored === 'webview' || stored === 'livekit') {
      return stored;
    }
    // iOS 环境默认使用 LiveKit 原生模式
    return 'livekit';
  } catch {
    return 'livekit';
  }
}

/**
 * 设置用户的语音通话模式偏好
 *
 * @param mode - 语音模式 ('webview' | 'livekit')
 */
export function setVoiceMode(mode: VoiceMode): void {
  try {
    localStorage.setItem(LIVEKIT_MODE_STORAGE_KEY, mode);
    console.log('🎙️ Voice mode set to:', mode);
  } catch (error) {
    console.error('Failed to save voice mode preference:', error);
  }
}

/**
 * 检查当前是否为 LiveKit 原生模式
 *
 * @returns true 如果启用了 LiveKit 模式且在 iOS 环境中
 */
export function isLiveKitMode(): boolean {
  return isNativeLiveKitAvailable() && getVoiceMode() === 'livekit';
}

/**
 * 启动原生 LiveKit 语音通话
 *
 * 通过 iOS 桥接调用原生 LiveKit 通话页面
 * 页面会全屏覆盖 WebView，支持后台播放
 *
 * @returns true 如果成功发送请求
 */
export function startNativeLiveKitCall(): boolean {
  if (!isNativeLiveKitAvailable()) {
    console.warn('Native LiveKit is not available in this environment');
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkit.messageHandlers.startNativeLiveKitCall.postMessage({});
    console.log('🎙️ Starting native LiveKit call');
    return true;
  } catch (error) {
    console.error('Failed to start native LiveKit call:', error);
    return false;
  }
}

/**
 * 开始 LiveKit 语音通话（向后兼容）
 * 实际调用原生 LiveKit 通话页面
 */
export function startLiveKitRoom(_roomName?: string): void {
  startNativeLiveKitCall();
}

/**
 * 监听原生 LiveKit 通话结束事件
 *
 * iOS 会通过 CustomEvent 发送 nativeLiveKitCallEnded 事件
 *
 * @param callback - 回调函数，参数为结束原因（可选）
 * @returns 清理函数
 */
export function onNativeLiveKitCallEnded(
  callback: (reason?: string) => void
): () => void {
  const eventName = 'nativeLiveKitCallEnded';

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    const reason = customEvent.detail?.reason;
    callback(reason);
  };

  window.addEventListener(eventName, handler);

  return () => {
    window.removeEventListener(eventName, handler);
  };
}

/**
 * 监听 LiveKit 事件（向后兼容）
 */
export function onLiveKitEvent(
  event: 'connected' | 'disconnected' | 'error',
  callback: (detail?: unknown) => void
): () => void {
  // 原生通话的事件：只处理 disconnected（通话结束）
  if (event === 'disconnected') {
    return onNativeLiveKitCallEnded(() => callback());
  }
  // connected 和 error 事件不再由 Web 端处理（原生 UI 处理）
  return () => {};
}

/**
 * 结束 LiveKit 语音通话（向后兼容）
 * 原生通话由 iOS 端控制，此函数仅用于兼容
 */
export function endLiveKitRoom(): void {
  console.log('endLiveKitRoom called - native call is controlled by iOS');
}

/**
 * 设置 LiveKit 麦克风静音（向后兼容）
 * 原生通话麦克风由 iOS 端控制
 */
export function setLiveKitMicMuted(_muted: boolean): void {
  console.log('setLiveKitMicMuted called - mic is controlled by iOS native UI');
}
