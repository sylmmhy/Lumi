/**
 * useGeminiSession - Gemini Live Session 生命周期管理
 *
 * 职责：
 * - 管理 WebSocket 连接的建立和断开
 * - 处理 ephemeral token 获取
 * - 提供 session 引用供其他模块使用
 * - 分发服务器消息到各处理器
 *
 * 这是多模态架构的核心，所有媒体流都通过这个 session 发送
 */

import { useState, useRef, useCallback } from 'react';
import {
  GoogleGenAI,
  type LiveServerMessage,
  type Modality,
  type Tool as GeminiTool,
  type FunctionDeclaration
} from '@google/genai';
import type { GeminiSession, GeminiSessionConfig } from '../types';
import { devLog } from '../utils';

// ============================================================================
// Token Fetching
// ============================================================================

/**
 * 独立的 token 获取函数，可以在 connect() 之前预先调用以实现并行加载
 * @param ttl Token 有效期（秒），默认 1800（30分钟）
 * @returns Promise<string> ephemeral token
 */
export async function fetchGeminiToken(ttl: number = 1800): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing');
  }

  devLog('🔑 Fetching ephemeral token from server...');

  const tokenResponse = await fetch(`${supabaseUrl}/functions/v1/gemini-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ ttl }),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    throw new Error(`Failed to get token: ${errorData.error || tokenResponse.statusText}`);
  }

  const { token } = await tokenResponse.json();
  devLog('✅ Ephemeral token received');

  return token;
}

// ============================================================================
// Hook Types
// ============================================================================

interface UseGeminiSessionOptions {
  onMessage?: (message: LiveServerMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
}

interface UseGeminiSessionReturn {
  // State
  isConnected: boolean;
  error: string | null;
  sessionRef: React.MutableRefObject<GeminiSession | null>;

  // Actions
  connect: (
    config?: GeminiSessionConfig,
    prefetchedToken?: string
  ) => Promise<void>;
  disconnect: () => void;

  // Methods
  sendRealtimeInput: (input: {
    media?: { mimeType: string; data: string };
    text?: string;
  }) => void;
  sendToolResponse: (response: {
    functionResponses: Array<{
      id?: string;
      name: string;
      response: Record<string, unknown>;
    }>;
  }) => void;
  /**
   * 发送客户端内容（支持静默注入上下文）
   *
   * 与 sendRealtimeInput 的区别：
   * - sendRealtimeInput: 不会打断 AI，但会触发 AI 响应（VAD 检测后）
   * - sendClientContent + turnComplete=true: 会打断当前生成，会触发响应
   * - sendClientContent + turnComplete=false: 会打断当前生成，但不触发响应（静默注入）
   *
   * @param content - 要注入的文本内容
   * @param turnComplete - 是否触发 AI 响应，默认 false（静默注入）
   * @param role - 消息角色，默认 'user'，可选 'system' 用于注入上下文/记忆
   */
  sendClientContent: (content: string, turnComplete?: boolean, role?: 'user' | 'system') => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGeminiSession(
  options: UseGeminiSessionOptions = {}
): UseGeminiSessionReturn {
  const { onMessage, onConnected, onDisconnected, onError } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const sessionRef = useRef<GeminiSession | null>(null);

  /**
   * 建立 Gemini Live WebSocket 连接
   */
  const connect = useCallback(async (
    config?: GeminiSessionConfig,
    prefetchedToken?: string
  ) => {
    // 防重复连接：只检查 sessionRef（它是立即更新的，不受 React state 批处理影响）
    if (sessionRef.current) {
      devLog('⚠️ Session exists, ignoring connect request');
      return;
    }

    try {
      // 使用预获取的 token 或现场获取
      const token = prefetchedToken || await fetchGeminiToken();

      // Use ephemeral token with v1alpha API (required for ephemeral tokens)
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' }
      });

      const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

      const toolList = config?.tools && config.tools.length > 0
        ? ([{ functionDeclarations: config.tools }] satisfies GeminiTool[])
        : undefined;

      const selectedVoice = config?.voiceName || 'Puck';
      devLog('🎤 Gemini Live 使用声音:', selectedVoice);

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: ['audio'] as unknown as Modality[],
          // 设置 AI 语音
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice,
              },
            },
          },
          // 关闭 thinking 以加快响应速度（实时对话不需要深度思考）
          thinkingConfig: {
            thinkingBudget: config?.enableThinking ? undefined : 0,
          },
          // 🔧 临时关闭 Proactive Audio：避免 AI 说话太频繁
          // 启用 Proactive Audio：模型智能判断何时需要响应
          // proactivity: config?.enableProactiveAudio !== false ? {
          //   proactiveAudio: true,
          // } : undefined,
          proactivity: config?.enableProactiveAudio === true ? {
            proactiveAudio: true,
          } : undefined,
          // 启用语音转录
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // 启用上下文窗口压缩：自动裁剪最早的对话轮次，system instructions 始终保留。
          // 无此配置时音频 session 约 15 分钟被服务端强制终止。
          contextWindowCompression: {
            slidingWindow: {
              targetTokens: '8192',
            },
          },
          // System instruction
          systemInstruction: config?.systemInstruction
            ? { parts: [{ text: config.systemInstruction }] }
            : undefined,
          tools: toolList,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
            devLog('Gemini Live connected');
            onConnected?.();
          },
          onmessage: (message: LiveServerMessage) => {
            onMessage?.(message);
          },
          onerror: (errorEvent: ErrorEvent) => {
            const errorMessage = errorEvent?.message || 'Connection error';
            setError(errorMessage);
            setIsConnected(false);
            onError?.(errorMessage);
          },
          onclose: () => {
            setIsConnected(false);
            devLog('Gemini Live disconnected');
            onDisconnected?.();
          },
        },
      });

      sessionRef.current = session as unknown as GeminiSession;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [onMessage, onConnected, onDisconnected, onError]);

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    devLog('🔌 Disconnecting Gemini Live session...');

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    setIsConnected(false);
    devLog('✅ Gemini Live session disconnected');
  }, []);

  /**
   * 发送实时输入（音频、视频或文本）
   */
  const sendRealtimeInput = useCallback((input: {
    media?: { mimeType: string; data: string };
    text?: string;
  }) => {
    if (sessionRef.current) {
      (sessionRef.current as unknown as {
        sendRealtimeInput: (input: unknown) => void;
      }).sendRealtimeInput(input);
    }
  }, []);

  /**
   * 发送工具调用响应
   */
  const sendToolResponse = useCallback((response: {
    functionResponses: Array<{
      id?: string;
      name: string;
      response: Record<string, unknown>;
    }>;
  }) => {
    if (sessionRef.current) {
      sessionRef.current.sendToolResponse(response);
    }
  }, []);

  /**
   * 发送客户端内容（支持静默注入上下文）
   *
   * 使用 client_content 消息类型，可以：
   * - turnComplete=false: 添加内容到上下文，但不触发 AI 生成（静默注入）
   * - turnComplete=true: 添加内容并触发 AI 响应
   *
   * 根据 Google 官方文档，可以使用 role="system" 来注入上下文/记忆：
   * @see https://cloud.google.com/vertex-ai/generative-ai/docs/live-api/streamed-conversations
   *
   * 注意：client_content 会打断当前正在生成的内容，
   * 因此应该在 AI 说完话后（turnComplete 事件后）再调用
   *
   * @param content - 要注入的文本内容
   * @param turnComplete - 是否触发 AI 响应，默认 false（静默注入）
   * @param role - 消息角色，默认 'user'，可选 'system' 用于注入上下文/记忆
   */
  const sendClientContent = useCallback((content: string, turnComplete = false, role: 'user' | 'system' = 'user') => {
    if (sessionRef.current) {
      // 尝试使用 Gemini SDK 的 sendClientContent 方法
      // @see https://ai.google.dev/api/live#BidiGenerateContentClientContent
      const session = sessionRef.current as unknown as {
        sendClientContent?: (params: {
          turns: Array<{ role: string; parts: Array<{ text: string }> }>;
          turnComplete: boolean;
        }) => void;
        send?: (message: unknown) => void;
      };

      // 优先使用 sendClientContent 方法（新版 SDK）
      if (typeof session.sendClientContent === 'function') {
        session.sendClientContent({
          turns: [
            {
              role,  // 使用传入的 role（'user' 或 'system'）
              parts: [{ text: content }],
            },
          ],
          turnComplete,
        });
      } 
      // 回退到 send 方法（旧版 SDK）
      else if (typeof session.send === 'function') {
        session.send({
          client_content: {
            turns: [
              {
                role,  // 使用传入的 role（'user' 或 'system'）
                parts: [{ text: content }],
              },
            ],
            turn_complete: turnComplete,
          },
        });
      } else {
        console.error('❌ [GeminiSession] 无法发送 client_content: session 没有 sendClientContent 或 send 方法');
        console.log('📋 [GeminiSession] session 可用方法:', Object.keys(sessionRef.current || {}));
        return;
      }

      if (import.meta.env.DEV) {
        console.log(
          `📥 [GeminiSession] sendClientContent (role=${role}, turnComplete=${turnComplete}):`,
          content.substring(0, 60) + (content.length > 60 ? '...' : '')
        );
      }
    }
  }, []);

  return {
    // State
    isConnected,
    error,
    sessionRef,

    // Actions
    connect,
    disconnect,

    // Methods
    sendRealtimeInput,
    sendToolResponse,
    sendClientContent,
  };
}

export type { GeminiSessionConfig, FunctionDeclaration };
