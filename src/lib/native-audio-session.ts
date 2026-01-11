/**
 * Native Audio Session 工具
 *
 * 用于处理 iOS Native WebView 中的音频会话同步问题。
 * 当 CallKit 来电结束后，iOS 需要重新配置音频会话，
 * Web 端在请求麦克风/摄像头前应等待音频会话就绪。
 */

/**
 * 检查是否在 iOS Native WebView 中运行
 */
export function isInNativeWebView(): boolean {
  return !!(window as unknown as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers;
}

/**
 * 检查 iOS 音频会话是否已就绪
 */
export function isAudioSessionReady(): boolean {
  // 非 Native 环境直接返回 true
  if (!isInNativeWebView()) return true;
  return !!(window as unknown as { __nativeAudioSessionReady?: boolean }).__nativeAudioSessionReady;
}

/**
 * 等待 iOS 音频会话就绪
 *
 * 使用场景：
 * - 在 CallKit 来电接听后，iOS 会重新配置音频会话
 * - Web 端在请求麦克风/摄像头前应等待此事件
 *
 * @param timeout 超时时间（毫秒），默认 3000ms
 * @returns Promise<boolean> 是否在超时前就绪
 */
export function waitForAudioSessionReady(timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    // 非 Native 环境直接返回
    if (!isInNativeWebView()) {
      resolve(true);
      return;
    }

    // 已经就绪
    if (isAudioSessionReady()) {
      console.log('🎤 Audio session already ready');
      resolve(true);
      return;
    }

    let resolved = false;

    const handler = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('nativeAudioSessionReady', handler);
      console.log('🎤 Received nativeAudioSessionReady event from iOS');
      resolve(true);
    };

    window.addEventListener('nativeAudioSessionReady', handler);

    // 超时处理
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('nativeAudioSessionReady', handler);
      console.warn('🎤 Waiting for iOS audio session timed out, proceeding anyway');
      resolve(false);
    }, timeout);
  });
}

/**
 * 等待音频会话就绪（如果在 Native 环境且未就绪）
 * 这是一个便捷方法，只在需要时等待
 */
export async function ensureAudioSessionReady(): Promise<void> {
  if (isInNativeWebView() && !isAudioSessionReady()) {
    console.log('🎤 Waiting for iOS audio session to be ready...');
    await waitForAudioSessionReady();
  }
}
