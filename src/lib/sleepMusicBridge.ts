/**
 * Sleep Music Bridge Module
 *
 * 负责与 iOS 原生 App 的助眠音乐功能通信
 * 仅 iOS 支持，Android 和 Web 浏览器不支持
 */

// ============================================================================
// Types
// ============================================================================

export type SleepMusicTrackId = 'rain' | 'forest' | 'ocean';

export interface SleepMusicTrack {
  id: SleepMusicTrackId;
  name: string;
}

export interface SleepMusicState {
  isPlaying: boolean;
  trackId: SleepMusicTrackId | null;
  volume: number;
  isAirPlayActive: boolean;
  airPlayDeviceName: string | null;
}

export type SleepMusicResultType = 'state' | 'tracks' | 'airPlayDevice';

export interface SleepMusicResultEvent {
  type: SleepMusicResultType;
  data: SleepMusicState | SleepMusicTrack[] | { deviceName: string | null };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * 检测是否在 iOS WebView 环境中
 */
function isIOSWebView(): boolean {
  const handlers = window.webkit?.messageHandlers;
  return !!(handlers?.playSleepMusic);
}

/**
 * iOS Sleep Music Bridge - 通过 WKWebView 与原生通信
 */
const sleepMusicBridge = {
  /**
   * 播放助眠音乐
   */
  play: (trackId: SleepMusicTrackId, volume: number = 0.8): void => {
    if (isIOSWebView()) {
      console.log(`[SleepMusic] Playing: ${trackId}, volume: ${volume}`);
      window.webkit?.messageHandlers?.playSleepMusic?.postMessage({
        trackId,
        volume,
      });
    }
  },

  /**
   * 停止播放
   */
  stop: (): void => {
    if (isIOSWebView()) {
      console.log('[SleepMusic] Stopping...');
      window.webkit?.messageHandlers?.stopSleepMusic?.postMessage({});
    }
  },

  /**
   * 设置音量
   */
  setVolume: (volume: number): void => {
    if (isIOSWebView()) {
      console.log(`[SleepMusic] Setting volume: ${volume}`);
      window.webkit?.messageHandlers?.setSleepMusicVolume?.postMessage({
        volume,
      });
    }
  },

  /**
   * 显示 AirPlay 选择器
   */
  showAirPlayPicker: (): void => {
    if (isIOSWebView()) {
      console.log('[SleepMusic] Showing AirPlay picker...');
      window.webkit?.messageHandlers?.showAirPlayPicker?.postMessage({});
    }
  },

  /**
   * 获取当前状态
   */
  getState: (): void => {
    if (isIOSWebView()) {
      console.log('[SleepMusic] Getting state...');
      window.webkit?.messageHandlers?.getSleepMusicState?.postMessage({});
    }
  },

  /**
   * 获取可用音轨列表
   */
  getTracks: (): void => {
    if (isIOSWebView()) {
      console.log('[SleepMusic] Getting tracks...');
      window.webkit?.messageHandlers?.getSleepMusicTracks?.postMessage({});
    }
  },
};

// ============================================================================
// Public API - Event-based
// ============================================================================

/**
 * 检查助眠音乐是否在当前环境可用
 * @returns true 如果在 iOS WebView 中
 */
export function isSleepMusicSupported(): boolean {
  return isIOSWebView();
}

/**
 * 播放助眠音乐
 * @param trackId - 音轨 ID: 'rain' | 'forest' | 'ocean'
 * @param volume - 音量 0.0 - 1.0 (默认 0.8)
 */
export function playSleepMusic(trackId: SleepMusicTrackId, volume: number = 0.8): void {
  sleepMusicBridge.play(trackId, volume);
}

/**
 * 停止助眠音乐
 */
export function stopSleepMusic(): void {
  sleepMusicBridge.stop();
}

/**
 * 设置音量
 * @param volume - 音量 0.0 - 1.0
 */
export function setSleepMusicVolume(volume: number): void {
  sleepMusicBridge.setVolume(volume);
}

/**
 * 显示 AirPlay 设备选择器
 */
export function showAirPlayPicker(): void {
  sleepMusicBridge.showAirPlayPicker();
}

/**
 * 获取当前播放状态
 * 结果通过 'sleepMusicStateResponse' 事件返回
 */
export function getSleepMusicState(): void {
  sleepMusicBridge.getState();
}

/**
 * 获取可用音轨列表
 * 结果通过 'sleepMusicTracksResponse' 事件返回
 */
export function getSleepMusicTracks(): void {
  sleepMusicBridge.getTracks();
}

/**
 * 添加播放状态变化监听器
 * @param callback - 回调函数
 * @returns 移除监听器的函数
 */
export function addSleepMusicStateListener(
  callback: (state: SleepMusicState) => void
): () => void {
  const handler = (event: CustomEvent<SleepMusicState>) => {
    console.log('[SleepMusic] State changed:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('sleepMusicStateChanged', handler as EventListener);

  return () => {
    window.removeEventListener('sleepMusicStateChanged', handler as EventListener);
  };
}

/**
 * 添加状态响应监听器（用于 getState 请求）
 * @param callback - 回调函数
 * @returns 移除监听器的函数
 */
export function addSleepMusicStateResponseListener(
  callback: (state: SleepMusicState) => void
): () => void {
  const handler = (event: CustomEvent<SleepMusicState>) => {
    console.log('[SleepMusic] State response:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('sleepMusicStateResponse', handler as EventListener);

  return () => {
    window.removeEventListener('sleepMusicStateResponse', handler as EventListener);
  };
}

/**
 * 添加音轨列表响应监听器
 * @param callback - 回调函数
 * @returns 移除监听器的函数
 */
export function addSleepMusicTracksListener(
  callback: (tracks: SleepMusicTrack[]) => void
): () => void {
  const handler = (event: CustomEvent<SleepMusicTrack[]>) => {
    console.log('[SleepMusic] Tracks response:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('sleepMusicTracksResponse', handler as EventListener);

  return () => {
    window.removeEventListener('sleepMusicTracksResponse', handler as EventListener);
  };
}

// ============================================================================
// Public API - Promise-based
// ============================================================================

/**
 * Promise 版本的助眠音乐操作
 */
export const sleepMusicAsync = {
  /**
   * 获取当前状态
   */
  getState: (): Promise<SleepMusicState> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve({
          isPlaying: false,
          trackId: null,
          volume: 0.8,
          isAirPlayActive: false,
          airPlayDeviceName: null,
        });
        return;
      }

      const removeListener = addSleepMusicStateResponseListener((state) => {
        removeListener();
        resolve(state);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve({
          isPlaying: false,
          trackId: null,
          volume: 0.8,
          isAirPlayActive: false,
          airPlayDeviceName: null,
        });
      }, 5000);

      sleepMusicBridge.getState();
    });
  },

  /**
   * 获取可用音轨列表
   */
  getTracks: (): Promise<SleepMusicTrack[]> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        // 返回默认列表
        resolve([
          { id: 'rain', name: '轻柔雨声' },
          { id: 'forest', name: '森林白噪音' },
          { id: 'ocean', name: '海浪声' },
        ]);
        return;
      }

      const removeListener = addSleepMusicTracksListener((tracks) => {
        removeListener();
        resolve(tracks);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve([
          { id: 'rain', name: '轻柔雨声' },
          { id: 'forest', name: '森林白噪音' },
          { id: 'ocean', name: '海浪声' },
        ]);
      }, 5000);

      sleepMusicBridge.getTracks();
    });
  },

  /**
   * 播放并等待状态更新
   */
  play: (trackId: SleepMusicTrackId, volume: number = 0.8): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addSleepMusicStateListener((state) => {
        if (state.isPlaying && state.trackId === trackId) {
          removeListener();
          resolve(true);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 5000);

      sleepMusicBridge.play(trackId, volume);
    });
  },

  /**
   * 停止并等待状态更新
   */
  stop: (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addSleepMusicStateListener((state) => {
        if (!state.isPlaying) {
          removeListener();
          resolve(true);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 5000);

      sleepMusicBridge.stop();
    });
  },
};

// ============================================================================
// Default Tracks (for non-iOS platforms)
// ============================================================================

export const DEFAULT_SLEEP_MUSIC_TRACKS: SleepMusicTrack[] = [
  { id: 'rain', name: '轻柔雨声' },
  { id: 'forest', name: '森林白噪音' },
  { id: 'ocean', name: '海浪声' },
];
