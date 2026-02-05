/**
 * Hooks 统一导出
 *
 * 使用方式：
 * import { useAuth, useTaskTimer } from '../hooks';
 */

// 认证相关
export { useAuth } from './useAuth';
export type { AuthState, UseAuthOptions } from './useAuth';

// 计时器
export { useTaskTimer } from './useTaskTimer';
export type { UseTaskTimerOptions } from './useTaskTimer';

// 虚拟消息
export { useVirtualMessages } from './useVirtualMessages';
export type { UseVirtualMessagesOptions, VirtualMessageCategory } from './useVirtualMessages';

// 波形动画
export { useWaveformAnimation } from './useWaveformAnimation';
export type { UseWaveformAnimationOptions } from './useWaveformAnimation';

// 庆祝动画（独立文件）
export { useCelebrationAnimation } from './useCelebrationAnimation';
export type { 
  UseCelebrationAnimationOptions, 
  CelebrationAnimationState,
  SuccessScene 
} from './useCelebrationAnimation';

// Gemini Live (原有)
export { useGeminiLive } from './useGeminiLive';
export type { GeminiLiveStatus } from './useGeminiLive';

// 语音活动检测 (原有)
export { useVoiceActivityDetection } from './useVoiceActivityDetection';

// AI 教练会话（组合层）
export { useAICoachSession } from './useAICoachSession';
export type { 
  UseAICoachSessionOptions, 
  AICoachSessionState, 
  AICoachMessage 
} from './useAICoachSession';

// 助眠音乐
export { useSleepMusic } from './useSleepMusic';
export type {
  SleepMusicState,
  SleepMusicTrack,
  SleepMusicTrackId,
} from './useSleepMusic';

// Screen Time（应用锁定）
export { useScreenTime, isIOSNativeApp } from './useScreenTime';
export type { ScreenTimeStatus } from './useScreenTime';

// 语音识别
export { useSpeechRecognition } from './useSpeechRecognition';
export type {
  SpeechRecognitionResult,
  UseSpeechRecognitionOptions,
  UseSpeechRecognitionReturn,
} from './useSpeechRecognition';
