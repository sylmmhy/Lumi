import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import type { SuccessRecordForVM } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { useVirtualMessageOrchestrator } from './virtual-messages';
import { getSupabaseClient } from '../lib/supabase';
import { updateReminder } from '../remindMe/services/reminderService';
import { getVoiceName } from '../lib/voiceSettings';
import type { VirtualMessageUserContext } from './virtual-messages/types';
import { useAmbientAudio } from './campfire/useAmbientAudio';
import { useFocusTimer } from './campfire/useFocusTimer';
import { useIntentDetection } from './ai-tools';

// ==========================================
// 配置常量
// ==========================================

/** 连接超时时间（毫秒） */
const CONNECTION_TIMEOUT_MS = 15000;

/** 摄像头重试次数 */
const MAX_CAMERA_RETRIES = 2;

/** 摄像头重试间隔（毫秒） */
const CAMERA_RETRY_DELAY_MS = 1000;

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
  const [isObserving, setIsObserving] = useState(false); // AI 正在观察用户
  const [connectionError, setConnectionError] = useState<string | null>(null); // 连接错误信息

  // 篝火模式状态
  const [isCampfireMode, setIsCampfireMode] = useState(false);
  const [campfireSessionId, setCampfireSessionId] = useState<string | null>(null);
  const [campfireChatCount, setCampfireChatCount] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = useRef(false); // 防止重复清理

  // 篝火模式 Refs
  const campfireReconnectLockRef = useRef(false);
  const campfireIdleTimerRef = useRef<number | null>(null);
  const savedSystemInstructionRef = useRef<string>(''); // 保存原始 system prompt
  const campfireMicStreamRef = useRef<MediaStream | null>(null);
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
  const currentCallRecordIdRef = useRef<string | null>(null); // 来电记录 ID，用于记录通话时长

  // 用于累积用户语音碎片，避免每个词都存为单独消息
  const userSpeechBufferRef = useRef<string>('');

  // 跟踪上一条消息的角色，用于检测角色切换
  const lastProcessedRoleRef = useRef<'user' | 'assistant' | null>(null);

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 保存用户首选语言，用于虚拟消息时保持语言一致性
  const preferredLanguagesRef = useRef<string[] | null>(null);

  // DEV: AI 语音 log 缓冲区，用于将流式碎片拼接成完整句子后再输出
  const aiSpeechLogBufferRef = useRef<string>('');
  const aiSpeechLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用于调用 intentDetection 方法的 ref（避免闭包问题）
  const intentDetectionRef = useRef<{
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
  });

  // 用于调用 messageOrchestrator 方法的 ref（避免循环依赖）
  const orchestratorRef = useRef<{
    onUserSpeech: (text: string) => Promise<unknown>;
    onAISpeech: (text: string) => void;
    onTurnComplete: () => void;
    getContext: () => { currentTopic: { name: string } | null };
    getVirtualMessageContext: () => VirtualMessageUserContext | null;
  }>({
    onUserSpeech: async () => null,
    onAISpeech: () => {},
    onTurnComplete: () => {},
    getContext: () => ({ currentTopic: null }),
    getVirtualMessageContext: () => null,
  });

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

          // 用完整的用户消息进行话题检测和记忆检索
          orchestratorRef.current.onUserSpeech(fullUserMessage).catch((err) => {
            if (import.meta.env.DEV) {
              console.warn('话题检测失败:', err);
            }
          });

          userSpeechBufferRef.current = '';
        }

        // 存储 AI 消息
        const displayText = lastMessage.text;
        addMessageRef.current('ai', displayText);
        if (import.meta.env.DEV) {
          // 累积流式碎片，500ms 无新消息后输出完整句子
          aiSpeechLogBufferRef.current += displayText;
          if (aiSpeechLogTimerRef.current) clearTimeout(aiSpeechLogTimerRef.current);
          aiSpeechLogTimerRef.current = setTimeout(() => {
            console.log('🤖 AI 说:', aiSpeechLogBufferRef.current);
            aiSpeechLogBufferRef.current = '';
          }, 500);
        }

        // 🆕 通知动态虚拟消息调度器（用于上下文追踪）
        orchestratorRef.current.onAISpeech(displayText);

        // 🆕 喂意图检测（AI 回复）
        intentDetectionRef.current.processAIResponse(displayText);

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'assistant';
      }

      if (lastMessage.role === 'user') {
        // 累积用户语音碎片，不立即存储
        // 话题检测在用户说完整句话后进行（AI 开始说话前），见上方代码
        if (isValidUserSpeech(lastMessage.text)) {
          userSpeechBufferRef.current += lastMessage.text;

          // 🆕 喂意图检测（用户消息）
          intentDetectionRef.current.addUserMessage(lastMessage.text);
        }

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'user';
      }
    },
  });

  // ==========================================
  // 篝火模式子 Hooks
  // ==========================================

  /** 白噪音（仅篝火模式启用） */
  const ambientAudio = useAmbientAudio({ normalVolume: 0.5, duckedVolume: 0.1 });

  /** 专注计时（仅篝火模式启用） */
  const focusTimer = useFocusTimer();

  /** 意图检测（检测 enter_campfire / exit_campfire） */
  const intentDetection = useIntentDetection({
    userId: currentUserIdRef.current || '',
    chatType: 'daily_chat',
    enabled: isSessionActive && !isCampfireMode,
    onDetectionComplete: (result) => {
      if (result.tool === 'enter_campfire' && result.confidence >= 0.6) {
        // AI 已经在回复中说了告别语（system prompt 指导），跳过再发 CAMPFIRE_FAREWELL
        enterCampfireModeRef.current({ skipFarewell: true });
      } else if (result.tool === 'exit_campfire' && result.confidence >= 0.6) {
        exitCampfireModeRef.current();
      }
    },
  });

  // 用 ref 存储篝火模式进入/退出函数（避免 useIntentDetection 闭包问题）
  const enterCampfireModeRef = useRef<(options?: { skipFarewell?: boolean }) => void>(() => {});
  const exitCampfireModeRef = useRef<() => void>(() => {});

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
  // 动态虚拟消息调度器（方案 2：过渡话注入）
  // ==========================================
  const messageOrchestrator = useVirtualMessageOrchestrator({
    userId: currentUserIdRef.current,
    taskDescription: currentTaskDescriptionRef.current,
    initialDuration: initialTime,
    taskStartTime,
    sendClientContent: geminiLive.sendClientContent,
    isSpeaking: geminiLive.isSpeaking,
    enabled: isSessionActive && geminiLive.isConnected && !isCampfireMode,
    enableMemoryRetrieval: true,
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
  });

  // 更新 orchestratorRef，避免 onTranscriptUpdate 闭包问题
  useEffect(() => {
    orchestratorRef.current = {
      onUserSpeech: messageOrchestrator.onUserSpeech,
      onAISpeech: messageOrchestrator.onAISpeech,
      onTurnComplete: messageOrchestrator.onTurnComplete,
      getContext: messageOrchestrator.getContext,
      getVirtualMessageContext: messageOrchestrator.getVirtualMessageContext,
    };
  }, [
    messageOrchestrator.onUserSpeech,
    messageOrchestrator.onAISpeech,
    messageOrchestrator.onTurnComplete,
    messageOrchestrator.getContext,
    messageOrchestrator.getVirtualMessageContext,
  ]);

  // 更新 intentDetectionRef，避免 onTranscriptUpdate 闭包问题
  useEffect(() => {
    intentDetectionRef.current = {
      processAIResponse: intentDetection.processAIResponse,
      addUserMessage: intentDetection.addUserMessage,
    };
  }, [intentDetection.processAIResponse, intentDetection.addUserMessage]);

  // ==========================================
  // 虚拟消息（原有的定时触发系统）
  // ==========================================
  /**
   * 从 Orchestrator 获取当前对话上下文（给“智能小纸条”用）
   */
  const getConversationContext = useCallback((): VirtualMessageUserContext | null => {
    return orchestratorRef.current.getVirtualMessageContext?.() ?? null;
  }, []);

  /**
   * 调用后端 Edge Function，生成一条“小纸条”（一整句话）
   *
   * 注意：
   * - 这里不做太多业务逻辑判断，把“如何说”交给后端的 Gemini
   * - useVirtualMessages 内部会做 2 秒超时保护，失败会自动回退到 [CHECK_IN]
   */
  const fetchCoachGuidance = useCallback(async (context: VirtualMessageUserContext) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const userPreferredLanguage = preferredLanguagesRef.current?.[0] || 'en-US';

    const { data, error } = await supabase.functions.invoke('generate-coach-guidance', {
      body: {
        userId: currentUserIdRef.current,
        ...context,
        userPreferredLanguage,
      },
    });

    if (error) {
      console.error('⚠️ generate-coach-guidance 调用失败:', error);
      return null;
    }

    if (data && typeof (data as { note?: unknown }).note === 'string') {
      return { note: (data as { note: string }).note };
    }

    return null;
  }, []);

  const virtualMessages = useVirtualMessages({
    enabled: enableVirtualMessages && isSessionActive && geminiLive.isConnected && !isCampfireMode,
    taskStartTime,
    isAISpeaking: geminiLive.isSpeaking,
    isUserSpeaking: vad.isSpeaking,
    lastUserSpeechTime: vad.lastSpeakingTime,
    onSendMessage: (message) => geminiLive.sendTextMessage(message),
    onAddMessage: (role, content, isVirtual) => addMessageRef.current(role, content, isVirtual),
    // Phase 3: Memory Boost - 传入成功记录用于动态记忆注入
    successRecord: successRecordRef.current,
    initialDuration: initialTime,
    // 🔧 修复语言污染：传入用户首选语言，确保虚拟消息触发词携带正确语言
    preferredLanguage: preferredLanguagesRef.current?.[0],
    // 智能小纸条
    getConversationContext,
    fetchCoachGuidance,
  });

  const { setOnTurnComplete } = geminiLive;
  const { recordTurnComplete } = virtualMessages;

  // 当 AI 说完话时（turnComplete），同时通知：
  // 1. virtualMessages 系统（用于冷却期控制）
  // 2. messageOrchestrator 系统（用于在安全窗口期注入记忆）
  useEffect(() => {
    setOnTurnComplete(() => {
      recordTurnComplete(false);
      // 🆕 方案 A：在 turnComplete 后尝试静默注入队列中的记忆
      orchestratorRef.current.onTurnComplete();
    });
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

    // 🆕 记录通话结束时间和时长（如果有 callRecordId）
    const callRecordId = currentCallRecordIdRef.current;
    if (callRecordId && taskStartTime > 0) {
      const durationSeconds = Math.round((Date.now() - taskStartTime) / 1000);
      console.log('📞 记录通话结束:', { callRecordId, durationSeconds });

      const supabaseForEndCall = getSupabaseClient();
      if (supabaseForEndCall) {
        supabaseForEndCall.functions.invoke('manage-call-records', {
          body: {
            action: 'end_call',
            call_record_id: callRecordId,
            end_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
          },
        }).then(({ error }) => {
          if (error) {
            console.error('⚠️ 记录通话结束失败:', error);
          } else {
            console.log('✅ 通话结束已记录');
          }
        });
      }
      // 清除 callRecordId
      currentCallRecordIdRef.current = null;
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
  }, [geminiLive, stopCountdown, taskStartTime]);

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
  // 篝火模式 - 核心逻辑
  // ==========================================

  /** 清除篝火模式空闲计时器 */
  const clearCampfireIdleTimer = useCallback(() => {
    if (campfireIdleTimerRef.current) {
      clearTimeout(campfireIdleTimerRef.current);
      campfireIdleTimerRef.current = null;
    }
  }, []);

  /** 篝火模式空闲超时 → 断开 Gemini */
  const startCampfireIdleTimer = useCallback(() => {
    clearCampfireIdleTimer();
    campfireIdleTimerRef.current = window.setTimeout(() => {
      if (isCampfireMode && geminiLive.isConnected) {
        console.log('🕐 [Campfire] Idle timeout, disconnecting Gemini...');
        geminiLive.disconnect();
      }
    }, 30_000); // 30 秒空闲断开
  }, [isCampfireMode, geminiLive, clearCampfireIdleTimer]);

  /**
   * 调用后端 start-campfire-focus 获取篝火模式 system prompt
   * @param isReconnect 是否是重连（影响开场语）
   */
  const callStartCampfireFocus = useCallback(async (isReconnect: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const lang = preferredLanguagesRef.current?.[0] || 'en-US';
    const { data, error } = await supabase.functions.invoke('start-campfire-focus', {
      body: {
        userId: currentUserIdRef.current || '',
        sessionId: campfireSessionId || undefined,
        taskDescription: currentTaskDescriptionRef.current || undefined,
        isReconnect,
        aiTone: 'gentle',
        language: lang.startsWith('zh') ? 'zh' : 'en',
      },
    });

    if (error) {
      console.error('❌ [Campfire] start-campfire-focus error:', error);
      return null;
    }

    if (!isReconnect && data?.sessionId) {
      setCampfireSessionId(data.sessionId);
    }

    return data;
  }, [campfireSessionId]);

  /**
   * 篝火模式 VAD 触发 → 重连 Gemini
   */
  const campfireReconnectGemini = useCallback(async () => {
    if (campfireReconnectLockRef.current) return;
    campfireReconnectLockRef.current = true;

    try {
      console.log('🔌 [Campfire] VAD triggered, reconnecting Gemini...');
      const token = await fetchGeminiToken();
      const config = await callStartCampfireFocus(true);
      if (!config?.geminiConfig?.systemPrompt) {
        console.error('❌ [Campfire] No system prompt from backend');
        return;
      }

      await geminiLive.connect(
        config.geminiConfig.systemPrompt,
        [],
        token,
        config.geminiConfig.voiceConfig?.voiceName || 'Aoede'
      );

      setCampfireChatCount(prev => prev + 1);
      startCampfireIdleTimer();
    } catch (err) {
      console.error('❌ [Campfire] Reconnect failed:', err);
    } finally {
      campfireReconnectLockRef.current = false;
    }
  }, [geminiLive, callStartCampfireFocus, startCampfireIdleTimer]);

  /**
   * 进入篝火模式
   * @param options.skipFarewell 意图检测触发时为 true（AI 已在回复中说了告别语），按钮触发时为 false
   */
  const enterCampfireMode = useCallback(async (options?: { skipFarewell?: boolean }) => {
    if (isCampfireMode) return;

    const skipFarewell = options?.skipFarewell ?? false;
    console.log('🏕️ Entering campfire mode...', { skipFarewell });

    if (skipFarewell) {
      // 意图检测触发：AI 已经说了告别语，等它说完就断开
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!geminiLive.isSpeaking) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
    } else {
      // 按钮触发：需要让 AI 先说一句告别语
      const lang = preferredLanguagesRef.current?.[0] || 'en-US';
      geminiLive.sendTextMessage(`[CAMPFIRE_FAREWELL] language=${lang}`);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!geminiLive.isSpeaking) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
    }

    // 断开 Gemini
    geminiLive.disconnect();

    // 4. 获取麦克风流（用于 VAD）
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      campfireMicStreamRef.current = stream;
    } catch (micErr) {
      console.warn('⚠️ [Campfire] Failed to get mic stream for VAD:', micErr);
    }

    // 5. 切换状态
    setIsCampfireMode(true);
    setCampfireChatCount(0);

    // 6. 启动白噪音和计时器
    ambientAudio.play();
    focusTimer.start();

    // 7. 调用后端创建 focus session（异步，不阻塞）
    callStartCampfireFocus(false);
  }, [isCampfireMode, geminiLive, ambientAudio, focusTimer, callStartCampfireFocus]);

  /**
   * 退出篝火模式
   * - 停止白噪音和计时器
   * - 重新连接 AI 教练
   * - 返回统计数据
   */
  const exitCampfireMode = useCallback(async () => {
    if (!isCampfireMode) return null;

    console.log('🏕️ Exiting campfire mode...');

    // 1. 停止篝火模式子系统
    ambientAudio.stop();
    focusTimer.stop();
    clearCampfireIdleTimer();

    // 2. 停止麦克风流
    if (campfireMicStreamRef.current) {
      campfireMicStreamRef.current.getTracks().forEach(t => t.stop());
      campfireMicStreamRef.current = null;
    }

    // 3. 记录统计
    const stats = {
      sessionId: campfireSessionId || '',
      taskDescription: currentTaskDescriptionRef.current,
      durationSeconds: focusTimer.elapsedSeconds,
      chatCount: campfireChatCount,
    };

    // 4. 切换状态
    setIsCampfireMode(false);

    // 5. 重新连接 AI 教练（用保存的原始 system prompt）
    if (savedSystemInstructionRef.current) {
      try {
        const token = await fetchGeminiToken();
        const voiceName = getVoiceName();
        await geminiLive.connect(savedSystemInstructionRef.current, undefined, token, voiceName);
      } catch (err) {
        console.error('❌ [Campfire] Failed to reconnect AI coach:', err);
      }
    }

    // 6. 更新数据库（异步）
    if (campfireSessionId) {
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase.functions.invoke('update-focus-session', {
          body: {
            sessionId: campfireSessionId,
            durationSeconds: stats.durationSeconds,
            endSession: {
              status: 'completed',
              endedAt: new Date().toISOString(),
            },
          },
        }).catch(err => {
          console.warn('Failed to update focus session:', err);
        });
      }
    }

    return stats;
  }, [isCampfireMode, ambientAudio, focusTimer, campfireSessionId, campfireChatCount, geminiLive, clearCampfireIdleTimer]);

  // 更新篝火模式进入/退出函数的 ref
  useEffect(() => {
    enterCampfireModeRef.current = enterCampfireMode;
    exitCampfireModeRef.current = exitCampfireMode;
  }, [enterCampfireMode, exitCampfireMode]);

  // ==========================================
  // 篝火模式 - VAD 触发重连
  // ==========================================

  /** 篝火模式独立的 VAD 实例：在 Gemini 断开时监听麦克风 */
  const campfireVad = useVoiceActivityDetection(
    isCampfireMode ? campfireMicStreamRef.current : null,
    { threshold: 25, enabled: isCampfireMode && !geminiLive.isConnected }
  );

  /** VAD 触发 → 重连 Gemini */
  useEffect(() => {
    if (isCampfireMode && campfireVad.isSpeaking && !campfireReconnectLockRef.current && !geminiLive.isConnected) {
      campfireReconnectGemini();
    }
  }, [isCampfireMode, campfireVad.isSpeaking, geminiLive.isConnected, campfireReconnectGemini]);

  /** 空闲超时 → 断开 Gemini（对话中时重置计时器） */
  useEffect(() => {
    if (isCampfireMode && geminiLive.isConnected && !geminiLive.isSpeaking && !geminiLive.isRecording) {
      startCampfireIdleTimer();
    }
  }, [isCampfireMode, geminiLive.isConnected, geminiLive.isSpeaking, geminiLive.isRecording, startCampfireIdleTimer]);

  /** AI 说话时降低白噪音 */
  useEffect(() => {
    if (isCampfireMode) {
      ambientAudio.setDucked(geminiLive.isSpeaking);
    }
  }, [isCampfireMode, geminiLive.isSpeaking, ambientAudio]);

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
   * @param options.callRecordId 来电记录 ID（用于追踪麦克风连接状态）
   */
  const startSession = useCallback(async (
    taskDescription: string,
    options?: { userId?: string; customSystemInstruction?: string; userName?: string; preferredLanguages?: string[]; taskId?: string; callRecordId?: string }
  ) => {
    const { userId, customSystemInstruction, userName, preferredLanguages, taskId, callRecordId } = options || {};
    processedTranscriptRef.current.clear();
    currentUserIdRef.current = userId || null;
    currentTaskDescriptionRef.current = taskDescription;
    lastProcessedRoleRef.current = null;
    currentTaskIdRef.current = taskId || null;
    currentCallRecordIdRef.current = callRecordId || null; // 保存来电记录 ID
    // 保存首选语言，用于触发词生成时保持语言一致性
    preferredLanguagesRef.current = preferredLanguages || null;
    setIsConnecting(true);
    setConnectionError(null); // 清除之前的错误

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

      // 🚀 性能优化：硬件初始化 + 网络请求全部并行执行
      // 原来是：摄像头(~1s) → 麦克风(~1.2s) → [并行: 后端请求 + token]
      // 现在是：全部同时发起，总耗时 = max(硬件, 后端请求) 而非 sum
      console.log('🚀 全并行启动: 硬件初始化 + 网络请求同时进行...');

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      const needFetchInstruction = !customSystemInstruction;

      const [, , instructionResult, token] = await withTimeout(
        Promise.all([
          // 任务A：摄像头初始化（带重试机制）
          (async () => {
            console.log('🎬 [并行] 摄像头初始化...', { cameraEnabled: geminiLive.cameraEnabled });
            if (!geminiLive.cameraEnabled) {
              let cameraRetries = 0;
              let cameraSuccess = false;

              while (cameraRetries < MAX_CAMERA_RETRIES && !cameraSuccess) {
                console.log(`📹 摄像头尝试 #${cameraRetries + 1}，调用 toggleCamera()...`);
                try {
                  await geminiLive.toggleCamera();
                  cameraSuccess = true;
                  console.log('✅ 摄像头启用成功');
                } catch (cameraError) {
                  cameraRetries++;
                  const errorMessage = cameraError instanceof Error ? cameraError.message : String(cameraError);
                  console.error('❌ 摄像头启用异常:', cameraError);
                  console.log('❌ 摄像头错误详情:', errorMessage);

                  if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
                    if (import.meta.env.DEV) {
                      console.log('⚠️ 摄像头权限被拒绝，跳过重试');
                    }
                    break;
                  }

                  if (cameraRetries < MAX_CAMERA_RETRIES) {
                    console.log(`⚠️ 摄像头启用失败，${CAMERA_RETRY_DELAY_MS}ms 后重试 (${cameraRetries}/${MAX_CAMERA_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, CAMERA_RETRY_DELAY_MS));
                    console.log(`🔄 重试等待结束，开始第 ${cameraRetries + 1} 次尝试...`);
                  } else {
                    console.log('⚠️ 摄像头启用失败，已达最大重试次数，继续流程');
                  }
                }
              }
              console.log(`📹 摄像头初始化循环结束: cameraSuccess=${cameraSuccess}, cameraEnabled=${geminiLive.cameraEnabled}`);
            }
          })(),

          // 任务B：麦克风初始化 + callRecordId 记录
          (async () => {
            console.log('🎤 [并行] 麦克风初始化...');
            if (!geminiLive.isRecording) {
              console.log('🎤 调用 toggleMicrophone()...');
              await geminiLive.toggleMicrophone();
              console.log('🎤 toggleMicrophone() 完成');
            } else {
              console.log('🎤 麦克风已启用，跳过');
            }

            // 麦克风连接成功后，记录 callRecordId（fire-and-forget）
            if (callRecordId) {
              console.log('📞 记录 mic_connected_at:', callRecordId);
              const supabaseForMic = getSupabaseClient();
              if (supabaseForMic) {
                supabaseForMic.functions.invoke('manage-call-records', {
                  body: {
                    action: 'mark_mic_connected',
                    call_record_id: callRecordId,
                  },
                }).then(({ error }) => {
                  if (error) {
                    console.error('⚠️ 记录 mic_connected_at 失败:', error);
                  } else {
                    console.log('✅ mic_connected_at 已记录');
                  }
                });
              }
            }
          })(),

          // 任务C：获取系统指令（后端记忆检索）
          needFetchInstruction
            ? supabaseClient.functions.invoke('get-system-instruction', {
                body: {
                  taskInput: taskDescription,
                  userName,
                  preferredLanguages,
                  userId,
                  localTime: (() => {
                    const now = new Date();
                    const hours = now.getHours();
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    return `${hours}:${minutes} (24-hour format)`;
                  })(),
                  localDate: new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  }),
                  localDateISO: new Date().toISOString().split('T')[0]
                }
              })
            : Promise.resolve(null),

          // 任务D：获取 Gemini token
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

        // 🔍 日志：显示检索到的记忆（方便诊断）
        if (import.meta.env.DEV) {
          const retrievedMemories = instructionResult.data.retrievedMemories as string[] | undefined;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🧠 [记忆检索] 本次会话取到的记忆:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          if (retrievedMemories && retrievedMemories.length > 0) {
            retrievedMemories.forEach((memory, index) => {
              console.log(`  ${index + 1}. ${memory}`);
            });
          } else {
            console.log('  (无记忆 - 这可能是新用户或没有相关记忆)');
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

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

      // 保存 system instruction 用于篝火模式退出后恢复
      if (systemInstruction) {
        savedSystemInstructionRef.current = systemInstruction;
      }

      if (import.meta.env.DEV) {
        console.log('✅ 并行获取完成，正在连接 Gemini Live...');
      }

      // 获取用户选择的 AI 声音
      const voiceName = getVoiceName();
      if (import.meta.env.DEV) {
        console.log('🎤 使用 AI 声音:', voiceName);
      }

      // 使用预获取的 token 连接（带超时保护）
      await withTimeout(
        geminiLive.connect(systemInstruction, undefined, token, voiceName),
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
   * 立即停止音频播放（不断开连接、不清理资源）
   * 用于快速响应用户挂断操作，立即静音 AI
   *
   * 使用场景：用户点击挂断 -> 立即静音 -> 后台保存记忆 -> 清理资源
   */
  const stopAudioImmediately = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🔇 立即停止音频播放...');
    }
    geminiLive.stopAudio();
  }, [geminiLive]);

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

      const mem0Messages = realMessages.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      }));

      // 添加任务上下文作为第一条消息
      if (taskDescription) {
        mem0Messages.unshift({
          role: 'system',
          content: `User was working on task: "${taskDescription}"${additionalContext ? `. ${additionalContext}` : ''}`,
        });
      }

      // 日志：查看传给 Mem0 的内容
      if (import.meta.env.DEV) {
        console.log('📤 [Mem0] 发送到 Mem0 的内容:', {
          userId,
          taskDescription,
          totalMessages: messages.length,
          virtualMessagesFiltered: messages.length - realMessages.length,
          realMessagesCount: realMessages.length,
          mem0MessagesCount: mem0Messages.length,
          messages: mem0Messages,
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
          messages: mem0Messages,
          taskDescription,
          // 新增：传入用户本地日期，用于将相对时间（明天、下周）转换为绝对日期
          localDate: new Date().toISOString().split('T')[0], // 格式: YYYY-MM-DD
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

      // 🔍 日志：显示保存的记忆（方便诊断）
      if (import.meta.env.DEV) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💾 [记忆保存] 本次会话存的记忆:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const savedMemories = data?.memories as Array<{ content: string; tag: string }> | undefined;
        if (savedMemories && savedMemories.length > 0) {
          savedMemories.forEach((memory, index) => {
            console.log(`  ${index + 1}. [${memory.tag}] ${memory.content}`);
          });
        } else {
          console.log('  (无新记忆被提取)');
        }
        console.log('📊 保存统计:', {
          extracted: data?.extracted,
          saved: data?.saved,
          merged: data?.merged,
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
    lastProcessedRoleRef.current = null;
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

      // 篝火模式资源清理
      if (campfireIdleTimerRef.current) {
        clearTimeout(campfireIdleTimerRef.current);
        campfireIdleTimerRef.current = null;
      }
      if (campfireMicStreamRef.current) {
        campfireMicStreamRef.current.getTracks().forEach(t => t.stop());
        campfireMicStreamRef.current = null;
      }
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

    // 操作
    startSession,
    endSession,
    stopAudioImmediately,
    resetSession,
    saveSessionMemory,
    /** 更新当前任务 ID（用于后台保存临时任务后替换为真实 UUID） */
    updateTaskId: (newTaskId: string) => { currentTaskIdRef.current = newTaskId; },
    sendTextMessage: geminiLive.sendTextMessage,
    toggleCamera: geminiLive.toggleCamera,

    // 动态虚拟消息调度器
    orchestratorContext: messageOrchestrator.getContext,
    triggerMemoryRetrieval: messageOrchestrator.triggerMemoryRetrieval, // 手动触发记忆检索（调试用）

    // Refs（用于 UI）
    videoRef: geminiLive.videoRef,
    canvasRef: geminiLive.canvasRef,

    // 篝火模式
    isCampfireMode,
    enterCampfireMode,
    exitCampfireMode,
    campfireStats: {
      elapsedSeconds: focusTimer.elapsedSeconds,
      formattedTime: focusTimer.formattedTime,
      chatCount: campfireChatCount,
      isAmbientPlaying: ambientAudio.isPlaying,
      toggleAmbient: ambientAudio.toggle,
    },
  };
}
