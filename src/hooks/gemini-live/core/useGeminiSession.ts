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

/** Session resumption handle 的最大有效时长（2 小时） */
const HANDLE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface UseGeminiSessionOptions {
  onMessage?: (message: LiveServerMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  /** 获取对话上下文摘要（用于 session resumption 重连后注入） */
  getConversationContext?: () => string | null;
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
  /**
   * 使用 session resumption 重连（关闭当前连接，用新 systemInstruction + 保存的 handle 重连）
   * 如果 handle 过期（>2h）或不存在，则回退到全新连接。
   */
  reconnectWithResumption: (
    newConfig: GeminiSessionConfig,
    prefetchedToken?: string,
  ) => Promise<void>;

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
  /** 获取当前保存的 session resumption handle（如果有） */
  resumptionHandle: string | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGeminiSession(
  options: UseGeminiSessionOptions = {}
): UseGeminiSessionReturn {
  const { onMessage, onConnected, onDisconnected, onError, getConversationContext } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const sessionRef = useRef<GeminiSession | null>(null);

  // Session resumption refs
  const resumptionHandleRef = useRef<string | null>(null);
  const resumptionHandleTimestampRef = useRef<number>(0);
  const lastConfigRef = useRef<GeminiSessionConfig | undefined>(undefined);
  const getConversationContextRef = useRef(getConversationContext);
  getConversationContextRef.current = getConversationContext;
  /** true 表示用户主动断开（不触发自动恢复） */
  const intentionalDisconnectRef = useRef(false);
  /** 防止并发恢复 */
  const isRecoveringRef = useRef(false);

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

    intentionalDisconnectRef.current = false;

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

      // 保存配置供 reconnectWithResumption 使用
      lastConfigRef.current = config;

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
          // 🔧 配置 VAD（语音活动检测）以减少误触发 interrupted 信号
          // 降低灵敏度，避免环境噪音被误判为"用户说话"导致 AI 回复被中断
          realtimeInputConfig: {
            automaticActivityDetection: {
              // 降低开始说话的灵敏度（减少误触发）
              startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
              // 降低结束说话的灵敏度（允许用户有更长的停顿）
              endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
              // 需要 1 秒沉默才认为用户停止说话（默认约 500ms）
              silenceDurationMs: 1000,
            },
          },
          // 启用上下文窗口压缩：自动裁剪最早的对话轮次，system instructions 始终保留。
          // 无此配置时音频 session 约 15 分钟被服务端强制终止。
          contextWindowCompression: {
            slidingWindow: {
              targetTokens: '8192',
            },
          },
          // Session resumption（默认关闭，由 feature flag 控制）
          sessionResumption: config?.enableSessionResumption
            ? { handle: config.resumptionHandle || undefined }
            : undefined,
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
            // Session resumption: 保存 handle
            if (message.sessionResumptionUpdate) {
              const update = message.sessionResumptionUpdate;
              if (update.resumable && update.newHandle) {
                resumptionHandleRef.current = update.newHandle;
                resumptionHandleTimestampRef.current = Date.now();
                devLog('🔄 [Session] resumption handle 已保存');
              }
            }
            onMessage?.(message);
          },
          onerror: (errorEvent: ErrorEvent) => {
            const errorMessage = errorEvent?.message || 'Connection error';
            setError(errorMessage);
            setIsConnected(false);
            onError?.(errorMessage);
          },
          onclose: (closeEvent: CloseEvent) => {
            sessionRef.current = null;
            setIsConnected(false);

            const code = closeEvent?.code ?? 0;
            devLog(`Gemini Live disconnected (code=${code})`);
            onDisconnected?.();

            // 自动恢复：非预期断开（1008/1011）且不是用户主动断开
            const unexpectedCodes = [1008, 1011];
            if (
              unexpectedCodes.includes(code) &&
              !intentionalDisconnectRef.current &&
              !isRecoveringRef.current &&
              lastConfigRef.current?.enableSessionResumption
            ) {
              isRecoveringRef.current = true;
              const recoveryStart = Date.now();
              devLog(`🔄 [Session] 非预期断开 (code=${code})，尝试自动恢复...`);

              // 异步恢复：尝试 resumption，失败则全新连接
              (async () => {
                try {
                  const savedConfig = lastConfigRef.current!;
                  const handle = resumptionHandleRef.current;
                  const handleAge = Date.now() - resumptionHandleTimestampRef.current;
                  const handleValid = handle && handleAge < HANDLE_MAX_AGE_MS;

                  if (handleValid) {
                    // 主路径：使用 session resumption 重连
                    devLog('🔄 [Session] 尝试 resumption 重连...');
                    const token = await fetchGeminiToken();
                    await connect(
                      { ...savedConfig, resumptionHandle: handle },
                      token,
                    );
                  } else {
                    // 回退：全新连接
                    devLog('🔄 [Session] handle 无效，回退到全新连接...');
                    resumptionHandleRef.current = null;
                    const token = await fetchGeminiToken();
                    await connect(savedConfig, token);
                  }

                  const elapsed = Date.now() - recoveryStart;
                  devLog(`🔄 [Session] 恢复成功 (${elapsed}ms)`);

                  // 注入对话上下文
                  const contextFn = getConversationContextRef.current;
                  if (contextFn) {
                    const ctx = contextFn();
                    if (ctx && sessionRef.current) {
                      setTimeout(() => {
                        if (sessionRef.current) {
                          sendClientContent(ctx, false, 'system');
                          devLog('🔄 [Session] 恢复后注入对话上下文');
                        }
                      }, 500);
                    }
                  }
                } catch (recoverError) {
                  const elapsed = Date.now() - recoveryStart;
                  console.error(`❌ [Session] 恢复失败 (${elapsed}ms):`, recoverError);
                  onError?.(recoverError instanceof Error ? recoverError.message : 'Recovery failed');
                } finally {
                  isRecoveringRef.current = false;
                }
              })();
            }
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
    intentionalDisconnectRef.current = true;

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

  /**
   * 使用 session resumption 重连。
   * 关闭当前连接，用新 config + 保存的 handle 重连。
   * 如果 handle 过期（>2h）或不存在，回退到全新连接。
   * 重连后注入对话上下文摘要（如果 getConversationContext 提供了）。
   */
  const reconnectWithResumption = useCallback(async (
    newConfig: GeminiSessionConfig,
    prefetchedToken?: string,
  ) => {
    devLog('🔄 [Session] reconnectWithResumption 开始');

    // 1. 关闭当前连接
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setIsConnected(false);

    // 2. 检查 handle 是否有效（存在且未过期）
    const handle = resumptionHandleRef.current;
    const handleAge = Date.now() - resumptionHandleTimestampRef.current;
    const handleValid = handle && handleAge < HANDLE_MAX_AGE_MS;

    if (!handleValid) {
      devLog(`🔄 [Session] handle ${handle ? '已过期' : '不存在'}，回退到全新连接`);
      resumptionHandleRef.current = null;
    }

    // 3. 重连（带或不带 handle）
    const configWithResumption: GeminiSessionConfig = {
      ...newConfig,
      enableSessionResumption: newConfig.enableSessionResumption,
      resumptionHandle: handleValid ? handle : undefined,
    };

    await connect(configWithResumption, prefetchedToken);

    // 4. 重连成功后注入对话上下文
    const contextFn = getConversationContextRef.current;
    if (contextFn) {
      const context = contextFn();
      if (context) {
        // 短暂延迟确保连接建立
        setTimeout(() => {
          if (sessionRef.current) {
            sendClientContent(context, false, 'system');
            devLog('🔄 [Session] 对话上下文已注入');
          }
        }, 500);
      }
    }
  }, [connect, sendClientContent]);

  return {
    // State
    isConnected,
    error,
    sessionRef,

    // Actions
    connect,
    disconnect,
    reconnectWithResumption,

    // Methods
    sendRealtimeInput,
    sendToolResponse,
    sendClientContent,
    resumptionHandle: resumptionHandleRef.current,
  };
}

export type { GeminiSessionConfig, FunctionDeclaration };
