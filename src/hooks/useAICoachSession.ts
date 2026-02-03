import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import type { SuccessRecordForVM } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { useToneManager, analyzeResistance } from './useToneManager';
import { useVirtualMessageOrchestrator } from './virtual-messages';
import { getSupabaseClient } from '../lib/supabase';
import { updateReminder } from '../remindMe/services/reminderService';
import { getVoiceName } from '../lib/voiceSettings';

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

/** Campfire 对话历史本地存储 key 前缀 */
const CAMPFIRE_HISTORY_STORAGE_PREFIX = 'lumi:campfire:history';
/** Campfire 对话历史保留时长（毫秒） */
const CAMPFIRE_HISTORY_TTL_MS = 30 * 60 * 1000;
/** Campfire 对话历史最大保存条数 */
const CAMPFIRE_HISTORY_MAX_MESSAGES = 40;

// ==========================================
// 工具函数
// ==========================================

interface StoredConversationHistoryMessage {
  role: 'user' | 'ai';
  content: string;
}

interface StoredConversationHistory {
  updatedAt: number;
  taskDescription: string;
  messages: StoredConversationHistoryMessage[];
}

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
 * 构建 Campfire 对话历史的本地存储 key。
 * @param userId 用户 ID（可选）
 */
function getCampfireHistoryKey(userId?: string | null): string {
  const suffix = userId && userId.trim() ? userId : 'guest';
  return `${CAMPFIRE_HISTORY_STORAGE_PREFIX}:${suffix}`;
}

/**
 * 读取 Campfire 对话历史（30 分钟内有效）。
 * @param userId 用户 ID（可选）
 * @param taskDescription 当前任务描述
 */
