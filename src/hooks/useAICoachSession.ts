import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { getSupabaseClient } from '../lib/supabase';
import { updateReminder } from '../remindMe/services/reminderService';
import type { FunctionDeclaration } from '@google/genai';

// ==========================================
// Function Calling 工具定义
// ==========================================

/**
 * AI 可调用的工具函数声明
 * 当用户请求重新安排任务时间时，AI 会调用这个函数
 */
const AI_COACH_TOOLS: FunctionDeclaration[] = [
  {
    name: 'reschedule_task_and_end_session',
    description: `当用户请求稍后再提醒、重新安排任务时间时调用此函数。例如：
    - "15分钟后再提醒我"
    - "半小时后叫我"
    - "我想晚点做，30分钟后提醒"
    - "Remind me in 20 minutes"
    - "I'll do it later, call me in 10 minutes"
    调用此函数后，当前任务的提醒时间会被更新为指定的分钟数后，然后会话将自动结束。`,
    parameters: {
      type: 'object',
      properties: {
        minutes: {
          type: 'number',
          description: '多少分钟后重新提醒用户（必须是正整数，1-180之间）',
        },
      },
      required: ['minutes'],
    },
  },
];

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
  /** 当 AI 重新安排任务时间后的回调（任务已更新） */
  onTaskRescheduled?: (taskId: string, newTime: string) => void;
  /** 当 AI 主动结束会话时的回调 */
  onAIEndSession?: () => void;
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
    onTaskRescheduled,
    onAIEndSession,
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

  // 使用 ref 存储回调函数，避免 useGeminiLive 重新创建
  const onTaskRescheduledRef = useRef(onTaskRescheduled);
  const onAIEndSessionRef = useRef(onAIEndSession);
  const currentTaskIdRef = useRef<string | null>(null);
  const endSessionRef = useRef<(() => void) | null>(null);

  // 更新 refs
  useEffect(() => {
    onTaskRescheduledRef.current = onTaskRescheduled;
    onAIEndSessionRef.current = onAIEndSession;
  }, [onTaskRescheduled, onAIEndSession]);

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
  // Function Calling 处理
  // ==========================================
  const handleToolCall = useCallback(async (toolCall: { functionName: string; args: Record<string, unknown> }) => {
    const { functionName, args } = toolCall;

    if (import.meta.env.DEV) {
      console.log('🔧 AI Coach 收到工具调用:', functionName, args);
    }

    if (functionName === 'reschedule_task_and_end_session') {
      const minutes = Math.min(Math.max(Number(args.minutes) || 15, 1), 180); // 限制在 1-180 分钟
      const taskId = currentTaskIdRef.current;

      if (!taskId) {
        console.warn('⚠️ 无法重新安排任务：没有当前任务 ID');
        return;
      }

      // 计算新的时间（当前时间 + minutes 分钟）
      const now = new Date();
      now.setMinutes(now.getMinutes() + minutes);
      const newTime = now.toTimeString().slice(0, 5); // HH:mm 格式
      const newDisplayTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).toLowerCase(); // h:mm am/pm 格式

      if (import.meta.env.DEV) {
        console.log(`⏰ 重新安排任务: ID=${taskId}, 新时间=${newTime} (${newDisplayTime}), ${minutes}分钟后`);
      }

      try {
        // 更新任务时间
        const updatedTask = await updateReminder(taskId, {
          time: newTime,
          displayTime: newDisplayTime,
        });

        if (updatedTask) {
          if (import.meta.env.DEV) {
            console.log('✅ 任务时间已更新:', updatedTask);
          }

          // 调用外部回调通知任务已更新
          if (onTaskRescheduledRef.current) {
            onTaskRescheduledRef.current(taskId, newTime);
          }
        } else {
          console.error('❌ 更新任务失败');
        }
      } catch (error) {
        console.error('❌ 更新任务出错:', error);
      }

      // 延迟一小段时间让 AI 说完告别语，然后结束会话
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('👋 AI 请求结束会话');
        }

        // 调用 AI 结束会话回调
        if (onAIEndSessionRef.current) {
          onAIEndSessionRef.current();
        }

        // 结束会话
        if (endSessionRef.current) {
          endSessionRef.current();
        }
      }, 3000); // 3秒后结束，给 AI 时间说告别语
    }
  }, []);

  // ==========================================
  // Gemini Live
  // ==========================================
  const geminiLive = useGeminiLive({
    tools: AI_COACH_TOOLS,
    onToolCall: handleToolCall,
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
   * @param options.taskId 当前任务的 ID（用于 AI 重新安排任务时间）
   * @param options.customSystemInstruction 自定义系统指令
   * @param options.userName 用户名字，Lumi 会用这个名字称呼用户
   * @param options.preferredLanguage 首选语言，如 "Chinese"、"English"，不传则自动检测用户语言
   */
  const startSession = useCallback(async (
    taskDescription: string,
    options?: { taskId?: string; customSystemInstruction?: string; userName?: string; preferredLanguage?: string }
  ) => {
    const { taskId, customSystemInstruction, userName, preferredLanguage } = options || {};
    processedTranscriptRef.current.clear();
    currentTaskIdRef.current = taskId || null;
    setIsConnecting(true);

   try {
      if (import.meta.env.DEV) {
        console.log('🚀 开始 AI 教练会话...', taskId ? `任务ID: ${taskId}` : '(无任务ID)');
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
          body: { taskInput: taskDescription, userName, preferredLanguage }
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

  // 更新 endSession ref（用于 handleToolCall 中调用）
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

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
