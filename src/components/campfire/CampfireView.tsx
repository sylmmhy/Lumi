import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CampfireBackground } from './CampfireBackground';
import { CAMPFIRE_SOUNDSCAPE_PRESETS } from './campfireConfig';

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
  const [debugSpeakingOverride, setDebugSpeakingOverride] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const targetVolumeRef = useRef<number>(1);
  const derivedSpeaking = isAISpeaking ?? (isSessionActive && !isSilentMode);
  const isSpeaking = debugSpeakingOverride ?? derivedSpeaking;
  const presenceState = isConnecting ? 'connecting' : isSilentMode ? 'silent' : 'active';
  // 当前只有一个环境音（篝火），直接使用第一个可用的预设
  const currentSoundscape = useMemo(
    () =>
      CAMPFIRE_SOUNDSCAPE_PRESETS.find((preset) => preset.isAvailable)
      ?? CAMPFIRE_SOUNDSCAPE_PRESETS[0],
    [],
  );

  /**
   * 调试：切换说话状态
   */
  const handleToggleSpeaking = useCallback(() => {
    setDebugSpeakingOverride((prev) => {
      if (prev === null) {
        return !derivedSpeaking;
      }
      return !prev;
    });
  }, [derivedSpeaking]);

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
    <div className="absolute inset-0 flex flex-col">
      {/* 背景 + 火焰 */}
      <CampfireBackground isSpeaking={isSpeaking} presenceState={presenceState} />

      {/* 顶部控制栏：返回按钮 + AI 状态 */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-start justify-between gap-3">
        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-[10px] border border-white/10 text-white text-sm font-medium hover:bg-white/25 transition-all"
        >
          ← 返回
        </button>

        {/* AI 状态徽章 - 参考 TaskWorkingView 的样式 */}
        <div
          className="h-9 flex items-center gap-2 px-4 rounded-full backdrop-blur-[10px] border border-white/10"
          style={{ background: 'rgba(255, 255, 255, 0.15)' }}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              presenceState === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : presenceState === 'silent'
                  ? 'bg-blue-400'
                  : 'bg-green-500'
            }`}
          />
          <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">
            {presenceState === 'connecting'
              ? 'CONNECTING'
              : presenceState === 'silent'
                ? 'SILENT'
                : 'LIVE'}
          </span>
        </div>
      </div>

      {/* 中央：连接中提示 - 参考 TaskWorkingView */}
      {isConnecting && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-40">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-brand-orange animate-spin" />
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 shadow-lg"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-white font-bold text-sm">Connecting to AI coach...</p>
          </div>
        </div>
      )}

      {/* 底部操作区域 - 参考 TaskWorkingView 的按钮样式 */}
      <div className="absolute bottom-6 left-4 right-4 z-50 flex flex-col gap-4">
        {/* 音频控制按钮 */}
        <button
          onClick={toggleSound}
          className={`h-[56px] rounded-[20px] flex items-center justify-center gap-2 font-bold uppercase tracking-[0.8px] transition-all active:translate-y-[2px] ${
            isPlayingSound
              ? 'bg-gradient-to-t from-[#ff6b35] to-[#ff8856] border-2 border-[#ff9977] text-white'
              : 'bg-[#2c3039] border border-[#5a5c62] text-white'
          }`}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(12px, 3vw, 16px)',
            boxShadow: isPlayingSound ? '0 6px 0 0 #C23A22' : '0 4px 0 0 #444A58',
          }}
        >
          <span className="text-xl">{isPlayingSound ? '🔥' : '🔇'}</span>
          <span>{isPlayingSound ? 'SOUND ON' : 'SOUND OFF'}</span>
        </button>

        {/* 主操作按钮 - 完全参考 TaskWorkingView */}
        {isSessionActive && onEndSession ? (
          // 会话中：显示结束会话按钮（使用次要按钮样式）
          <button
            onClick={onEndSession}
            className="h-[56px] bg-[#2c3039] border border-[#5a5c62] rounded-[20px] flex items-center justify-center gap-[10px] px-2 active:translate-y-[2px] transition-all"
            style={{
              boxShadow: '0 4px 0 0 #444A58',
            }}
          >
            <span
              className="font-bold text-white uppercase tracking-[0.8px]"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 'clamp(12px, 3vw, 16px)',
                lineHeight: '1',
              }}
            >
              🛑 END SESSION
            </span>
          </button>
        ) : onStartSession ? (
          // 没有会话：显示开始按钮（使用主按钮样式）
          <button
            onClick={onStartSession}
            disabled={isConnecting}
            className="h-[56px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[20px] flex items-center justify-center gap-[10px] px-2 active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              boxShadow: '0 6px 0 0 #D34A22',
            }}
          >
            <span
              className="font-bold text-black uppercase tracking-[0.8px]"
              style={{
                fontFamily: 'Inter, Noto Sans JP, sans-serif',
                fontSize: 'clamp(12px, 3vw, 16px)',
                lineHeight: '1',
              }}
            >
              {isConnecting ? '⏳ CONNECTING...' : '🔥 START SESSION'}
            </span>
          </button>
        ) : null}

        {/* 调试按钮（开发环境） */}
        {showDebugControls && (
          <div className="flex gap-2">
            {onEnterSilentMode && (
              <button
                onClick={onEnterSilentMode}
                className="flex-1 px-4 py-2 rounded-xl bg-indigo-500/80 text-white text-xs font-medium backdrop-blur-sm hover:bg-indigo-600/80 transition-colors"
              >
                🤫 Silent Mode
              </button>
            )}
            <button
              onClick={handleToggleSpeaking}
              className={`flex-1 px-4 py-2 rounded-xl text-white text-xs font-medium backdrop-blur-sm transition-colors ${
                isSpeaking
                  ? 'bg-green-500/80 hover:bg-green-600/80'
                  : 'bg-gray-500/80 hover:bg-gray-600/80'
              }`}
            >
              {isSpeaking ? '🔊 Speaking' : '🔇 Silent'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
