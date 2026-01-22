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
import type { GeminiSession, GeminiSessionConfig, ClientContent } from '../types';
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
  sendClientContent: (content: ClientContent) => void;
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
    // 防重复连接：如果已连接或正在连接，直接返回
    if (isConnected || sessionRef.current) {
      devLog('⚠️ Already connected or session exists, ignoring connect request');
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

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: ['audio'] as unknown as Modality[],
          // 设置 AI 语音
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config?.voiceName || 'Puck',
              },
            },
          },
          // 关闭 thinking 以加快响应速度（实时对话不需要深度思考）
          thinkingConfig: {
            thinkingBudget: config?.enableThinking ? undefined : 0,
          },
          // 启用 Proactive Audio：模型智能判断何时需要响应
          proactivity: config?.enableProactiveAudio !== false ? {
            proactiveAudio: true,
          } : undefined,
          // 启用语音转录
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
            // 🔧 确保连接断开时同步清空 sessionRef
            sessionRef.current = null;
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
  }, [isConnected, onMessage, onConnected, onDisconnected, onError]);

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
   * 发送 Client Content（支持 user/system role）
   * 
   * 这个方法有两个主要用途：
   * 1. 发送 user role 消息：作为用户输入进入对话上下文
   * 2. 发送 system role 消息：中途更新 System Instruction（不占用对话 token）
   * 
   * @param content - ClientContent 对象
   * 
   * @example
   * // 中途更新 System Instruction（用于语气切换）
   * sendClientContent({
   *   turns: {
   *     role: 'system',
   *     parts: [{ text: '从现在开始使用严厉直接的语气督促用户' }]
   *   },
   *   turnComplete: true
   * });
   * 
   * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session
   */
  const sendClientContent = useCallback((content: ClientContent) => {
    if (sessionRef.current) {
      // @google/genai SDK 的 session 对象原生支持 sendClientContent 方法
      (sessionRef.current as unknown as {
        sendClientContent: (content: ClientContent) => void;
      }).sendClientContent(content);
      
      if (import.meta.env.DEV) {
        const turns = Array.isArray(content.turns) ? content.turns : [content.turns];
        const role = turns[0]?.role || 'unknown';
        devLog(`📤 sendClientContent (role: ${role})`);
      }
    } else if (import.meta.env.DEV) {
      devLog('⚠️ sendClientContent failed: session not connected');
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
