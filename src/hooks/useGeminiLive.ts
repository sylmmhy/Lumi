import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, type LiveServerMessage, type Modality, type FunctionDeclaration, type Tool as GeminiTool } from '@google/genai';
import { AudioRecorder } from '../lib/audio-recorder';
import { AudioStreamer } from '../lib/audio-streamer';
import { DEFAULT_CAMERA_FRAME_RATE, DEFAULT_CAMERA_RESOLUTION } from '../constants/media';
import { trackEvent } from '../lib/amplitude';

export type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

interface ToolCall {
  functionCalls: FunctionCall[];
}

interface UseGeminiLiveOptions {
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
  onTranscriptUpdate?: (transcript: Array<{ role: 'user' | 'assistant'; text: string }>) => void;
  onMessage?: (message: LiveServerMessage) => void;
  onTurnComplete?: () => void;
  onToolCall?: (toolCall: { functionName: string; args: Record<string, unknown> }) => void;
  enableCamera?: boolean;
  enableMicrophone?: boolean;
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

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

  if (import.meta.env.DEV) {
    console.log('🔑 Fetching ephemeral token from server...');
  }

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
  if (import.meta.env.DEV) {
    console.log('✅ Ephemeral token received');
  }

  return token;
}

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

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  // Refs
  const sessionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onTurnCompleteRef = useRef<(() => void) | null>(onTurnComplete ?? null);

  // Analytics tracking refs
  const sessionStartTimeRef = useRef<number | null>(null);
  const micEnabledRef = useRef(false); // 实时追踪麦克风状态
  const cameraEnabledRef = useRef(false); // 实时追踪摄像头状态
  const sessionStatsRef = useRef({
    micEnabledCount: 0,
    micDisabledCount: 0,
    cameraEnabledCount: 0,
    cameraDisabledCount: 0,
    micWasEnabled: false,
    cameraWasEnabled: false,
  });

  useEffect(() => {
    onTurnCompleteRef.current = onTurnComplete ?? null;
  }, [onTurnComplete]);

  const setOnTurnComplete = useCallback((handler: (() => void) | null | undefined) => {
    onTurnCompleteRef.current = handler ?? null;
  }, []);

  // Initialize audio context and streamer
  const getOrCreateAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioStreamerRef.current = new AudioStreamer(audioContextRef.current);
      if (import.meta.env.DEV) {
        console.log('AudioContext created:', audioContextRef.current.state);
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
      if (import.meta.env.DEV) {
        console.log('AudioContext resumed:', audioContextRef.current.state);
      }
    }
    return audioContextRef.current;
  }, []);

  // Handle incoming server messages
  const handleServerMessage = useCallback(
    async (message: LiveServerMessage) => {
      // Call custom message handler if provided
      if (onMessage) {
        onMessage(message);
      }

      if (message.serverContent) {
        const { serverContent } = message;

        // Handle interruption
        if ('interrupted' in serverContent) {
          audioStreamerRef.current?.stop();
          setIsSpeaking(false);
          return;
        }

        // Handle turn complete
        if ('turnComplete' in serverContent) {
          setIsSpeaking(false);
          onTurnCompleteRef.current?.();
        }

        // Handle user input audio transcription (用户语音转文字)
        if ('inputTranscription' in serverContent && serverContent.inputTranscription) {
          const transcription = serverContent.inputTranscription as { text?: string };
          if (transcription.text) {
            setTranscript((prev) => {
              const newTranscript = [...prev, { role: 'user' as const, text: transcription.text! }];
              if (onTranscriptUpdate) {
                onTranscriptUpdate(newTranscript);
              }
              return newTranscript;
            });
          }
        }

        // Handle AI output audio transcription (AI 语音转文字)
        if ('outputTranscription' in serverContent && serverContent.outputTranscription) {
          const transcription = serverContent.outputTranscription as { text?: string };
          if (transcription.text) {
            // 过滤掉 Gemini 2.5 的 "thinking" 输出（仅在生产环境过滤，dev 模式保留用于调试）
            // thinking 内容通常以 ** 开头（markdown 加粗格式）表示思考过程标题
            const text = transcription.text.trim();
            const isThinkingContent = text.startsWith('**') && (
              text.includes('查看') ||
              text.includes('分析') ||
              text.includes('考虑') ||
              text.includes('思考') ||
              text.includes('理解') ||
              text.includes('精炼') ||
              text.includes('编写') ||
              text.includes('构思') ||
              text.includes('方法') ||
              text.includes('Thinking') ||
              text.includes('Analyzing') ||
              text.includes('Considering')
            );

            // dev 模式下不过滤，方便调试；生产环境过滤掉 thinking 内容
            if (import.meta.env.DEV || !isThinkingContent) {
              setTranscript((prev) => {
                const newTranscript = [...prev, { role: 'assistant' as const, text: transcription.text! }];
                if (onTranscriptUpdate) {
                  onTranscriptUpdate(newTranscript);
                }
                return newTranscript;
              });
            }
          }
        }

        // Handle tool call
        if ('toolCall' in serverContent && serverContent.toolCall) {
          const toolCall = serverContent.toolCall as unknown as ToolCall;
          if (import.meta.env.DEV) {
            console.log('🔧 Tool call received:', toolCall);
          }

          if (toolCall?.functionCalls && toolCall.functionCalls.length > 0) {
            const functionCall = toolCall.functionCalls[0];
            const functionName = functionCall.name;
            const args = functionCall.args;

            if (import.meta.env.DEV) {
              console.log('📞 Function called:', functionName, args);
            }

            if (onToolCall) {
              onToolCall({ functionName, args });
            }

            // Send function response back to AI
            if (sessionRef.current) {
              sessionRef.current.sendToolResponse({
                functionResponses: [
                  {
                    id: functionCall.id,
                    name: functionName,
                    response: { success: true },
                  },
                ],
              });
            }
          }
        }

        // Handle model turn with audio and text
        if ('modelTurn' in serverContent && serverContent.modelTurn) {
          const parts = serverContent.modelTurn.parts || [];

          // Process audio parts
          const audioParts = parts.filter(
            (p) => p.inlineData && p.inlineData.mimeType?.startsWith('audio/pcm')
          );

          if (audioParts.length > 0) {
            await getOrCreateAudioContext();
            setIsSpeaking(true);
            audioParts.forEach((part) => {
              if (part.inlineData?.data) {
                const arrayBuffer = base64ToArrayBuffer(part.inlineData.data);
                audioStreamerRef.current?.addPCM16(new Uint8Array(arrayBuffer));
              }
            });
          }

          // Process text parts
          const textParts = parts
            .filter((p) => p.text)
            .map((p) => p.text)
            .join(' ');

          if (textParts) {
            setTranscript((prev) => {
              const newTranscript = [...prev, { role: 'assistant' as const, text: textParts }];
              if (onTranscriptUpdate) {
                onTranscriptUpdate(newTranscript);
              }
              return newTranscript;
            });
          }
        }
      }
    },
    [getOrCreateAudioContext, onMessage, onTranscriptUpdate, onToolCall]
  );

  // Initialize session
  // prefetchedToken: 可选的预获取 token，用于并行加载优化
  const connect = useCallback(async (customSystemInstruction?: string, customTools?: FunctionDeclaration[], prefetchedToken?: string) => {
    // 重置会话统计（使用 ref 获取当前麦克风/摄像头状态，因为 React 状态更新是异步的）
    sessionStatsRef.current = {
      micEnabledCount: 0,
      micDisabledCount: 0,
      cameraEnabledCount: 0,
      cameraDisabledCount: 0,
      micWasEnabled: micEnabledRef.current, // 使用 ref 获取当前麦克风状态
      cameraWasEnabled: cameraEnabledRef.current, // 使用 ref 获取当前摄像头状态
    };

    try {
      // 重要：在连接前先初始化 AudioContext（必须在用户交互上下文中）
      // 这确保了音频播放在浏览器自动播放策略下能正常工作
      if (import.meta.env.DEV) {
        console.log('🔊 Pre-initializing AudioContext...');
      }
      await getOrCreateAudioContext();
      if (import.meta.env.DEV) {
        console.log('✅ AudioContext ready, state:', audioContextRef.current?.state);
      }

      // 使用预获取的 token 或现场获取
      const token = prefetchedToken || await fetchGeminiToken();

      // Use ephemeral token with v1alpha API (required for ephemeral tokens)
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' }
      });
      const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

      const finalSystemInstruction = customSystemInstruction || systemInstruction;
      const finalTools = customTools || tools;
      const toolList = finalTools && finalTools.length > 0
        ? ([{ functionDeclarations: finalTools }] satisfies GeminiTool[])
        : undefined;

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: ['audio'] as unknown as Modality[],
          // 设置 AI 语音为 Puck
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck',
              },
            },
          },
          // 关闭 thinking 以加快响应速度（实时对话不需要深度思考）
          thinkingConfig: {
            thinkingBudget: 0,
          },
          // 启用用户语音转录，用于保存对话记忆
          inputAudioTranscription: {},
          // 启用 AI 语音转录，同步输出文字
          outputAudioTranscription: {},
          systemInstruction: finalSystemInstruction ? { parts: [{ text: finalSystemInstruction }] } : undefined,
          tools: toolList,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
            // 记录连接开始时间，保留之前的麦克风/摄像头统计（因为它们可能在连接前就已开启）
            sessionStartTimeRef.current = Date.now();
            // 埋点：AI 对话连接成功，记录当前麦克风/摄像头状态
            trackEvent('gemini_live_connected', {
              mic_enabled_at_start: sessionStatsRef.current.micWasEnabled,
              camera_enabled_at_start: sessionStatsRef.current.cameraWasEnabled,
            });
            if (import.meta.env.DEV) {
              console.log('Gemini Live connected');
            }
          },
          onmessage: handleServerMessage,
          onerror: (error: ErrorEvent) => {
            setError(error?.message || 'Connection error');
            setIsConnected(false);
          },
          onclose: () => {
            setIsConnected(false);
            if (import.meta.env.DEV) {
              console.log('Gemini Live disconnected');
            }
          },
        },
      });

      sessionRef.current = session;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [systemInstruction, tools, handleServerMessage, getOrCreateAudioContext]);

  // Disconnect session
  const disconnect = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🔌 Disconnecting Gemini Live...');
    }

    // 埋点：AI 对话断开，记录会话统计
    if (sessionStartTimeRef.current) {
      const durationSeconds = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
      const stats = sessionStatsRef.current;
      trackEvent('gemini_live_disconnected', {
        duration_seconds: durationSeconds,
        mic_was_enabled: stats.micWasEnabled,
        mic_enabled_count: stats.micEnabledCount,
        mic_disabled_count: stats.micDisabledCount,
        camera_was_enabled: stats.cameraWasEnabled,
        camera_enabled_count: stats.cameraEnabledCount,
        camera_disabled_count: stats.cameraDisabledCount,
      });
      sessionStartTimeRef.current = null;
    }

    // 关闭 Gemini session
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    // 停止麦克风录制
    audioRecorderRef.current?.stop();
    audioRecorderRef.current = null;
    setAudioStream(null);

    // 停止视频流
    videoStream?.getTracks().forEach((track) => track.stop());
    setVideoStream(null);

    // 停止音频播放并清理
    audioStreamerRef.current?.stop();
    audioStreamerRef.current = null;

    // 关闭 AudioContext（重要：确保下次重新创建）
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      if (import.meta.env.DEV) {
        console.log('🔊 AudioContext closed');
      }
    }
    audioContextRef.current = null;

    // 重置状态
    setIsConnected(false);
    setIsRecording(false);
    setCameraEnabled(false);
    setIsSpeaking(false);

    if (import.meta.env.DEV) {
      console.log('✅ Gemini Live disconnected and cleaned up');
    }
  }, [videoStream]);

  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    // Note: Removed isConnected check to allow pre-connection microphone setup
    // This is needed for auto-enable on start to work within user gesture context

    if (isRecording) {
      audioRecorderRef.current?.stop();
      audioRecorderRef.current = null;
      setIsRecording(false);
      setAudioStream(null);
      micEnabledRef.current = false; // 更新 ref
      // 埋点：麦克风关闭
      sessionStatsRef.current.micDisabledCount++;
      trackEvent('gemini_live_mic_toggled', { enabled: false });
    } else {
      try {
        if (!audioRecorderRef.current) {
          audioRecorderRef.current = new AudioRecorder(16000);
        }

        audioRecorderRef.current.on('data', (base64Audio: string) => {
          if (sessionRef.current) {
            sessionRef.current.sendRealtimeInput({
              media: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Audio,
              },
            });
          }
        });

        await audioRecorderRef.current.start();
        await getOrCreateAudioContext();
        setAudioStream(audioRecorderRef.current.stream || null);

        setIsRecording(true);
        micEnabledRef.current = true; // 更新 ref
        setError(null);
        // 埋点：麦克风开启
        sessionStatsRef.current.micEnabledCount++;
        sessionStatsRef.current.micWasEnabled = true;
        trackEvent('gemini_live_mic_toggled', { enabled: true });
      } catch (err) {
        console.error('Microphone error:', err);
        audioRecorderRef.current = null;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
          setError('Microphone access denied. Please allow microphone access in Settings.');
        } else {
          setError(`Microphone error: ${errorMessage}`);
        }
      }
    }
  }, [isRecording, getOrCreateAudioContext]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    // Note: Removed isConnected check to allow pre-connection camera setup
    // This is needed for auto-enable on start to work within user gesture context

    if (cameraEnabled) {
      videoStream?.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
      setCameraEnabled(false);
      cameraEnabledRef.current = false; // 更新 ref
      // 埋点：摄像头关闭
      sessionStatsRef.current.cameraDisabledCount++;
      trackEvent('gemini_live_camera_toggled', { enabled: false });
    } else {
      try {
        await getOrCreateAudioContext();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: DEFAULT_CAMERA_RESOLUTION.width },
            height: { ideal: DEFAULT_CAMERA_RESOLUTION.height },
          },
        });
        setVideoStream(stream);
        setCameraEnabled(true);
        cameraEnabledRef.current = true; // 更新 ref
        setError(null);
        // 埋点：摄像头开启
        sessionStatsRef.current.cameraEnabledCount++;
        sessionStatsRef.current.cameraWasEnabled = true;
        trackEvent('gemini_live_camera_toggled', { enabled: true });
      } catch (err) {
        console.error('Camera error:', err);
        setError('Camera access denied. Please allow camera access in Settings.');
      }
    }
  }, [cameraEnabled, videoStream, getOrCreateAudioContext]);

  // Send text message
  const sendTextMessage = useCallback((text: string) => {
    if (sessionRef.current && isConnected) {
      sessionRef.current.sendRealtimeInput({ text });
    }
  }, [isConnected]);

  // Send video frames
  useEffect(() => {
    if (!cameraEnabled || !videoStream || !videoRef.current || !canvasRef.current || !isConnected) {
      return;
    }

    videoRef.current.srcObject = videoStream;

    let timeoutId = -1;

    const sendVideoFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !sessionRef.current) {
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        const data = base64.slice(base64.indexOf(',') + 1);

        sessionRef.current.sendRealtimeInput({
          media: { mimeType: 'image/jpeg', data },
        });
      }

      if (isConnected && cameraEnabled) {
        timeoutId = window.setTimeout(
          sendVideoFrame,
          1000 / DEFAULT_CAMERA_FRAME_RATE
        );
      }
    };

    if (isConnected && cameraEnabled) {
      requestAnimationFrame(sendVideoFrame);
    }

    return () => {
      if (timeoutId !== -1) {
        clearTimeout(timeoutId);
      }
    };
  }, [cameraEnabled, videoStream, isConnected]);

  // Auto-enable camera and microphone if specified
  useEffect(() => {
    if (isConnected && enableCamera && !cameraEnabled) {
      toggleCamera();
    }
  }, [isConnected, enableCamera, cameraEnabled, toggleCamera]);

  useEffect(() => {
    if (isConnected && enableMicrophone && !isRecording) {
      toggleMicrophone();
    }
  }, [isConnected, enableMicrophone, isRecording, toggleMicrophone]);

  return {
    // State
    isConnected,
    isRecording,
    isSpeaking,
    error,
    transcript,
    cameraEnabled,
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