function loadCampfireHistory(
  userId: string | null | undefined,
  taskDescription: string,
): AICoachMessage[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const key = getCampfireHistoryKey(userId);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredConversationHistory;
    if (!parsed || !Array.isArray(parsed.messages)) {
      return [];
    }

    const isExpired = Date.now() - parsed.updatedAt > CAMPFIRE_HISTORY_TTL_MS;
    if (isExpired) {
      window.localStorage.removeItem(key);
      return [];
    }

    if (parsed.taskDescription && parsed.taskDescription !== taskDescription) {
      return [];
    }

    return parsed.messages.map((message, index) => ({
      id: `history-${parsed.updatedAt}-${index}`,
      role: message.role,
      content: message.content,
      timestamp: new Date(parsed.updatedAt),
      isVirtual: false,
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('⚠️ 读取 Campfire 本地对话失败，已忽略:', error);
    }
    return [];
  }
}

/**
 * 保存 Campfire 对话历史（仅保存真实对话）。
 * @param userId 用户 ID（可选）
 * @param taskDescription 当前任务描述
 * @param messages 当前对话消息
 */
function saveCampfireHistory(
  userId: string | null | undefined,
  taskDescription: string,
  messages: AICoachMessage[],
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const key = getCampfireHistoryKey(userId);
  const trimmedMessages = messages
    .filter((message) => !message.isVirtual)
    .slice(-CAMPFIRE_HISTORY_MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  const payload: StoredConversationHistory = {
    updatedAt: Date.now(),
    taskDescription,
    messages: trimmedMessages,
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('⚠️ 保存 Campfire 本地对话失败，已忽略:', error);
    }
  }
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
  /** 会话模式：task = 任务模式（有倒计时），campfire = 篝火陪伴模式（无倒计时） */
  sessionMode?: 'task' | 'campfire';
  /** 是否启用智能空闲断开（2分钟不说话自动断开AI，省Token），默认 false */
  enableIdleDisconnect?: boolean;
}

interface StartSessionOptions {
  userId?: string;
  customSystemInstruction?: string;
  userName?: string;
  preferredLanguages?: string[];
  taskId?: string;
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

/**
 * 格式化最近会话历史，用于空闲重连后的上下文连续。
 */
function buildReconnectContext(
  messages: AICoachMessage[],
  taskDescription: string,
  maxMessages = 12,
): string {
  const recent = messages
    .filter((message) => !message.isVirtual)
    .slice(-maxMessages);

  if (recent.length === 0) {
    return '';
  }

  const transcript = recent
    .map((message) => `${message.role === 'ai' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n');

  return [
    '[RECONNECT_CONTEXT]',
    'The session resumed after a brief pause.',
    `Current task: ${taskDescription}`,
    'Please continue naturally as if the conversation never broke.',
    transcript,
  ].join('\n');
}

/**
 * 创建 AI 教练会话的主 Hook。
 *
 * @param {UseAICoachSessionOptions} options - 会话配置参数
 * @returns AI 会话状态与控制方法
 */
export function useAICoachSession(options: UseAICoachSessionOptions = {}) {
  const {
    initialTime = 300,
    onCountdownComplete,
    enableVirtualMessages = true,
    enableVAD = true,
    enableToneManager = true,
    sessionMode = 'task',
    enableIdleDisconnect = false,
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
  const [isSilentMode, setIsSilentMode] = useState(false); // 静默模式：用户要求安静陪伴

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = useRef(false); // 防止重复清理
  const processedTranscriptRef = useRef<Set<string>>(new Set());
  const onCountdownCompleteRef = useRef(onCountdownComplete); // 用 ref 存储回调，避免 effect 依赖变化
  const conversationHistoryRef = useRef<AICoachMessage[]>([]); // 保存对话历史，用于空闲断开后重连
  const idleCheckIntervalRef = useRef<number | null>(null); // 空闲检测定时器
  const lastSessionParamsRef = useRef<{
    taskDescription: string;
    options?: StartSessionOptions;
  } | null>(null); // 保存最后的会话参数用于重连
  const isReconnectingRef = useRef(false); // 防止重复重连
  const isIdleDisconnectedRef = useRef(false); // 是否处于空闲断开状态
  const lastSystemInstructionRef = useRef<string>(''); // 缓存上次系统指令，重连时复用
  /**
   * 记录用户最后一次说话时间（来自 VAD）
   * 用于空闲断开判断，避免 effect 因频繁更新而重建定时器
   */
  const lastSpeakingTimeRef = useRef<Date | null>(null);
  /**
   * 记录任务开始时间（空闲断开没有用户说话时的兜底基准）
   * 避免依赖变化导致空闲检测 effect 频繁重跑
   */
  const taskStartTimeRef = useRef<number>(0);
  /**
   * 记录 Gemini 连接状态，用于空闲断开时判断是否需要断开
   * 避免把 isConnected 作为 effect 依赖导致定时器反复重置
   */
  const isGeminiConnectedRef = useRef(false);
  /**
   * 保存断开函数引用，避免 effect 依赖函数变化造成频繁重建
   */
  const disconnectSessionOnlyRef = useRef<() => void>(() => {});

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

  // 🔧 修复流式响应问题：跟踪当前 AI 回复是否已检测到 [RESIST]
  // 因为 AI 回复是分 chunks 发送的，[RESIST] 只在第一个 chunk
  // 后续 chunks 不应该触发 recordAcceptance()
  const currentTurnHasResistRef = useRef<boolean>(false);
  // 跟踪上一条消息的角色，用于检测"新一轮"的开始
  const lastProcessedRoleRef = useRef<'user' | 'assistant' | null>(null);

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 保存用户首选语言，用于语气切换和虚拟消息时保持语言一致性
  const preferredLanguagesRef = useRef<string[] | null>(null);

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

  // 用于调用 messageOrchestrator 方法的 ref（避免循环依赖）
  const orchestratorRef = useRef<{
    onUserSpeech: (text: string) => Promise<import('./virtual-messages/useVirtualMessageOrchestrator').TopicResultForResistance | null>;
    onAISpeech: (text: string) => void;
    onTurnComplete: () => void;
    sendMessageForAction: (action: import('./useToneManager').SuggestedAction) => boolean;
    getContext: () => { currentTopic: { name: string } | null };
  }>({
    onUserSpeech: async () => null,
    onAISpeech: () => {},
    onTurnComplete: () => {},
    sendMessageForAction: () => false,
    getContext: () => ({ currentTopic: null }),
  });

  // 用于存储最近的话题检测结果（用于抗拒分析）
  const lastTopicResultRef = useRef<{
    topic: { id: string; name: string } | null;
    emotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired' | 'neutral';
    emotionIntensity?: number;
  } | null>(null);

  // ==========================================
  // 消息管理（必须在其他 hooks 之前定义）
  // ==========================================
  const addMessage = useCallback((role: 'user' | 'ai', content: string, isVirtual = false) => {
    const newMessage: AICoachMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      isVirtual,
    };

    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        newMessage,
      ],
    }));

    if (!isVirtual) {
      const nextHistory = [...conversationHistoryRef.current, newMessage];
      conversationHistoryRef.current = nextHistory;

      if (sessionMode === 'campfire') {
        saveCampfireHistory(currentUserIdRef.current, currentTaskDescriptionRef.current, nextHistory);
      }
    }
  }, [sessionMode]);

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

          // 🆕 用完整的用户消息进行话题检测和记忆检索
          // 必须在清空 buffer 之前调用，且使用完整句子而非碎片
          // 保存话题检测结果，用于后续的抗拒分析
          orchestratorRef.current.onUserSpeech(fullUserMessage).then((topicResult) => {
            if (topicResult) {
              lastTopicResultRef.current = topicResult;
            }
          }).catch((err) => {
            if (import.meta.env.DEV) {
              console.warn('话题检测失败:', err);
            }
          });

          userSpeechBufferRef.current = '';
        }

        // 🔧 检测新一轮 AI 回复的开始（上一条是用户消息）
        const isNewAITurn = lastProcessedRoleRef.current === 'user';

        // 动态语气管理：检测 AI 回复中的 [RESIST] 标记
        let displayText = lastMessage.text;
        const hasSilentModeTag = lastMessage.text.startsWith('[SILENT_MODE]');

        if (hasSilentModeTag) {
          // 🤫 检测到静默模式标记
          displayText = lastMessage.text.replace(/^\[SILENT_MODE\]\s*/, '');
          setIsSilentMode(true);
          if (import.meta.env.DEV) {
            console.log('🤫 进入静默模式 - AI 将停止主动消息');
          }
        }

        if (enableToneManager) {
          // 🔧 新一轮开始时，判断上一轮是否有抗拒
          if (isNewAITurn) {
            if (!currentTurnHasResistRef.current) {
              // 上一轮没有 [RESIST]，说明用户在配合
              toneManager.recordAcceptance();
            }
            // 重置 flag，准备新一轮的检测
            currentTurnHasResistRef.current = false;
          }

          const hasResistTag = lastMessage.text.startsWith('[RESIST]');

          if (hasResistTag) {
            // 移除 [RESIST] 标记
            displayText = lastMessage.text.replace(/^\[RESIST\]\s*/, '');

            // 🔧 标记当前回复已检测到抗拒（防止后续 chunks 误触发 recordAcceptance）
            currentTurnHasResistRef.current = true;

            // 🆕 分析抗拒类型，决定响应策略
            const topicResult = lastTopicResultRef.current;
            const resistanceAnalysis = analyzeResistance(
              userSpeechBufferRef.current || '', // 使用累积的用户消息
              topicResult,
              toneManager.toneState.consecutiveRejections
            );

            if (import.meta.env.DEV) {
              console.log('🔍 [ToneManager] 抗拒分析:', {
                type: resistanceAnalysis.type,
                action: resistanceAnalysis.suggestedAction,
                reason: resistanceAnalysis.reason,
              });
            }

            // 根据分析结果决定是否发送虚拟消息或触发语气切换
            if (resistanceAnalysis.suggestedAction === 'empathy' || resistanceAnalysis.suggestedAction === 'listen') {
              // 情感相关的抗拒 → 发送对应的虚拟消息
              setTimeout(() => {
                orchestratorRef.current.sendMessageForAction(resistanceAnalysis.suggestedAction);
              }, TONE_TRIGGER_DELAY_MS);
            } else if (resistanceAnalysis.suggestedAction === 'accept_stop') {
              // 明确拒绝 → 发送 ACCEPT_STOP 消息
              setTimeout(() => {
                orchestratorRef.current.sendMessageForAction('accept_stop');
              }, TONE_TRIGGER_DELAY_MS);
            } else if (resistanceAnalysis.suggestedAction === 'tiny_step') {
              // 普通抗拒 → 发送 PUSH_TINY_STEP 消息
              setTimeout(() => {
                orchestratorRef.current.sendMessageForAction('tiny_step');
              }, TONE_TRIGGER_DELAY_MS);
            } else if (resistanceAnalysis.suggestedAction === 'tone_shift') {
              // 连续抗拒 → 触发语气切换
              const triggerString = toneManager.recordResistance('ai_detected');

              if (triggerString) {
                const lang = preferredLanguagesRef.current?.[0] || 'en-US';
                const triggerWithLanguage = triggerString.replace('{LANG}', lang);
                setTimeout(() => {
                  if (geminiLive.isConnected) {
                    geminiLive.sendTextMessage(triggerWithLanguage);
                    if (import.meta.env.DEV) {
                      console.log('📤 发送语气切换触发词:', triggerWithLanguage);
                    }
                  }
                }, TONE_TRIGGER_DELAY_MS);
              }
            } else {
              // 其他情况：保持原有逻辑（记录抗拒次数）
              const triggerString = toneManager.recordResistance('ai_detected');

              if (import.meta.env.DEV) {
                console.log('🚫 [ToneManager] AI 检测到用户抗拒');
              }

              // 如果触发了语气切换，稍后发送触发词
              if (triggerString) {
                const lang = preferredLanguagesRef.current?.[0] || 'en-US';
                const triggerWithLanguage = triggerString.replace('{LANG}', lang);
                setTimeout(() => {
                  if (geminiLive.isConnected) {
                    geminiLive.sendTextMessage(triggerWithLanguage);
                    if (import.meta.env.DEV) {
                      console.log('📤 发送语气切换触发词:', triggerWithLanguage);
                    }
                  }
                }, TONE_TRIGGER_DELAY_MS);
              }
            }
          }
        }

        // 存储 AI 消息（使用处理后的文本）
        addMessageRef.current('ai', displayText);
        if (import.meta.env.DEV) {
          console.log('🤖 AI 说:', displayText);
        }

        // 🆕 通知动态虚拟消息调度器（用于上下文追踪）
        orchestratorRef.current.onAISpeech(displayText);

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'assistant';
      }

      if (lastMessage.role === 'user') {
        // 🔊 用户说话时自动退出静默模式
        if (isSilentMode) {
          setIsSilentMode(false);
          console.log('🔊 退出静默模式 - 用户开始说话');
        }

        // 累积用户语音碎片，不立即存储
        // 话题检测在用户说完整句话后进行（AI 开始说话前），见上方代码
        if (isValidUserSpeech(lastMessage.text)) {
          userSpeechBufferRef.current += lastMessage.text;
        }

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'user';
      }
    },
  });

  // 更新 sendToneTrigger ref（使用 geminiLive.sendTextMessage）
  // 🔧 修复语言污染：替换触发词中的 {LANG} 占位符为实际语言代码
  useEffect(() => {
    sendToneTriggerRef.current = (trigger: string) => {
      if (geminiLive.isConnected && isSessionActive) {
        // 替换 {LANG} 占位符为实际语言代码
        const lang = preferredLanguagesRef.current?.[0] || 'en-US';
        const triggerWithLanguage = trigger.replace('{LANG}', lang);
        geminiLive.sendTextMessage(triggerWithLanguage);
        if (import.meta.env.DEV) {
          console.log('📤 发送语气切换触发词:', triggerWithLanguage);
        }
      } else if (import.meta.env.DEV) {
        console.log('⏸️ 跳过语气切换触发词:', {
          isConnected: geminiLive.isConnected,
          isSessionActive,
          trigger,
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
  /**
   * 同步 VAD 最后说话时间到 ref，供空闲检测使用
   */
  useEffect(() => {
    lastSpeakingTimeRef.current = vad.lastSpeakingTime;
  }, [vad.lastSpeakingTime]);
  /**
   * 同步任务开始时间到 ref，供空闲检测兜底使用
   */
  useEffect(() => {
    taskStartTimeRef.current = taskStartTime;
  }, [taskStartTime]);
  /**
   * 同步 Gemini 连接状态到 ref，避免 idle 检测 effect 抖动
   */
  useEffect(() => {
    isGeminiConnectedRef.current = geminiLive.isConnected;
  }, [geminiLive.isConnected]);
  /**
   * 同步断开函数到 ref，避免函数引用变化导致 effect 反复重建
   */
  useEffect(() => {
    disconnectSessionOnlyRef.current = geminiLive.disconnectSessionOnly;
  }, [geminiLive.disconnectSessionOnly]);

  // ==========================================
  // 智能空闲断开（Idle Disconnect for Campfire Mode）
  // ==========================================
  // 功能：2 分钟不说话自动断开 AI 会话（省 Token），同时进入静默模式
  // 用户再次说话时自动重连，并注入最近对话上下文。
  const reconnectFromIdle = useCallback(async () => {
    const savedSession = lastSessionParamsRef.current;
    if (!savedSession) {
      throw new Error('缺少会话参数，无法自动重连');
    }

    const { taskDescription, options } = savedSession;
    const { userId, customSystemInstruction, userName, preferredLanguages } = options || {};

    setIsConnecting(true);
    setConnectionError(null);

    // 默认优先使用缓存系统指令，降低重连时延
    let systemInstruction =
      customSystemInstruction || lastSystemInstructionRef.current || '';

    if (!systemInstruction) {
      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置，无法自动重连');
      }

      const instructionResult = await supabaseClient.functions.invoke('get-system-instruction', {
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
            day: 'numeric',
          }),
          localDateISO: new Date().toISOString().split('T')[0],
        },
      });

      if (instructionResult.error) {
        throw new Error(`重连时获取系统指令失败: ${instructionResult.error.message}`);
      }

      systemInstruction = instructionResult.data.systemInstruction;
    }

    const reconnectContext = buildReconnectContext(
      conversationHistoryRef.current,
      taskDescription,
    );
    const reconnectInstruction = reconnectContext
      ? `${systemInstruction}\n\n${reconnectContext}`
      : systemInstruction;

    const voiceName = getVoiceName();
    const token = await fetchGeminiToken();

    await withTimeout(
      geminiLive.connect(reconnectInstruction, undefined, token, voiceName),
      CONNECTION_TIMEOUT_MS,
      '重连 AI 服务超时，请稍后重试',
    );

    isIdleDisconnectedRef.current = false;
    setIsConnecting(false);
    setIsSilentMode(false);
    setIsObserving(false);

    if (import.meta.env.DEV) {
      console.log('✅ AI 自动重连成功（含上下文注入）');
    }
  }, [geminiLive]);

  useEffect(() => {
    if (!enableIdleDisconnect || !isSessionActive) {
      if (import.meta.env.DEV) {
        console.log('🧪 idle monitor disabled', {
          enableIdleDisconnect,
          isSessionActive,
        });
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log('🧪 idle monitor enabled', {
        enableIdleDisconnect,
        isSessionActive,
      });
    }

    const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 分钟
    const CHECK_INTERVAL_MS = 10 * 1000; // 每 10 秒检查一次

    idleCheckIntervalRef.current = window.setInterval(() => {
      if (isIdleDisconnectedRef.current) {
        return;
      }

      const now = Date.now();
      const lastSpeakingTime = lastSpeakingTimeRef.current
        ? lastSpeakingTimeRef.current.getTime()
        : taskStartTimeRef.current;
      const silenceDuration = now - lastSpeakingTime;

      if (import.meta.env.DEV) {
        console.log('🧪 idle check', {
          now: new Date(now).toLocaleTimeString(),
          lastSpeakingTime: lastSpeakingTimeRef.current?.toISOString() ?? null,
          silenceSeconds: Math.floor(silenceDuration / 1000),
          vadIsSpeaking: vad.isSpeaking,
          vadVolume: vad.currentVolume,
          aiIsSpeaking: geminiLive.isSpeaking,
          isConnected: isGeminiConnectedRef.current,
        });
      }

      if (silenceDuration > IDLE_THRESHOLD_MS && isGeminiConnectedRef.current) {
        if (import.meta.env.DEV) {
          console.log('💤 检测到 2 分钟静默，触发空闲断开...');
          console.log(`   静默时长: ${Math.floor(silenceDuration / 1000)}秒`);
        }

        setIsSilentMode(true);
        isIdleDisconnectedRef.current = true;
        disconnectSessionOnlyRef.current();

        if (import.meta.env.DEV) {
          console.log('💤 空闲断开完成 - AI 会话休眠，媒体保持开启');
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
        idleCheckIntervalRef.current = null;
      }
    };
  }, [enableIdleDisconnect, isSessionActive]);

  // ==========================================
  // 自动重连（用户说话时唤醒 AI）
  // ==========================================
  useEffect(() => {
    if (
      !enableIdleDisconnect ||
      !isSessionActive ||
      !isIdleDisconnectedRef.current ||
      geminiLive.isConnected ||
      !vad.isSpeaking ||
      isReconnectingRef.current
    ) {
      return;
    }

    if (import.meta.env.DEV) {
      console.log('🎤 检测到用户说话，唤醒 AI...');
    }

    isReconnectingRef.current = true;

    void reconnectFromIdle()
      .catch((error) => {
        console.error('❌ AI 自动重连失败:', error);
        setConnectionError(error instanceof Error ? error.message : '自动重连失败');
      })
      .finally(() => {
        isReconnectingRef.current = false;
      });
  }, [
    enableIdleDisconnect,
    isSessionActive,
    geminiLive.isConnected,
    vad.isSpeaking,
    reconnectFromIdle,
  ]);

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
    enabled: isSessionActive && geminiLive.isConnected,
    enableMemoryRetrieval: true,
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
  });

  // 更新 orchestratorRef，避免 onTranscriptUpdate 闭包问题
  useEffect(() => {
    orchestratorRef.current = {
      onUserSpeech: messageOrchestrator.onUserSpeech,
      onAISpeech: messageOrchestrator.onAISpeech,
      onTurnComplete: messageOrchestrator.onTurnComplete,
      sendMessageForAction: messageOrchestrator.sendMessageForAction,
      getContext: messageOrchestrator.getContext,
    };
  }, [
    messageOrchestrator.onUserSpeech,
    messageOrchestrator.onAISpeech,
    messageOrchestrator.onTurnComplete,
    messageOrchestrator.sendMessageForAction,
    messageOrchestrator.getContext,
  ]);

  // ==========================================
  // 虚拟消息（原有的定时触发系统）
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
    // 🔧 修复语言污染：传入用户首选语言，确保虚拟消息触发词携带正确语言
    preferredLanguage: preferredLanguagesRef.current?.[0],
    // 静默模式：用户请求安静陪伴
    silentMode: isSilentMode,
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
    // 任务模式在真正进入专注阶段时重置开始时间，避免把连接耗时算进任务时长
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
    setIsSilentMode(false);
    isIdleDisconnectedRef.current = false;
    isReconnectingRef.current = false;

    if (idleCheckIntervalRef.current) {
      clearInterval(idleCheckIntervalRef.current);
      idleCheckIntervalRef.current = null;
    }

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
    options?: StartSessionOptions
  ) => {
    const { userId, customSystemInstruction, userName, preferredLanguages, taskId } = options || {};
    processedTranscriptRef.current.clear();
    currentUserIdRef.current = userId || null;
    currentTaskDescriptionRef.current = taskDescription;
    // 🔧 重置流式响应相关的 refs
    currentTurnHasResistRef.current = false;
    lastProcessedRoleRef.current = null;
    currentTaskIdRef.current = taskId || null;
    // 保存首选语言，用于触发词生成时保持语言一致性
    preferredLanguagesRef.current = preferredLanguages || null;
    // Campfire 模式：加载本地对话历史（30 分钟内有效）
    if (sessionMode === 'campfire') {
      conversationHistoryRef.current = loadCampfireHistory(
        currentUserIdRef.current,
        taskDescription,
      );
    } else {
      conversationHistoryRef.current = [];
    }
    // 保存最近一次会话参数，供空闲重连使用
    lastSessionParamsRef.current = {
      taskDescription,
      options,
    };
    isIdleDisconnectedRef.current = false;
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
      // 为所有会话模式记录统一开始时间：
      // 1) campfire 模式用于 2 分钟空闲断开基准
      // 2) virtual message 用于避免重连时重复 opening
      setTaskStartTime(Date.now());

      // 步骤1：尝试启用摄像头（带重试机制）
      console.log('🎬 步骤1: 尝试启用摄像头...', { cameraEnabled: geminiLive.cameraEnabled });
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

            // 🔍 调试：打印具体错误信息
            console.error('❌ 摄像头启用异常:', cameraError);
            console.log('❌ 摄像头错误详情:', errorMessage);

            // 如果是权限被拒绝，不重试
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
        // 摄像头循环结束后的状态
        console.log(`📹 摄像头初始化循环结束: cameraSuccess=${cameraSuccess}, cameraEnabled=${geminiLive.cameraEnabled}`);
      }

      // 步骤2：启用麦克风
      console.log('🎤 步骤2: 启用麦克风...');
      if (!geminiLive.isRecording) {
        console.log('🎤 步骤2: 调用 toggleMicrophone()...');
        await geminiLive.toggleMicrophone();
        console.log('🎤 步骤2: toggleMicrophone() 完成');
      } else {
        console.log('🎤 步骤2: 麦克风已启用，跳过');
      }

      // 步骤3：并行获取系统指令和 Gemini token（带超时保护）
      console.log('⚡ 步骤3: 并行获取系统指令和 token...');

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
                  // 人类可读的日期，显示给 AI 用于自然对话
                  localDate: new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  }),
                  // ISO 格式日期 (YYYY-MM-DD)，用于记忆系统处理 event_date
                  localDateISO: new Date().toISOString().split('T')[0]
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

      if (systemInstruction) {
        lastSystemInstructionRef.current = systemInstruction;
      }

      if (import.meta.env.DEV) {
        console.log('✅ 并行获取完成，正在连接 Gemini Live...');
      }

      const campfireReconnectContext = sessionMode === 'campfire'
        ? buildReconnectContext(conversationHistoryRef.current, taskDescription)
        : '';
      const finalInstruction = systemInstruction && campfireReconnectContext
        ? `${systemInstruction}\n\n${campfireReconnectContext}`
        : systemInstruction;

      // 获取用户选择的 AI 声音
      const voiceName = getVoiceName();
      if (import.meta.env.DEV) {
        console.log('🎤 使用 AI 声音:', voiceName);
      }

      // 使用预获取的 token 连接（带超时保护）
      await withTimeout(
        geminiLive.connect(finalInstruction, undefined, token, voiceName),
        CONNECTION_TIMEOUT_MS,
        '连接 AI 服务超时，请检查网络连接后重试'
      );

      if (import.meta.env.DEV) {
        console.log('✅ 连接已建立');
      }

      setIsConnecting(false);
      setIsSessionActive(true);
      setIsObserving(true); // AI 开始观察用户

      // 任务模式才开启倒计时；篝火模式保持无限陪伴
      if (sessionMode === 'task') {
        startCountdown();
      }

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
  }, [initialTime, geminiLive, startCountdown, cleanup, enableToneManager, toneManager, sessionMode]);

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
    conversationHistoryRef.current = [];
    lastSessionParamsRef.current = null;
    lastSystemInstructionRef.current = '';
    isIdleDisconnectedRef.current = false;
    // 🔧 重置流式响应相关的 refs
    currentTurnHasResistRef.current = false;
    lastProcessedRoleRef.current = null;
    setConnectionError(null); // 清除错误状态
    setIsSilentMode(false);
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
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
        idleCheckIntervalRef.current = null;
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
    isSilentMode, // 静默模式：用户请求安静陪伴

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
    stopAudioImmediately,
    resetSession,
    saveSessionMemory,
    sendTextMessage: geminiLive.sendTextMessage,
    toggleCamera: geminiLive.toggleCamera,

    // 语气管理操作（高级用法，通常不需要手动调用）
    forceToneChange: toneManager.forceToneChange,

    // 动态虚拟消息调度器（方案 2：过渡话注入）
    orchestratorContext: messageOrchestrator.getContext,
    triggerMemoryRetrieval: messageOrchestrator.triggerMemoryRetrieval, // 手动触发记忆检索（调试用）

    // Refs（用于 UI）
    videoRef: geminiLive.videoRef,
    canvasRef: geminiLive.canvasRef,
  };
}
