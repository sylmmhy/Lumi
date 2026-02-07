/**
 * useGeminiLive - Gemini Live 多模态对话 Hook（组合器）
 *
 * 这是主入口 hook，组合所有子模块：
 * - useGeminiSession: WebSocket 连接管理
 * - useAudioInput: 麦克风录制
 * - useVideoInput: 摄像头捕获
 * - useAudioOutput: 音频播放
 * - useTranscript: 转录管理
 * - useSessionAnalytics: 埋点追踪
 *
 * 保持原有 API 兼容，调用方无需修改
 */

import { useCallback, useEffect, useRef } from 'react';
import type { LiveServerMessage, FunctionDeclaration } from '@google/genai';

// Core
import { useGeminiSession, fetchGeminiToken } from './core/useGeminiSession';
import { handleServerContent } from './core/messageHandlers';

// Media
import { useAudioInput } from './media/useAudioInput';
import { useVideoInput } from './media/useVideoInput';
import { useAudioOutput } from './media/useAudioOutput';
import { useVideoFrameBuffer } from './media/useVideoFrameBuffer';

// Features
import { useTranscript } from './features/useTranscript';
import { useSessionAnalytics } from './features/useSessionAnalytics';

// Types
import type { ToolCall, ToolCallEvent, TranscriptEntry } from './types';
import { devLog } from './utils';

// ============================================================================
// Types
// ============================================================================

