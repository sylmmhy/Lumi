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
  /** 启用 session resumption（默认 false，实验性功能） */
  enableSessionResumption?: boolean;
  /** 恢复 session 时使用的 handle（来自之前的 sessionResumptionUpdate） */
  resumptionHandle?: string;
}

export interface GeminiSession {
  sendRealtimeInput: (input: RealtimeInput) => void;
  sendToolResponse: (response: ToolResponse) => void;
  close: () => void;
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
