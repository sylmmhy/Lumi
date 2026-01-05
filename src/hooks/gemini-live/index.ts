/**
 * Gemini Live Hook Module
 *
 * 多模态实时对话能力，支持：
 * - 语音输入/输出
 * - 视频输入（摄像头）
 * - 文本输入
 * - 工具调用
 *
 * 使用方式保持不变：
 * ```typescript
 * import { useGeminiLive, fetchGeminiToken } from '@/hooks/gemini-live';
 *
 * const {
 *   isConnected,
 *   isRecording,
 *   isSpeaking,
 *   connect,
 *   disconnect,
 *   toggleMicrophone,
 *   toggleCamera,
 *   // ...
 * } = useGeminiLive({
 *   systemInstruction: '...',
 *   tools: [...],
 *   onToolCall: (toolCall) => { ... },
 * });
 * ```
 */

// Main hook
export { useGeminiLive, fetchGeminiToken } from './useGeminiLive';
export type { GeminiLiveStatus, TranscriptEntry, ToolCallEvent } from './useGeminiLive';

// Sub-hooks (可选导出，用于高级用例)
export { useGeminiSession } from './core/useGeminiSession';
export { useAudioInput } from './media/useAudioInput';
export { useVideoInput } from './media/useVideoInput';
export { useAudioOutput } from './media/useAudioOutput';
export { useTranscript } from './features/useTranscript';
export { useSessionAnalytics } from './features/useSessionAnalytics';

// Types
export type {
  GeminiSessionConfig,
  GeminiSession,
  RealtimeInput,
  ToolResponse,
  FunctionCall,
  ToolCall,
  SessionStats,
  GeminiLiveCallbacks,
  UseGeminiLiveOptions,
  MessageHandlerContext,
} from './types';

// Utils
export { base64ToArrayBuffer, isThinkingContent, devLog, devWarn, devError } from './utils';

// Message handlers
export { handleServerContent, createMessageHandler } from './core/messageHandlers';
