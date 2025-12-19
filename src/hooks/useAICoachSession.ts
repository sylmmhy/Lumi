import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { getSupabaseClient } from '../lib/supabase';

/**
 * AI Coach Session Hook - 组合层
 * 
 * 将 Gemini Live、虚拟消息、VAD、波形动画等功能打包成一个简单的接口
 * 方便在不同场景中复用 AI 教练功能
 */

export interface AICoachMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isVirtual?: boolean;
}

export interface AICoachSessionState {
  /** 任务描述 */
  taskDescription: string;
  /** 剩余时间（秒） */
  timeRemaining: number;
  /** 计时器是否运行中 */
  isTimerRunning: boolean;
  /** 消息列表 */
  messages: AICoachMessage[];
}

export interface UseAICoachSessionOptions {
  /** 初始倒计时时间（秒），默认 300（5分钟） */
  initialTime?: number;
  /** 倒计时结束时的回调 */
  onCountdownComplete?: () => void;
  /** 是否启用虚拟消息（AI 主动问候），默认 true */
  enableVirtualMessages?: boolean;
  /** 是否启用 VAD（用户说话检测），默认 true */
  enableVAD?: boolean;
}

/**
 * 过滤用户语音中的噪音
 */
const isValidUserSpeech = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[^\w\u4e00-\u9fa5]+$/.test(trimmed)) return false;
  return true;
};

