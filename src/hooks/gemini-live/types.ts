/**
 * Gemini Live API Types
 *
 * 核心类型定义，保持多模态架构的完整性
 */

import type { LiveServerMessage, FunctionDeclaration } from '@google/genai';

// ============================================================================
// Session Types
// ============================================================================

export type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GeminiSessionConfig {
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
  voiceName?: string;
  enableThinking?: boolean;
  enableProactiveAudio?: boolean;
}

export interface GeminiSession {
  sendRealtimeInput: (input: RealtimeInput) => void;
  sendToolResponse: (response: ToolResponse) => void;
  sendClientContent: (content: ClientContent) => void;
  close: () => void;
}

// ============================================================================
// Client Content Types（用于中途更新 System Instruction）
// ============================================================================

/**
 * Client Content 消息格式
 * 
 * 用于向 Gemini Live 发送离散的对话轮次或更新系统指令。
 * 这是 Gemini Live API 官方支持的功能，可以在会话中途更新系统指令。
 * 
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session
 * 
 * @example
 * // 发送 user 消息（会进入对话上下文）
 * { turns: { role: 'user', parts: [{ text: '你好' }] }, turnComplete: true }
 * 
 * @example
 * // 中途更新 system instruction（不占用对话 token）
 * { turns: { role: 'system', parts: [{ text: '使用严厉语气' }] }, turnComplete: true }
 */
export interface ClientContent {
  /** 对话轮次，可以是单个或数组 */
  turns: ClientContentTurn | ClientContentTurn[];
  /** 是否标记为轮次完成，默认 true */
  turnComplete?: boolean;
}

/**
 * 对话轮次
 */
export interface ClientContentTurn {
  /** 
   * 角色类型
   * - 'user': 用户消息（会进入对话上下文，占用 token）
   * - 'system': 系统指令（更新 system instruction，不占用对话 token，对剩余会话持久生效）
   */
  role: 'user' | 'system';
  /** 消息内容 */
  parts: Array<{ text: string }>;
}

// ============================================================================
// Input/Output Types
// ============================================================================

export interface RealtimeInput {
  media?: {
    mimeType: string;
    data: string;
  };
  text?: string;
}

export interface ToolResponse {
  functionResponses: Array<{
    id?: string;
    name: string;
    response: Record<string, unknown>;
  }>;
}

// ============================================================================
// Transcript Types
// ============================================================================

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

// ============================================================================
// Tool Call Types
// ============================================================================

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface ToolCall {
  functionCalls: FunctionCall[];
}

export interface ToolCallEvent {
  functionName: string;
  args: Record<string, unknown>;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface SessionStats {
  micEnabledCount: number;
  micDisabledCount: number;
  cameraEnabledCount: number;
  cameraDisabledCount: number;
  micWasEnabled: boolean;
  cameraWasEnabled: boolean;
}

// ============================================================================
// Callback Types
// ============================================================================

export interface GeminiLiveCallbacks {
  onTranscriptUpdate?: (transcript: TranscriptEntry[]) => void;
  onMessage?: (message: LiveServerMessage) => void;
  onTurnComplete?: () => void;
  onToolCall?: (toolCall: ToolCallEvent) => void;
}

// ============================================================================
// Hook Options
// ============================================================================

export interface UseGeminiLiveOptions extends GeminiLiveCallbacks {
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
  enableCamera?: boolean;
  enableMicrophone?: boolean;
}

// ============================================================================
// Message Handler Types
// ============================================================================

export interface MessageHandlerContext {
  onInterrupt: () => void;
  onTurnComplete: () => void;
  onInputTranscription: (text: string) => void;
  onOutputTranscription: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onAudioData: (data: string) => void;
  onTextContent: (text: string) => void;
  session: GeminiSession | null;
}
