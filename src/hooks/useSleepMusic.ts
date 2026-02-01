import { useState, useEffect, useCallback } from 'react';
import {
  isSleepMusicSupported,
  playSleepMusic as bridgePlay,
  stopSleepMusic as bridgeStop,
  setSleepMusicVolume as bridgeSetVolume,
  showAirPlayPicker as bridgeShowPicker,
  addSleepMusicStateListener,
  sleepMusicAsync,
  DEFAULT_SLEEP_MUSIC_TRACKS,
  type SleepMusicState,
  type SleepMusicTrack,
  type SleepMusicTrackId,
} from '../lib/sleepMusicBridge';

/**
 * useSleepMusic Hook - 助眠音乐管理
 *
 * 职责：
 * - 管理助眠音乐播放状态
 * - 提供播放/停止/音量控制
 * - 管理 AirPlay 设备状态
 *
 * 使用方法：
 * ```tsx
 * const {
 *   isSupported,
 *   isPlaying,
 *   trackId,
 *   volume,
 *   isAirPlayActive,
 *   airPlayDeviceName,
 *   tracks,
 *   play,
 *   stop,
 *   setVolume,
 *   showAirPlayPicker,
 * } = useSleepMusic();
 * ```
 */

export interface UseSleepMusicOptions {
  /** 自动获取初始状态，默认 true */
  autoFetchState?: boolean;
  /** 状态变化回调 */
  onStateChange?: (state: SleepMusicState) => void;
}

export function useSleepMusic(options: UseSleepMusicOptions = {}) {
  const { autoFetchState = true, onStateChange } = options;

  // 是否支持（仅 iOS WebView）
  const [isSupported] = useState(() => isSleepMusicSupported());

  // 播放状态
  const [state, setState] = useState<SleepMusicState>({
    isPlaying: false,
    trackId: null,
    volume: 0.8,
    isAirPlayActive: false,
    airPlayDeviceName: null,
  });

  // 可用音轨列表
  const [tracks, setTracks] = useState<SleepMusicTrack[]>(DEFAULT_SLEEP_MUSIC_TRACKS);

  // 加载中状态
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 播放助眠音乐
   */
  const play = useCallback(
    (trackId: SleepMusicTrackId, volume?: number) => {
      if (!isSupported) {
        console.log('[useSleepMusic] Not supported on this platform');
        return;
      }

      setIsLoading(true);
      bridgePlay(trackId, volume ?? state.volume);

      // 乐观更新
      setState((prev) => ({
        ...prev,
        isPlaying: true,
        trackId,
        volume: volume ?? prev.volume,
      }));

      // 短暂延迟后清除 loading
      setTimeout(() => setIsLoading(false), 500);
    },
    [isSupported, state.volume]
  );

  /**
   * 停止播放
   */
  const stop = useCallback(() => {
    if (!isSupported) return;

    bridgeStop();

    // 乐观更新
    setState((prev) => ({
      ...prev,
      isPlaying: false,
    }));
  }, [isSupported]);

  /**
   * 设置音量
   */
  const setVolume = useCallback(
    (volume: number) => {
      if (!isSupported) return;

      const clampedVolume = Math.max(0, Math.min(1, volume));
      bridgeSetVolume(clampedVolume);

      // 乐观更新
      setState((prev) => ({
        ...prev,
        volume: clampedVolume,
      }));
    },
    [isSupported]
  );

  /**
   * 显示 AirPlay 选择器
   */
  const showAirPlayPicker = useCallback(() => {
    if (!isSupported) {
      console.log('[useSleepMusic] AirPlay not supported on this platform');
      return;
    }

    bridgeShowPicker();
  }, [isSupported]);

  /**
   * 切换播放/暂停
   */
  const toggle = useCallback(
    (trackId?: SleepMusicTrackId) => {
      if (state.isPlaying) {
        stop();
      } else {
        play(trackId ?? state.trackId ?? 'rain');
      }
    },
    [state.isPlaying, state.trackId, play, stop]
  );

  /**
   * 刷新状态
   */
  const refreshState = useCallback(async () => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const newState = await sleepMusicAsync.getState();
      setState(newState);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  /**
   * 刷新音轨列表
   */
  const refreshTracks = useCallback(async () => {
    if (!isSupported) return;

    try {
      const newTracks = await sleepMusicAsync.getTracks();
      setTracks(newTracks);
    } catch {
      // 使用默认列表
      setTracks(DEFAULT_SLEEP_MUSIC_TRACKS);
    }
  }, [isSupported]);

  // 监听状态变化
  useEffect(() => {
    if (!isSupported) return;

    const removeListener = addSleepMusicStateListener((newState) => {
      setState(newState);
      onStateChange?.(newState);
    });

    return removeListener;
  }, [isSupported, onStateChange]);

  // 初始化时获取状态
  useEffect(() => {
    if (!isSupported || !autoFetchState) return;

    // 获取初始状态
    refreshState();
    refreshTracks();
  }, [isSupported, autoFetchState, refreshState, refreshTracks]);

  return {
    // 平台支持
    isSupported,
    isLoading,

    // 播放状态
    isPlaying: state.isPlaying,
    trackId: state.trackId,
    volume: state.volume,

    // AirPlay 状态
    isAirPlayActive: state.isAirPlayActive,
    airPlayDeviceName: state.airPlayDeviceName,

    // 可用音轨
    tracks,

    // 完整状态
    state,

    // 操作方法
    play,
    stop,
    toggle,
    setVolume,
    showAirPlayPicker,
    refreshState,
    refreshTracks,
  };
}

export type { SleepMusicState, SleepMusicTrack, SleepMusicTrackId };
