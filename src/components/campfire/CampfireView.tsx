import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CampfireBackground } from './CampfireBackground';
import { CampfireControls } from './CampfireControls';
import {
  CAMPFIRE_SOUNDSCAPE_PRESETS,
  type CampfireSoundscapeId,
} from './campfireConfig';

/** 音频淡入淡出时长（毫秒） */
const AUDIO_FADE_DURATION = 800;

interface CampfireViewProps {
  /** 返回按钮点击回调 */
  onBack: () => void;
  /** 开始AI会话回调 */
  onStartSession?: () => void;
  /** 结束AI会话回调 */
  onEndSession?: () => void;
  /** AI会话是否活跃 */
  isSessionActive?: boolean;
  /** AI 是否正在说话（可选，未传则回退到 session 状态推断） */
  isAISpeaking?: boolean;
  /** 是否处于静默模式 */
  isSilentMode?: boolean;
  /** 会话是否正在连接 */
  isConnecting?: boolean;
  /** 开发调试：触发进入静默模式 */
  onEnterSilentMode?: () => void;
  /** 是否显示调试控制（开发环境） */
  showDebugControls?: boolean;
}

/**
 * 篝火陪伴模式主视图
 *
 * 功能：
 * 1. 全屏篝火背景 + 火焰动画
 * 2. 循环播放篝火音效（带淡入淡出）
 * 3. 控制栏（返回、音频开关、结束会话）
 * 4. AI会话管理（外部控制）
 *
 * 音频管理：
 * - 使用 HTML5 Audio API
 * - 支持平滑淡入淡出（800ms，20步）
 * - 自动循环播放
 * - 组件卸载时自动清理
 */
export const CampfireView: React.FC<CampfireViewProps> = ({
  onBack,
  onStartSession,
  onEndSession,
  isSessionActive = false,
  isAISpeaking,
  isSilentMode = false,
  isConnecting = false,
  onEnterSilentMode,
  showDebugControls = false,
}) => {
  // ==========================================
  // 状态管理
  // ==========================================
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [selectedSoundscape, setSelectedSoundscape] = useState<CampfireSoundscapeId>('campfire');
  const [debugSpeakingOverride, setDebugSpeakingOverride] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const targetVolumeRef = useRef<number>(1);
  const derivedSpeaking = isAISpeaking ?? (isSessionActive && !isSilentMode);
  const isSpeaking = debugSpeakingOverride ?? derivedSpeaking;
  const presenceState = isConnecting ? 'connecting' : isSilentMode ? 'silent' : 'active';
  const currentSoundscape = useMemo(
    () =>
      CAMPFIRE_SOUNDSCAPE_PRESETS.find(
        (preset) => preset.id === selectedSoundscape && preset.isAvailable,
      )
      ?? CAMPFIRE_SOUNDSCAPE_PRESETS.find((preset) => preset.isAvailable)
      ?? CAMPFIRE_SOUNDSCAPE_PRESETS[0],
    [selectedSoundscape],
  );

  /**
   * 切换环境音（占位选项暂不可用）
   */
  const handleSelectSoundscape = useCallback((id: CampfireSoundscapeId) => {
    const preset = CAMPFIRE_SOUNDSCAPE_PRESETS.find((option) => option.id === id);
    if (!preset || !preset.isAvailable) {
      if (import.meta.env.DEV) {
        console.log('⏳ 环境音占位：尚未提供真实音源');
      }
      return;
    }
    setSelectedSoundscape(id);
  }, []);

  // ==========================================
  // 音频控制
  // ==========================================

  /**
   * 切换音频播放状态（带淡入淡出效果）
   */
  const toggleSound = useCallback(() => {
    // 初始化音频对象
    if (!audioRef.current) {
      audioRef.current = new Audio('/campfire-sound.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0;
    }

    // 应用当前环境音预设（当前仅支持篝火音源）
    audioRef.current.playbackRate = currentSoundscape.playbackRate;
    targetVolumeRef.current = currentSoundscape.outputGain;

    // 清除之前的淡入淡出
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    const audio = audioRef.current;
    const steps = 20; // 淡入淡出步数
    const stepDuration = AUDIO_FADE_DURATION / steps;
    const volumeStep = targetVolumeRef.current / steps;

    if (isPlayingSound) {
      // 淡出
      fadeIntervalRef.current = window.setInterval(() => {
        if (audio.volume > volumeStep) {
          audio.volume = Math.max(0, audio.volume - volumeStep);
        } else {
          audio.volume = 0;
          audio.pause();
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
        }
      }, stepDuration);
    } else {
      // 淡入
      audio.volume = 0;
      audio.play().catch((err) => {
        console.error('Failed to play campfire sound:', err);
      });
      fadeIntervalRef.current = window.setInterval(() => {
        if (audio.volume < targetVolumeRef.current - volumeStep) {
          audio.volume = Math.min(targetVolumeRef.current, audio.volume + volumeStep);
        } else {
          audio.volume = targetVolumeRef.current;
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
        }
      }, stepDuration);
    }
    setIsPlayingSound(!isPlayingSound);
  }, [isPlayingSound, currentSoundscape]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.playbackRate = currentSoundscape.playbackRate;
    targetVolumeRef.current = currentSoundscape.outputGain;
    if (isPlayingSound) {
      audioRef.current.volume = Math.min(audioRef.current.volume, targetVolumeRef.current);
    }
  }, [currentSoundscape, isPlayingSound]);

  // ==========================================
  // 生命周期管理
  // ==========================================

  /**
   * 组件卸载时清理音频资源
   */
  useEffect(() => {
    return () => {
      // 清除淡入淡出定时器
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      // 停止并释放音频
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ==========================================
  // 渲染
  // ==========================================
  return (
    <>
      {/* 背景 + 火焰 */}
      <CampfireBackground isSpeaking={isSpeaking} presenceState={presenceState} />

      {/* 控制栏 */}
      <CampfireControls
        onBack={onBack}
        isPlayingSound={isPlayingSound}
        onToggleSound={toggleSound}
        onEndSession={isSessionActive ? onEndSession : undefined}
        presenceState={presenceState}
        soundscapeOptions={CAMPFIRE_SOUNDSCAPE_PRESETS}
        selectedSoundscape={selectedSoundscape}
        onSelectSoundscape={handleSelectSoundscape}
        showDebugControls={showDebugControls}
        isSpeaking={isSpeaking}
        onEnterSilentMode={onEnterSilentMode}
        onToggleSpeaking={() => {
          setDebugSpeakingOverride((prev) => {
            if (prev === null) {
              return !derivedSpeaking;
            }
            return !prev;
          });
        }}
      />

      {/* 未来扩展：开始会话按钮（当没有活跃会话时显示） */}
      {!isSessionActive && onStartSession && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-50">
          <button
            onClick={onStartSession}
            disabled={isConnecting}
            className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-lg font-medium rounded-full hover:opacity-90 transition-opacity shadow-lg"
          >
            {isConnecting ? '连接中...' : '开始陪伴'}
          </button>
        </div>
      )}
    </>
  );
};