export type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseGeminiLiveOptions {
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
  onTranscriptUpdate?: (transcript: TranscriptEntry[]) => void;
  onMessage?: (message: LiveServerMessage) => void;
  onTurnComplete?: () => void;
  onToolCall?: (toolCall: ToolCallEvent) => void;
  enableCamera?: boolean;
  enableMicrophone?: boolean;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useGeminiLive(options: UseGeminiLiveOptions = {}) {
  const {
    systemInstruction,
    tools,
    onTranscriptUpdate,
    onMessage,
    onTurnComplete,
    onToolCall,
    enableCamera = false,
    enableMicrophone = false,
  } = options;

  // ============================================================================
  // Sub-hooks
  // ============================================================================

  // Analytics (must be first to track initial state)
  const analytics = useSessionAnalytics();

  // Audio output (for playing AI responses)
  const audioOutput = useAudioOutput({
    onPlaybackComplete: () => {
      // 可以在这里添加播放完成的逻辑
    },
  });

  // Transcript management
  const transcriptManager = useTranscript({
    onUpdate: onTranscriptUpdate,
  });

  // Refs for callbacks (避免闭包问题)
  const onTurnCompleteRef = useRef<(() => void) | null>(onTurnComplete ?? null);
  const onToolCallRef = useRef<((toolCall: ToolCallEvent) => void) | null>(onToolCall ?? null);

  useEffect(() => {
    onTurnCompleteRef.current = onTurnComplete ?? null;
  }, [onTurnComplete]);

  useEffect(() => {
    onToolCallRef.current = onToolCall ?? null;
  }, [onToolCall]);

  // 追踪最后一次 turnComplete 的时间，用于判断安全注入窗口
  // 必须在 useGeminiSession 之前定义，因为 onTurnComplete 回调需要访问这些 refs
  const lastTurnCompleteTimeRef = useRef<number>(0);
  // 追踪 AI 是否正在说话（同步版，用于安全窗口判断）
  const isSpeakingRef = useRef<boolean>(false);

  // Session management (core)
  const session = useGeminiSession({
    onMessage: (message: LiveServerMessage) => {
      // 调用外部消息处理器
      onMessage?.(message);

      // 使用消息处理器处理服务器内容
      if (message.serverContent) {
        handleServerContent(message, {
          onInterrupt: () => {
            audioOutput.stop();
          },
          onTurnComplete: () => {
            audioOutput.markTurnComplete();  // 重置 isSpeaking 状态（异步）
            isSpeakingRef.current = false;  // 立即同步更新 ref，确保安全窗口判断正确
            lastTurnCompleteTimeRef.current = Date.now();  // 记录 turnComplete 时间，用于安全注入窗口
            onTurnCompleteRef.current?.();
          },
          onInputTranscription: (text: string) => {
            transcriptManager.addUserEntry(text);
          },
          onOutputTranscription: (text: string) => {
            transcriptManager.addAssistantEntry(text);
          },
          onToolCall: (toolCall: ToolCall) => {
            devLog('🔧 Tool call received:', toolCall);

            if (toolCall?.functionCalls && toolCall.functionCalls.length > 0) {
              const functionCall = toolCall.functionCalls[0];
              const functionName = functionCall.name;
              const args = functionCall.args;

              devLog('📞 Function called:', functionName, args);

              if (onToolCallRef.current) {
                onToolCallRef.current({ functionName, args });
              }

              // Send function response back to AI
              session.sendToolResponse({
                functionResponses: [
                  {
                    id: functionCall.id,
                    name: functionName,
                    response: { success: true },
                  },
                ],
              });
            }
          },
          onAudioData: async (data: string) => {
            try {
              await audioOutput.ensureReady();
              audioOutput.playAudio(data);
            } catch (err) {
              devLog('⚠️ Audio playback error:', err);
            }
          },
          onTextContent: (text: string) => {
            transcriptManager.addAssistantEntry(text);
          },
          session: session.sessionRef.current,
        });
      }
    },
    onConnected: () => {
      analytics.trackConnect();
    },
    onDisconnected: () => {
      // Cleanup handled in disconnect
    },
    onError: (error: string) => {
      devLog('Session error:', error);
    },
  });

  // Audio input (microphone)
  // 解构出稳定的字段，避免依赖整个对象导致 useCallback/useEffect 重复触发
  const audioInput = useAudioInput({
    onAudioData: (base64Audio: string) => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio,
        },
      });
    },
    onError: (error: string) => {
      devLog('Audio input error:', error);
    },
  });
  const {
    isRecording: audioIsRecording,
    start: audioStart,
    stop: audioStop,
    error: audioError,
    audioStream,
  } = audioInput;

  // Video frame buffer (环形缓冲区，保存最近 10 帧用于任务验证)
  const frameBuffer = useVideoFrameBuffer({ maxFrames: 10 });

  // Video input (camera)
  // 解构出稳定的字段，避免依赖整个对象导致 useCallback/useEffect 重复触发
  const videoInput = useVideoInput({
    onVideoFrame: (base64Jpeg: string) => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Jpeg,
        },
      });
      // 同时存入帧缓冲区，供任务完成时视觉验证使用
      frameBuffer.addFrame(base64Jpeg);
    },
    onError: (error: string) => {
      devLog('Video input error:', error);
    },
  });
  const {
    isEnabled: videoIsEnabled,
    start: videoStart,
    stop: videoStop,
    error: videoError,
    videoStream,
    videoRef,
    canvasRef,
    startFrameCapture,
    stopFrameCapture,
  } = videoInput;

  // ============================================================================
  // Composed Actions
  // ============================================================================

  /**
   * 连接 Gemini Live
   * @param customSystemInstruction - 自定义系统指令
   * @param customTools - 自定义工具列表
   * @param prefetchedToken - 预获取的 Gemini token
   * @param voiceName - AI 声音名称（如 'Puck', 'Kore'）
   */
  const connect = useCallback(async (
    customSystemInstruction?: string,
    customTools?: FunctionDeclaration[],
    prefetchedToken?: string,
    voiceName?: string
  ) => {
    // 重置统计
    analytics.resetStats();

    // 预初始化 AudioContext（必须在用户交互上下文中）
    devLog('🔊 Pre-initializing AudioContext...');
    await audioOutput.ensureReady();
    devLog('✅ AudioContext ready');

    // 建立连接
    await session.connect(
      {
        systemInstruction: customSystemInstruction || systemInstruction,
        tools: customTools || tools,
        voiceName,
      },
      prefetchedToken
    );
  }, [systemInstruction, tools, session, audioOutput, analytics]);

  /**
   * 立即停止音频播放（不断开连接）
   * 用于快速响应用户挂断操作，立即静音 AI
   */
  const stopAudio = useCallback(() => {
    devLog('🔇 Stopping audio playback immediately...');
    audioOutput.stop();
  }, [audioOutput]);

  /**
   * 断开连接并清理所有资源
   */
  const disconnect = useCallback(() => {
    devLog('🔌 Disconnecting Gemini Live...');

    // 埋点
    analytics.trackDisconnect();

    // 关闭 session
    session.disconnect();

    // 停止麦克风
    audioStop();

    // 停止摄像头
    videoStop();

    // 清理音频输出
    audioOutput.cleanup();

    devLog('✅ Gemini Live disconnected and cleaned up');
  }, [session, audioStop, videoStop, audioOutput, analytics]);

  /**
   * 切换麦克风
   * 使用解构的稳定字段作为依赖，避免每次渲染都重建函数
   */
  const toggleMicrophone = useCallback(async () => {
    if (audioIsRecording) {
      audioStop();
      analytics.trackMicToggle(false);
    } else {
      // 确保 AudioContext 已准备（会等待 iOS 音频会话就绪）
      await audioOutput.ensureReady();
      await audioStart();
      analytics.trackMicToggle(true);
    }
  }, [audioIsRecording, audioStart, audioStop, audioOutput, analytics]);

  /**
   * 切换摄像头
   * 使用解构的稳定字段作为依赖，避免每次渲染都重建函数
   */
  const toggleCamera = useCallback(async () => {
    if (videoIsEnabled) {
      videoStop();
      analytics.trackCameraToggle(false);
    } else {
      // 确保 AudioContext 已准备（会等待 iOS 音频会话就绪）
      await audioOutput.ensureReady();
      await videoStart();
      analytics.trackCameraToggle(true);
    }
  }, [videoIsEnabled, videoStart, videoStop, audioOutput, analytics]);

  // 解构出需要的 session 字段，避免在 Hook deps 中依赖整个 session 对象
  const sessionIsConnected = session.isConnected;
  const sendRealtimeInput = session.sendRealtimeInput;
  const sendClientContent = session.sendClientContent;

  /**
   * 发送文本消息
   * 注意：使用 session.isConnected 和 session.sendRealtimeInput 作为依赖
   * 而不是整个 session 对象，避免因对象引用变化导致函数频繁重建
   */
  const sendTextMessage = useCallback((text: string) => {
    if (sessionIsConnected) {
      sendRealtimeInput({ text });
      if (import.meta.env.DEV) {
        console.log('📤 [GeminiLive] 发送文本:', text.substring(0, 60) + (text.length > 60 ? '...' : ''));
      }
    } else if (import.meta.env.DEV) {
      console.warn('⚠️ [GeminiLive] 发送失败: 连接已断开');
    }
  }, [sessionIsConnected, sendRealtimeInput]);

  // 同步 isSpeaking 状态到 ref（当 AI 开始说话时更新）
  useEffect(() => {
    if (audioOutput.isSpeaking) {
      isSpeakingRef.current = true;
    }
    // 注意：isSpeaking = false 的情况在 onTurnComplete 回调中立即处理，不依赖这个 effect
  }, [audioOutput.isSpeaking]);

  /**
   * 静默注入上下文到对话中（不触发 AI 响应）
   *
   * 这是方案 A 的核心实现：
   * - 使用 sendClientContent + turn_complete=false 静默注入
   * - 只在安全窗口期（AI 说完话后、用户开始说话前）注入
   * - 注入的内容会被 AI 记住，在下次回复时自然引用
   *
   * @param content - 要注入的上下文内容（如 [CONTEXT] 消息）
   * @param options - 配置选项
   * @returns boolean - 是否成功注入
   */
  const injectContextSilently = useCallback((
    content: string,
    options: {
      /** 是否强制注入（忽略安全窗口检查） */
      force?: boolean;
      /** 安全窗口期（毫秒），AI 说完话后多久内可以注入，默认 5000ms */
      safeWindowMs?: number;
    } = {}
  ): boolean => {
    const { force = false, safeWindowMs = 5000 } = options;

    if (!sessionIsConnected) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ [GeminiLive] 静默注入失败: 连接已断开');
      }
      return false;
    }

    // 检查是否在安全窗口期
    if (!force) {
      const now = Date.now();
      const timeSinceTurnComplete = now - lastTurnCompleteTimeRef.current;

      // 如果 AI 正在说话，不注入
      if (isSpeakingRef.current) {
        if (import.meta.env.DEV) {
          console.log('⏸️ [GeminiLive] 静默注入延迟: AI 正在说话');
        }
        return false;
      }

      // 如果距离上次 turnComplete 太久，可能用户已经在说话了，不注入
      if (lastTurnCompleteTimeRef.current > 0 && timeSinceTurnComplete > safeWindowMs) {
        if (import.meta.env.DEV) {
          console.log(`⏸️ [GeminiLive] 静默注入延迟: 超出安全窗口 (${timeSinceTurnComplete}ms > ${safeWindowMs}ms)`);
        }
        return false;
      }
    }

    // 执行静默注入（sendClientContent 返回 void，所以我们用 try-catch 处理错误）
    try {
      sendClientContent(content, false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ [GeminiLive] 静默注入失败:', error);
      }
      return false;
    }

    if (import.meta.env.DEV) {
      console.log('🔇 [GeminiLive] 静默注入上下文:', content.substring(0, 80) + (content.length > 80 ? '...' : ''));
    }

    return true;
  }, [sessionIsConnected, sendClientContent]);

  /**
   * 设置 onTurnComplete 回调
   */
  const setOnTurnComplete = useCallback((handler: (() => void) | null | undefined) => {
    onTurnCompleteRef.current = handler ?? null;
  }, []);

  // ============================================================================
  // Auto-enable Effects
  // 使用解构的稳定字段作为依赖，避免每次渲染都触发 effect
  // ============================================================================

  // 连接后自动启用摄像头
  useEffect(() => {
    if (session.isConnected && enableCamera && !videoIsEnabled) {
      queueMicrotask(() => {
        toggleCamera();
      });
    }
  }, [session.isConnected, enableCamera, videoIsEnabled, toggleCamera]);

  // 连接后自动启用麦克风
  useEffect(() => {
    if (session.isConnected && enableMicrophone && !audioIsRecording) {
      queueMicrotask(() => {
        toggleMicrophone();
      });
    }
  }, [session.isConnected, enableMicrophone, audioIsRecording, toggleMicrophone]);

  // 连接后开始视频帧捕获
  useEffect(() => {
    if (session.isConnected && videoIsEnabled) {
      startFrameCapture();
    } else {
      stopFrameCapture();
    }
  }, [session.isConnected, videoIsEnabled, startFrameCapture, stopFrameCapture]);

  // ============================================================================
  // Return (保持原有 API 兼容)
  // ============================================================================

  return {
    // State
    isConnected: session.isConnected,
    isRecording: audioIsRecording,
    isSpeaking: audioOutput.isSpeaking,
    // 合并所有错误，避免丢失信息
    error: [session.error, audioError, videoError].filter(Boolean).join('; ') || null,
    transcript: transcriptManager.transcript,
    cameraEnabled: videoIsEnabled,
    videoStream,
    audioStream,

    // Actions
    connect,
    disconnect,
    stopAudio,
    toggleMicrophone,
    toggleCamera,
    sendTextMessage,
    setOnTurnComplete,

    // Context injection (方案 A: turnComplete 后静默注入)
    injectContextSilently,
    sendClientContent: session.sendClientContent,

    // Frame buffer (任务完成时抓取最近帧用于视觉验证)
    getRecentFrames: frameBuffer.getRecentFrames,

    // Refs for UI
    videoRef,
    canvasRef,
  };
}

// Re-export for convenience
export { fetchGeminiToken };
export type { TranscriptEntry, ToolCallEvent };