export function useAICoachSession(options: UseAICoachSessionOptions = {}) {
  const {
    initialTime = 300,
    onCountdownComplete,
    enableVirtualMessages = true,
    enableVAD = true,
  } = options;

  // ==========================================
  // 状态管理
  // ==========================================
  const [state, setState] = useState<AICoachSessionState>({
    taskDescription: '',
    timeRemaining: initialTime,
    isTimerRunning: false,
    messages: [],
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [taskStartTime, setTaskStartTime] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const processedTranscriptRef = useRef<Set<string>>(new Set());
  
  // 使用 ref 来存储 addMessage 函数，避免循环依赖问题
  const addMessageRef = useRef<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>(() => {});

  // ==========================================
  // 消息管理（必须在其他 hooks 之前定义）
  // ==========================================
  const addMessage = useCallback((role: 'user' | 'ai', content: string, isVirtual = false) => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: Date.now().toString(),
          role,
          content,
          timestamp: new Date(),
          isVirtual,
        },
      ],
    }));
  }, []);

  // 更新 addMessage ref
  useEffect(() => {
    addMessageRef.current = addMessage;
  }, [addMessage]);

  // ==========================================
  // Gemini Live
  // ==========================================
  const geminiLive = useGeminiLive({
    onTranscriptUpdate: (newTranscript) => {
      const lastMessage = newTranscript[newTranscript.length - 1];
      if (!lastMessage) return;

      const messageId = `${lastMessage.role}-${lastMessage.text.substring(0, 50)}`;
      if (processedTranscriptRef.current.has(messageId)) {
        return;
      }
      processedTranscriptRef.current.add(messageId);

      if (lastMessage.role === 'assistant') {
        addMessageRef.current('ai', lastMessage.text);
        if (import.meta.env.DEV) {
          console.log('🤖 AI 说:', lastMessage.text);
        }
      }

      if (lastMessage.role === 'user') {
        if (isValidUserSpeech(lastMessage.text)) {
          if (import.meta.env.DEV) {
            console.log('🎤 用户说:', lastMessage.text);
          }
          addMessageRef.current('user', lastMessage.text, false);
        }
      }
    },
  });

  // ==========================================
  // VAD (Voice Activity Detection)
  // ==========================================
  const vad = useVoiceActivityDetection(geminiLive.audioStream, {
    enabled: enableVAD && isSessionActive && geminiLive.isRecording,
    threshold: 30,
    smoothingTimeConstant: 0.8,
    fftSize: 2048,
  });

  // ==========================================
  // 波形动画
  // ==========================================
  const waveformAnimation = useWaveformAnimation({
    enabled: isSessionActive,
    isSpeaking: geminiLive.isSpeaking,
  });

  // ==========================================
  // 虚拟消息
  // ==========================================
  const virtualMessages = useVirtualMessages({
    enabled: enableVirtualMessages && isSessionActive && geminiLive.isConnected,
    taskStartTime,
    isAISpeaking: geminiLive.isSpeaking,
    isUserSpeaking: vad.isSpeaking,
    lastUserSpeechTime: vad.lastSpeakingTime,
    onSendMessage: (message) => geminiLive.sendTextMessage(message),
    onAddMessage: (role, content, isVirtual) => addMessageRef.current(role, content, isVirtual),
  });

  useEffect(() => {
    geminiLive.setOnTurnComplete(() => virtualMessages.recordTurnComplete(false));
    return () => geminiLive.setOnTurnComplete(null);
  }, [geminiLive.setOnTurnComplete, virtualMessages.recordTurnComplete]);

  // ==========================================
  // 倒计时
  // ==========================================
  const startCountdown = useCallback(() => {
    setState(prev => ({ ...prev, isTimerRunning: true }));
    setTaskStartTime(Date.now());
  }, []);

  const stopCountdown = useCallback(() => {
    setState(prev => ({ ...prev, isTimerRunning: false }));
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 倒计时 effect
  useEffect(() => {
    if (state.isTimerRunning && state.timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          const newTime = prev.timeRemaining - 1;

          if (newTime <= 0) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            onCountdownComplete?.();
            return {
              ...prev,
              timeRemaining: 0,
              isTimerRunning: false,
            };
          }

          return {
            ...prev,
            timeRemaining: newTime,
          };
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [state.isTimerRunning, state.timeRemaining, onCountdownComplete]);

  // ==========================================
  // 会话管理
  // ==========================================

  /**
   * 开始 AI 教练会话
   * @param taskDescription 任务描述
   * @param options 可选配置
   * @param options.customSystemInstruction 自定义系统指令
   * @param options.userName 用户名字，Lumi 会用这个名字称呼用户
   */
  const startSession = useCallback(async (
    taskDescription: string,
    options?: { customSystemInstruction?: string; userName?: string }
  ) => {
    const { customSystemInstruction, userName } = options || {};
    processedTranscriptRef.current.clear();
    setIsConnecting(true);

   try {
      if (import.meta.env.DEV) {
        console.log('🚀 开始 AI 教练会话...');
      }

      // 关键修复：先断开旧会话，确保完全清理
      if (geminiLive.isConnected) {
        if (import.meta.env.DEV) {
          console.log('⚠️ 检测到旧会话，先断开...');
        }
        geminiLive.disconnect();
        // 等待一小段时间确保清理完成
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 更新任务描述
      setState(prev => ({
        ...prev,
        taskDescription,
        timeRemaining: initialTime,
        messages: [],
      }));

      // 步骤1：尝试启用摄像头（不阻塞流程）
      if (import.meta.env.DEV) {
        console.log('🎬 步骤1: 尝试启用摄像头...');
      }
      if (!geminiLive.cameraEnabled) {
        try {
          await geminiLive.toggleCamera();
        } catch (cameraError) {
          // 摄像头启用失败不阻塞流程，用户可以稍后手动开启
          if (import.meta.env.DEV) {
            console.log('⚠️ 摄像头启用失败，继续流程:', cameraError);
          }
        }
      }

      // 步骤2：启用麦克风
      if (import.meta.env.DEV) {
        console.log('🎤 步骤2: 启用麦克风...');
      }
      if (!geminiLive.isRecording) {
        await geminiLive.toggleMicrophone();
      }

      // 步骤3：获取系统指令并连接 Gemini
      let systemInstruction = customSystemInstruction;

      if (!systemInstruction) {
        if (import.meta.env.DEV) {
          console.log('📡 步骤3: 获取系统指令...');
          console.log('📝 当前任务描述:', taskDescription);
        }
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
          throw new Error('Supabase 未配置');
        }

        const { data, error } = await supabaseClient.functions.invoke('get-system-instruction', {
          body: { taskInput: taskDescription, userName }
        });

        if (error) {
          throw new Error(`获取系统指令失败: ${error.message}`);
        }

        systemInstruction = data.systemInstruction;
      }

      if (import.meta.env.DEV) {
        console.log('✅ 系统指令已获取，正在连接 Gemini Live...');
      }

      await geminiLive.connect(systemInstruction, undefined);

      if (import.meta.env.DEV) {
        console.log('✅ 连接已建立');
      }

      setIsConnecting(false);
      setIsSessionActive(true);

      // 开始倒计时
      startCountdown();

      if (import.meta.env.DEV) {
        console.log('✨ AI 教练会话已成功开始');
      }

      return true;
    } catch (error) {
      console.error('❌ startSession 错误:', error);
      setIsConnecting(false);
      throw error;
    }
  }, [initialTime, geminiLive, startCountdown]);

  /**
   * 结束 AI 教练会话
   */
  const endSession = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🔌 结束 AI 教练会话...');
    }

    stopCountdown();
    geminiLive.disconnect();
    setIsSessionActive(false);

    if (import.meta.env.DEV) {
      console.log('✅ AI 教练会话已结束');
    }
  }, [stopCountdown, geminiLive]);

  /**
   * 重置会话
   */
  const resetSession = useCallback(() => {
    endSession();
    processedTranscriptRef.current.clear();
    setState({
      taskDescription: '',
      timeRemaining: initialTime,
      isTimerRunning: false,
      messages: [],
    });
    setTaskStartTime(0);
  }, [endSession, initialTime]);

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      geminiLive.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // 返回值
  // ==========================================
  return {
    // 状态
    state,
    isConnecting,
    isSessionActive,

    // Gemini Live 状态
    isConnected: geminiLive.isConnected,
    isSpeaking: geminiLive.isSpeaking,
    cameraEnabled: geminiLive.cameraEnabled,
    videoStream: geminiLive.videoStream,
    error: geminiLive.error,

    // VAD 状态
    isUserSpeaking: vad.isSpeaking,

    // 波形动画
    waveformHeights: waveformAnimation.heights,

    // 操作
    startSession,
    endSession,
    resetSession,
    sendTextMessage: geminiLive.sendTextMessage,
    toggleCamera: geminiLive.toggleCamera,

    // Refs（用于 UI）
    videoRef: geminiLive.videoRef,
    canvasRef: geminiLive.canvasRef,
  };
}
