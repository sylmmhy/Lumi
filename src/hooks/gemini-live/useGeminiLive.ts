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
            audioOutput.markTurnComplete();  // 重置 isSpeaking 状态
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
      // 确保 AudioContext 已准备
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
      await audioOutput.ensureReady();
      await videoStart();
      analytics.trackCameraToggle(true);
    }
  }, [videoIsEnabled, videoStart, videoStop, audioOutput, analytics]);

  /**
   * 发送文本消息
   * 注意：使用 session.isConnected 和 session.sendRealtimeInput 作为依赖
   * 而不是整个 session 对象，避免因对象引用变化导致函数频繁重建
   */
  const sendTextMessage = useCallback((text: string) => {
    if (session.isConnected) {
      session.sendRealtimeInput({ text });
      if (import.meta.env.DEV) {
        console.log('📤 [GeminiLive] 发送文本:', text.substring(0, 60) + (text.length > 60 ? '...' : ''));
      }
    } else if (import.meta.env.DEV) {
      console.warn('⚠️ [GeminiLive] 发送失败: 连接已断开');
    }
  }, [session.isConnected, session.sendRealtimeInput]);

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
    toggleMicrophone,
    toggleCamera,
    sendTextMessage,
    setOnTurnComplete,

    // Refs for UI
    videoRef,
    canvasRef,
  };
}

// Re-export for convenience
export { fetchGeminiToken };
export type { TranscriptEntry, ToolCallEvent };
