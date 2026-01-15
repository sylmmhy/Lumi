import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import type { SuccessRecordForVM } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { useToneManager } from './useToneManager';
import { getSupabaseClient } from '../lib/supabase';
import { updateReminder } from '../remindMe/services/reminderService';
import { userStateTools, type UserState } from './gemini-live/tools/userStateTools';
import type { ToolCallEvent } from './gemini-live/types';

// ==========================================
// 配置常量
// ==========================================

/** 连接超时时间（毫秒） */
const CONNECTION_TIMEOUT_MS = 15000;

/** 摄像头重试次数 */
const MAX_CAMERA_RETRIES = 2;

/** 摄像头重试间隔（毫秒） */
const CAMERA_RETRY_DELAY_MS = 1000;

/** Tone 切换触发词发送延迟（毫秒） */
const TONE_TRIGGER_DELAY_MS = 500;

// ==========================================
// 工具函数
// ==========================================

/**
 * 为 Promise 添加超时保护
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param errorMessage 超时错误信息
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

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
  /** 是否启用动态语气管理（检测用户抗拒并切换AI风格），默认 true */
  enableToneManager?: boolean;
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
    enableToneManager = true,
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
  const [isObserving, setIsObserving] = useState(false); // AI 正在观察用户
  const [connectionError, setConnectionError] = useState<string | null>(null); // 连接错误信息

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = useRef(false); // 防止重复清理
  const processedTranscriptRef = useRef<Set<string>>(new Set());
  const onCountdownCompleteRef = useRef(onCountdownComplete); // 用 ref 存储回调，避免 effect 依赖变化

  /**
   * 保存最新的 saveSessionMemory 引用，确保倒计时结束时可以稳定触发记忆保存
   */
  const saveSessionMemoryRef = useRef<(options?: { additionalContext?: string; forceTaskCompleted?: boolean }) => Promise<boolean>>(
    async () => false
  );

  // 使用 ref 来存储 addMessage 函数，避免循环依赖问题
  const addMessageRef = useRef<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>(() => {});

  // 使用 ref 存储当前会话信息
  const currentUserIdRef = useRef<string | null>(null);
  const currentTaskDescriptionRef = useRef<string>('');
  const currentTaskIdRef = useRef<string | null>(null); // 任务 ID，用于保存 actual_duration_minutes

  // 用于累积用户语音碎片，避免每个词都存为单独消息
  const userSpeechBufferRef = useRef<string>('');

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // ==========================================
  // 动态语气管理（Tone Manager）
  // ==========================================
  const toneManager = useToneManager({
    rejectionThreshold: 2,           // 连续2次抗拒后切换语气
    minToneChangeInterval: 30000,    // 30秒内不重复切换
    enableDebugLog: import.meta.env.DEV,
  });

  // 用于发送 tone 切换触发词的 ref（避免循环依赖）
  const sendToneTriggerRef = useRef<(trigger: string) => void>(() => {});

  /**
   * 处理 AI 工具调用的回调
   *
   * 主要用于处理 reportUserState 工具，更新语气管理器状态
   * 这比依赖 [RESIST] 文本标记更可靠，因为 Function Calling
   * 是 Gemini Live 原生支持的机制，会在语音回复之前触发
   */
  const handleToolCall = useCallback((event: ToolCallEvent) => {
    if (event.functionName === 'reportUserState') {
      const state = event.args?.state as UserState | undefined;
      const reason = event.args?.reason as string | undefined;

      if (import.meta.env.DEV) {
        console.log('🔧 [ToolCall] reportUserState:', { state, reason });
      }

      // 参数验证
      if (!state || !['resisting', 'cooperating', 'neutral'].includes(state)) {
        if (import.meta.env.DEV) {
          console.warn('⚠️ [ToolCall] Invalid state value:', state);
        }
        return;
      }

      if (state === 'resisting') {
        // 记录抗拒（AI 检测到用户在抗拒）
        const triggerString = toneManager.recordResistance('ai_detected');

        if (import.meta.env.DEV) {
          console.log('🚫 [ToneManager] AI 通过工具调用报告用户抗拒', {
            consecutiveRejections: toneManager.toneState.consecutiveRejections + 1,
            currentTone: toneManager.toneState.currentTone,
            willTriggerChange: !!triggerString,
          });
        }

        // 如果触发了语气切换，稍后发送触发词
        if (triggerString) {
          if (import.meta.env.DEV) {
            console.log('🎭 [ToneManager] 语气切换触发！', {
              previousTone: toneManager.toneState.currentTone,
              triggerString,
              totalChanges: toneManager.toneState.totalToneChanges + 1,
            });
          }
          setTimeout(() => {
            sendToneTriggerRef.current(triggerString);
          }, TONE_TRIGGER_DELAY_MS);
        }
      } else if (state === 'cooperating') {
        // 记录配合
        toneManager.recordAcceptance();

        if (import.meta.env.DEV) {
          console.log('✅ [ToneManager] AI 通过工具调用报告用户配合');
        }
      }
      // neutral 状态不做处理，保持当前状态
    }
  }, [toneManager]);

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

  // 更新 onCountdownComplete ref
  useEffect(() => {
    onCountdownCompleteRef.current = onCountdownComplete;
  }, [onCountdownComplete]);

  // ==========================================
  // Gemini Live
  // ==========================================
  const geminiLive = useGeminiLive({
    // 传入用户状态报告工具（如果启用了语气管理）
    // AI 会在每次回复前通过工具调用报告用户状态
    tools: enableToneManager ? userStateTools : undefined,

    // 工具调用回调：处理 AI 的 reportUserState 调用
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
        // AI 开始说话前，先把累积的用户消息存储
        if (userSpeechBufferRef.current.trim()) {
          const fullUserMessage = userSpeechBufferRef.current.trim();
          if (import.meta.env.DEV) {
            console.log('🎤 用户说:', fullUserMessage);
          }
          addMessageRef.current('user', fullUserMessage, false);
          userSpeechBufferRef.current = '';
        }

        // 存储 AI 消息
        // 注意：抗拒检测现在通过 onToolCall 回调处理（reportUserState 工具）
        // 不再需要检测 [RESIST] 标记
        addMessageRef.current('ai', lastMessage.text);
        if (import.meta.env.DEV) {
          console.log('🤖 AI 说:', lastMessage.text);
        }
      }

      if (lastMessage.role === 'user') {
        // 累积用户语音碎片，不立即存储
        if (isValidUserSpeech(lastMessage.text)) {
          userSpeechBufferRef.current += lastMessage.text;
        }
      }
    },
  });

  // 更新 sendToneTrigger ref（使用 geminiLive.sendTextMessage）
  useEffect(() => {
    sendToneTriggerRef.current = (trigger: string) => {
      if (geminiLive.isConnected && isSessionActive) {
        geminiLive.sendTextMessage(trigger);
        if (import.meta.env.DEV) {
          // 解析触发词获取新语气
          const styleMatch = trigger.match(/style=(\w+)/);
          const newStyle = styleMatch ? styleMatch[1] : 'unknown';
          console.log('📤 [ToneManager] 语气切换触发词已发送给 Gemini', {
            newTone: newStyle,
            trigger,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (import.meta.env.DEV) {
        console.warn('⚠️ [ToneManager] 无法发送语气切换触发词 - 会话未连接', {
          isConnected: geminiLive.isConnected,
          isSessionActive,
        });
      }
    };
  }, [geminiLive.isConnected, geminiLive.sendTextMessage, isSessionActive]);

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
    // Phase 3: Memory Boost - 传入成功记录用于动态记忆注入
    successRecord: successRecordRef.current,
    initialDuration: initialTime,
  });

  const { setOnTurnComplete } = geminiLive;
  const { recordTurnComplete } = virtualMessages;

  useEffect(() => {
    setOnTurnComplete(() => recordTurnComplete(false));
    return () => setOnTurnComplete(null);
  }, [recordTurnComplete, setOnTurnComplete]);

  // 当 AI 开始说话时，关闭观察状态
  useEffect(() => {
    if (geminiLive.isSpeaking && isObserving) {
      setIsObserving(false);
      if (import.meta.env.DEV) {
        console.log('👀 AI 开始说话，观察阶段结束');
      }
    }
  }, [geminiLive.isSpeaking, isObserving]);

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

  // ==========================================
  // 统一清理函数（解决断开连接逻辑重复问题）
  // ==========================================
  const cleanup = useCallback(() => {
    // 防止重复清理
    if (isCleaningUpRef.current) {
      return;
    }
    isCleaningUpRef.current = true;

    if (import.meta.env.DEV) {
      console.log('🧹 执行统一清理...');
    }

    // 1. 停止计时器（复用 stopCountdown 逻辑）
    stopCountdown();

    // 2. 断开 Gemini 连接
    geminiLive.disconnect();

    // 3. 重置状态
    setIsSessionActive(false);
    setIsObserving(false);
    setIsConnecting(false);

    // 重置清理标志（延迟重置，确保当前清理完成）
    setTimeout(() => {
      isCleaningUpRef.current = false;
    }, 100);

    if (import.meta.env.DEV) {
      console.log('✅ 统一清理完成');
    }
  }, [geminiLive, stopCountdown]);

  /**
   * 保存最新的 cleanup 引用，避免倒计时 effect 依赖变化导致 interval 重建
   */
  const cleanupRef = useRef(cleanup);

  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  // 倒计时 effect
  // 注意：只依赖 isTimerRunning，不依赖 timeRemaining，避免每秒重建 interval
  useEffect(() => {
    if (state.isTimerRunning) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          const newTime = prev.timeRemaining - 1;

          if (newTime <= 0) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            // 使用 ref 调用回调，避免闭包问题
            // 使用 setTimeout 确保在 setState 完成后调用
            setTimeout(() => {
              void saveSessionMemoryRef.current();
              cleanupRef.current();
              onCountdownCompleteRef.current?.();
            }, 0);
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
          timerRef.current = null;
        }
      };
    }
  }, [state.isTimerRunning]);

  // ==========================================
  // 会话管理
  // ==========================================

  /**
   * 开始 AI 教练会话
   * @param taskDescription 任务描述
   * @param options 可选配置
   * @param options.userId 用户 ID（用于 Mem0 记忆检索和存储）
   * @param options.customSystemInstruction 自定义系统指令
   * @param options.userName 用户名字，Lumi 会用这个名字称呼用户
   * @param options.preferredLanguages 首选语言数组，如 ["en-US", "ja-JP"]，不传则自动检测用户语言
   * @param options.taskId 任务 ID（用于保存 actual_duration_minutes 到 tasks 表）
   */
  const startSession = useCallback(async (
    taskDescription: string,
    options?: { userId?: string; customSystemInstruction?: string; userName?: string; preferredLanguages?: string[]; taskId?: string }
  ) => {
    const { userId, customSystemInstruction, userName, preferredLanguages, taskId } = options || {};
    processedTranscriptRef.current.clear();
    currentUserIdRef.current = userId || null;
    currentTaskDescriptionRef.current = taskDescription;
    currentTaskIdRef.current = taskId || null;
    setIsConnecting(true);
    setConnectionError(null); // 清除之前的错误

    // 重置语气管理器状态（新会话从 friendly 开始）
    if (enableToneManager) {
      toneManager.resetToneState();
    }

   try {
      if (import.meta.env.DEV) {
        console.log('🚀 开始 AI 教练会话...');
      }

      // 关键修复：使用统一的 cleanup 函数清理旧会话
      if (geminiLive.isConnected) {
        if (import.meta.env.DEV) {
          console.log('⚠️ 检测到旧会话，先清理...');
        }
        cleanup();
        // 等待一小段时间确保清理完成
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // 重置清理标志，允许后续清理
      isCleaningUpRef.current = false;

      // 更新任务描述
      setState(prev => ({
        ...prev,
        taskDescription,
        timeRemaining: initialTime,
        messages: [],
      }));

      // 步骤1：尝试启用摄像头（带重试机制）
      if (import.meta.env.DEV) {
        console.log('🎬 步骤1: 尝试启用摄像头...');
      }
      if (!geminiLive.cameraEnabled) {
        let cameraRetries = 0;
        let cameraSuccess = false;

        while (cameraRetries < MAX_CAMERA_RETRIES && !cameraSuccess) {
          try {
            await geminiLive.toggleCamera();
            cameraSuccess = true;
            if (import.meta.env.DEV) {
              console.log('✅ 摄像头启用成功');
            }
          } catch (cameraError) {
            cameraRetries++;
            const errorMessage = cameraError instanceof Error ? cameraError.message : String(cameraError);

            // 如果是权限被拒绝，不重试
            if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
              if (import.meta.env.DEV) {
                console.log('⚠️ 摄像头权限被拒绝，跳过重试');
              }
              break;
            }

            if (cameraRetries < MAX_CAMERA_RETRIES) {
              if (import.meta.env.DEV) {
                console.log(`⚠️ 摄像头启用失败，${CAMERA_RETRY_DELAY_MS}ms 后重试 (${cameraRetries}/${MAX_CAMERA_RETRIES})...`);
              }
              await new Promise(resolve => setTimeout(resolve, CAMERA_RETRY_DELAY_MS));
            } else {
              if (import.meta.env.DEV) {
                console.log('⚠️ 摄像头启用失败，已达最大重试次数，继续流程');
              }
            }
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

      // 步骤3：并行获取系统指令和 Gemini token（带超时保护）
      if (import.meta.env.DEV) {
        console.log('⚡ 步骤3: 并行获取系统指令和 token...');
      }

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      const needFetchInstruction = !customSystemInstruction;

      const [instructionResult, token] = await withTimeout(
        Promise.all([
          // 如果已有自定义 instruction 则返回 null
          needFetchInstruction
            ? supabaseClient.functions.invoke('get-system-instruction', {
                body: {
                  taskInput: taskDescription,
                  userName,
                  preferredLanguages,
                  userId,
                  // 注入用户本地时间，让 AI 知道当前是几点
                  // 使用 24 小时制避免 AM/PM 误解
                  localTime: (() => {
                    const now = new Date();
                    const hours = now.getHours();
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    // 24小时制更清晰，不会有 AM/PM 误解
                    return `${hours}:${minutes} (24-hour format)`;
                  })(),
                  localDate: new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  })
                }
              })
            : Promise.resolve(null),
          // 获取 Gemini token
          fetchGeminiToken(),
        ]),
        CONNECTION_TIMEOUT_MS,
        '获取配置超时，请检查网络连接后重试'
      );

      // 处理 system instruction 结果
      let systemInstruction = customSystemInstruction;
      if (instructionResult) {
        if (instructionResult.error) {
          throw new Error(`获取系统指令失败: ${instructionResult.error.message}`);
        }
        systemInstruction = instructionResult.data.systemInstruction;

        // Phase 3: 提取成功记录，用于虚拟消息系统的 memory boost
        if (instructionResult.data.successRecord) {
          successRecordRef.current = instructionResult.data.successRecord;
          if (import.meta.env.DEV) {
            console.log('📊 获取到用户成功记录:', successRecordRef.current);
          }
        } else {
          successRecordRef.current = null;
        }
      } else {
        // 使用自定义 instruction 时，清空成功记录
        successRecordRef.current = null;
      }

      if (import.meta.env.DEV) {
        console.log('✅ 并行获取完成，正在连接 Gemini Live...');
      }

      // 使用预获取的 token 连接（带超时保护）
      await withTimeout(
        geminiLive.connect(systemInstruction, undefined, token),
        CONNECTION_TIMEOUT_MS,
        '连接 AI 服务超时，请检查网络连接后重试'
      );

      if (import.meta.env.DEV) {
        console.log('✅ 连接已建立');
      }

      setIsConnecting(false);
      setIsSessionActive(true);
      setIsObserving(true); // AI 开始观察用户

      // 开始倒计时
      startCountdown();

      // 注意：AI 开场白由 useVirtualMessages 系统触发
      // 不在这里发送消息，让虚拟消息系统统一处理

      if (import.meta.env.DEV) {
        console.log('✨ AI 教练会话已成功开始');
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接失败，请重试';
      console.error('❌ startSession 错误:', error);
      setIsConnecting(false);
      setConnectionError(errorMessage);

      // 清理可能的残留状态
      cleanup();

      throw error;
    }
  }, [initialTime, geminiLive, startCountdown, cleanup]);

  /**
   * 结束 AI 教练会话
   * 使用统一的 cleanup 函数确保资源正确释放
   */
  const endSession = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🔌 结束 AI 教练会话...');
    }

    // 使用统一的清理函数
    cleanup();

    if (import.meta.env.DEV) {
      console.log('✅ AI 教练会话已结束');
    }
  }, [cleanup]);

  /**
   * 保存会话记忆到 Mem0
   * 调用此函数将当前会话的对话内容保存为长期记忆
   * @param options.additionalContext 可选的额外上下文信息
   * @param options.forceTaskCompleted 强制标记任务为已完成（用于用户主动点击完成按钮的场景）
   */
  const saveSessionMemory = useCallback(async (options?: { additionalContext?: string; forceTaskCompleted?: boolean }) => {
    const { additionalContext, forceTaskCompleted } = options || {};
    const userId = currentUserIdRef.current;
    const taskDescription = currentTaskDescriptionRef.current;

    if (!userId) {
      if (import.meta.env.DEV) {
        console.log('⚠️ 无法保存记忆：缺少 userId');
      }
      return false;
    }

    // 复制当前消息列表（避免 setState 异步问题）
    const messages = [...state.messages];

    // 先把 buffer 中剩余的用户消息保存
    if (userSpeechBufferRef.current.trim()) {
      const fullUserMessage = userSpeechBufferRef.current.trim();
      if (import.meta.env.DEV) {
        console.log('🎤 保存剩余用户消息:', fullUserMessage);
      }
      // 同时添加到 state 和本地 messages 数组
      const newUserMessage: AICoachMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: fullUserMessage,
        timestamp: new Date(),
        isVirtual: false,
      };
      messages.push(newUserMessage);
      addMessageRef.current('user', fullUserMessage, false);
      userSpeechBufferRef.current = '';
    }
    if (messages.length === 0) {
      if (import.meta.env.DEV) {
        console.log('⚠️ 无法保存记忆：没有对话消息');
      }
      return false;
    }

    try {
      if (import.meta.env.DEV) {
        console.log('🧠 正在保存会话记忆...');
      }

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      // 将消息转换为 Mem0 格式，过滤掉虚拟消息（只保存真实对话）
      const realMessages = messages.filter(msg => !msg.isVirtual);

      if (realMessages.length === 0) {
        if (import.meta.env.DEV) {
          console.log('⚠️ 无法保存记忆：没有真实对话消息（全是虚拟消息）');
        }
        return false;
      }

      const extractorMessages = realMessages.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      }));

      // 添加任务上下文作为第一条消息
      if (taskDescription) {
        extractorMessages.unshift({
          role: 'system',
          content: `User was working on task: "${taskDescription}"${additionalContext ? `. ${additionalContext}` : ''}`,
        });
      }

      // 日志：查看传给 memory-extractor 的内容
      if (import.meta.env.DEV) {
        console.log('📤 [Memory] 发送到 memory-extractor 的内容:', {
          userId,
          taskDescription,
          totalMessages: messages.length,
          virtualMessagesFiltered: messages.length - realMessages.length,
          realMessagesCount: realMessages.length,
          extractorMessagesCount: extractorMessages.length,
          messages: extractorMessages,
        });
      }

      // 判断任务是否完成
      // 1. 倒计时结束 (timeRemaining === 0)
      // 2. 用户主动点击完成按钮 (forceTaskCompleted === true)
      const wasTaskCompleted = forceTaskCompleted === true || state.timeRemaining === 0;
      // 计算实际完成时长（分钟）
      const actualDurationMinutes = Math.round((initialTime - state.timeRemaining) / 60);

      if (import.meta.env.DEV) {
        console.log('📊 任务完成状态:', {
          wasTaskCompleted,
          forceTaskCompleted,
          actualDurationMinutes,
          timeRemaining: state.timeRemaining,
          initialTime,
        });
      }

      const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
        body: {
          action: 'extract',
          userId,
          messages: extractorMessages,
          taskDescription,
          metadata: {
            source: 'ai_coach_session',
            sessionDuration: initialTime - state.timeRemaining,
            timestamp: new Date().toISOString(),
            // 新增：任务完成状态，用于 SUCCESS 记忆提取
            task_completed: wasTaskCompleted,
            actual_duration_minutes: actualDurationMinutes,
          },
        },
      });

      if (error) {
        throw new Error(`保存记忆失败: ${error.message}`);
      }

      if (import.meta.env.DEV) {
        console.log('✅ 会话记忆已保存:', data);
      }

      // 🆕 如果任务完成且有 taskId，保存 actualDurationMinutes 到 tasks 表
      const taskId = currentTaskIdRef.current;
      if (wasTaskCompleted && taskId && actualDurationMinutes > 0) {
        try {
          await updateReminder(taskId, {
            actualDurationMinutes,
            // 可以在这里添加其他成功元数据，例如 completionMood, difficultyPerception 等
            // 这些可以通过 AI 从对话中推断，或者让用户在完成时选择
          });
          if (import.meta.env.DEV) {
            console.log('✅ 任务完成时长已保存到数据库:', { taskId, actualDurationMinutes });
          }
        } catch (updateError) {
          console.error('⚠️ 保存任务完成时长失败:', updateError);
          // 不影响整体流程，继续返回 true
        }
      }

      return true;
    } catch (error) {
      console.error('❌ 保存会话记忆失败:', error);
      return false;
    }
  }, [state.messages, state.timeRemaining, initialTime]);

  /**
   * 同步 saveSessionMemory 的最新实现，避免倒计时结束时拿到旧闭包
   */
  useEffect(() => {
    saveSessionMemoryRef.current = saveSessionMemory;
  }, [saveSessionMemory]);

  /**
   * 重置会话
   */
  const resetSession = useCallback(() => {
    endSession();
    processedTranscriptRef.current.clear();
    userSpeechBufferRef.current = '';
    setConnectionError(null); // 清除错误状态
    setState({
      taskDescription: '',
      timeRemaining: initialTime,
      isTimerRunning: false,
      messages: [],
    });
    setTaskStartTime(0);
  }, [endSession, initialTime]);

  // 组件卸载时使用统一清理函数
  useEffect(() => {
    return () => {
      // 使用 cleanup 确保所有资源正确释放
      // 注意：这里不能直接调用 cleanup()，因为它依赖于 geminiLive
      // 所以我们直接执行清理逻辑
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
    isObserving, // AI 正在观察用户（开场前）
    connectionError, // 连接错误信息（超时、网络问题等）

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

    // 动态语气管理状态
    toneState: toneManager.toneState,
    currentTone: toneManager.toneState.currentTone,
    currentToneDescription: toneManager.currentToneDescription,

    // 操作
    startSession,
    endSession,
    resetSession,
    saveSessionMemory,
    sendTextMessage: geminiLive.sendTextMessage,
    toggleCamera: geminiLive.toggleCamera,

    // 语气管理操作（高级用法，通常不需要手动调用）
    forceToneChange: toneManager.forceToneChange,

    // Refs（用于 UI）
    videoRef: geminiLive.videoRef,
    canvasRef: geminiLive.canvasRef,
  };
}
