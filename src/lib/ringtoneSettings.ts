/**
 * 铃声类型设置工具库
 *
 * 管理用户对铃声类型的偏好（人声/音乐），
 * 并通过桥接同步设置到 iOS 和 Android 原生端。
 */

const RINGTONE_TYPE_STORAGE_KEY = 'lumi_ringtone_type';

/**
 * 铃声类型
 * - voice: 人声铃声（AI 语音，默认）
 * - music: 音乐铃声（纯音乐，无人声）
 */
export type RingtoneType = 'voice' | 'music';

/**
 * 获取用户的铃声类型偏好
 *
 * @returns 用户设置的铃声类型，默认为 'voice'（人声铃声）
 */
export function getRingtoneType(): RingtoneType {
  try {
    const stored = localStorage.getItem(RINGTONE_TYPE_STORAGE_KEY);
    if (stored === 'voice' || stored === 'music') {
      return stored;
    }
    return 'voice'; // 默认人声铃声
  } catch {
    return 'voice';
  }
}

/**
 * 检查当前是否为人声铃声模式
 *
 * @returns true 如果是人声铃声
 */
export function isVoiceRingtone(): boolean {
  return getRingtoneType() === 'voice';
}

/**
 * 设置用户的铃声类型偏好
 * 会同时通知原生端（iOS/Android）更新设置
 *
 * @param type - 铃声类型 ('voice' | 'music')
 */
export function setRingtoneType(type: RingtoneType): void {
  try {
    localStorage.setItem(RINGTONE_TYPE_STORAGE_KEY, type);
    // 同步到原生端
    syncRingtoneTypeToNative(type);
  } catch (error) {
    console.error('Failed to save ringtone type preference:', error);
  }
}

/**
 * 同步铃声类型设置到原生端
 *
 * 通过 WebView 桥接接口，将设置传递给：
 * - Android: window.AndroidBridge.setRingtoneType()
 * - iOS: window.webkit.messageHandlers.setRingtoneType.postMessage()
 *
 * @param type - 铃声类型
 */
function syncRingtoneTypeToNative(type: RingtoneType): void {
  // Android 桥接
  if (window.AndroidBridge?.setRingtoneType) {
    try {
      window.AndroidBridge.setRingtoneType(type);
      console.log('🔔 Ringtone type synced to Android:', type);
    } catch (error) {
      console.error('Failed to sync ringtone type to Android:', error);
    }
  }

  // iOS 桥接
  if (window.webkit?.messageHandlers?.setRingtoneType) {
    try {
      window.webkit.messageHandlers.setRingtoneType.postMessage({ type });
      console.log('🔔 Ringtone type synced to iOS:', type);
    } catch (error) {
      console.error('Failed to sync ringtone type to iOS:', error);
    }
  }
}
