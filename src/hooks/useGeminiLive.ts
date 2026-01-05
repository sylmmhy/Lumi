/**
 * useGeminiLive - Re-export from refactored module
 *
 * 此文件保持向后兼容性，实际实现已迁移到 ./gemini-live/ 目录
 *
 * 新的模块化架构：
 * - ./gemini-live/core/useGeminiSession.ts - Session 管理
 * - ./gemini-live/media/useAudioInput.ts - 麦克风录制
 * - ./gemini-live/media/useVideoInput.ts - 摄像头捕获
 * - ./gemini-live/media/useAudioOutput.ts - 音频播放
 * - ./gemini-live/features/useTranscript.ts - 转录管理
 * - ./gemini-live/features/useSessionAnalytics.ts - 埋点追踪
 */

export {
  useGeminiLive,
  fetchGeminiToken,
  type GeminiLiveStatus,
  type TranscriptEntry,
  type ToolCallEvent,
} from './gemini-live';
