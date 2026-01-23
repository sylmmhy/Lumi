import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from './useGeminiLive';
import { useVirtualMessages } from './useVirtualMessages';
import type { SuccessRecordForVM } from './useVirtualMessages';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useWaveformAnimation } from './useWaveformAnimation';
import { useToneManager } from './useToneManager';
import { getSupabaseClient } from '../lib/supabase';
import { updateReminder } from '../remindMe/services/reminderService';

// ==========================================
// 配置常量
// ==========================================

/** 连接超时时间（毫秒） */
const CONNECTION_TIMEOUT_MS = 15000;

/** 摄像头重试次数 */
const MAX_CAMERA_RETRIES = 2;

/** 摄像头重试间隔（毫秒） */
const CAMERA_RETRY_DELAY_MS = 1000;

/** 静默检测间隔（毫秒）- 用户多久不说话后 AI 主动提问 */
const SILENCE_CHECK_INTERVAL_MS = 30000;

/** AI 主动提问的最大次数（避免无限循环） */
const MAX_PROACTIVE_PROMPTS = 5;

// ==========================================
// 语气切换配置
// ==========================================

/** 根据抗拒次数获取语气类型 */
function getToneByResistCount(count: number): string {
  switch (count) {
    case 1:
      return 'acknowledge_tiny';
    case 2:
      return 'curious_memory';
    case 3:
      return 'tough_love';
    case 4:
      return 'absurd_humor';
    default:
      // 5次以上：在 tough_love 和 absurd_humor 之间循环
      return count % 2 === 1 ? 'tough_love' : 'absurd_humor';
  }
}

/** 获取语气的中文描述（用于日志） */
function getToneDescription(tone: string): string {
  const descriptions: Record<string, string> = {
    'friendly': '友好开场',
    'acknowledge_tiny': '承认+超小步骤',
    'curious_memory': '好奇探索+记忆成功',
    'tough_love': '严厉推力模式',
    'absurd_humor': '荒谬幽默模式',
    'gentle': '温和模式',
  };
  return descriptions[tone] || tone;
}

/**
 * 生成语气指令虚拟消息
 */
function generateToneInstruction(
  resistCount: number,
  isEmotional: boolean,
  hasSuccessMemory: boolean = false,
  successMemoryHint: string = ''
): string {
  // 情绪低落时，始终用 gentle
  if (isEmotional) {
    return `[TONE_INSTRUCTION] emotional_state=low_mood tone=gentle

The user seems emotionally struggling. Use GENTLE mode.
Be super soft and caring. Zero pressure. Validate their emotions first.

GOOD EXAMPLES:
- "听起来今天很不容易。我在这里陪你。"
- "Hey, today sounds really hard. I am here with you."
- "不用做很多。就陪你坐一会。"

BAD (DO NOT DO):
- Being harsh or using countdown
- Making jokes about furniture
- Pushing them to do the task`;
  }

  const tone = getToneByResistCount(resistCount);

  switch (tone) {
    case 'acknowledge_tiny':
      return `[TONE_INSTRUCTION] resist_count=${resistCount} tone=acknowledge_tiny

Use ACKNOWLEDGE + TINY STEP mode.
First acknowledge their feeling ("I get it", "Okay", "我懂"), then offer ONE embarrassingly tiny step.
Do NOT ask questions about why. Do NOT make jokes.

GOOD EXAMPLES:
- "我懂。那就...站起来？就这样，不用做别的。"
- "I get it. What if you just stood up? That is it."
- "好吧。那你就看一眼那封邮件的标题？不用点开。"

BAD (DO NOT DO):
- Asking "Why don't you want to?" (that is curious mode, for resist #2)
- Making jokes about crying furniture (that is humor mode, for resist #4+)
- Being harsh or disappointed (that is tough love, for resist #3)`;

    case 'curious_memory':
      if (hasSuccessMemory && successMemoryHint) {
        return `[TONE_INSTRUCTION] resist_count=${resistCount} tone=curious_memory has_success_memory=true

Use MEMORY RECALL mode. The user has past successes!
${successMemoryHint}

Remind them of their past success to motivate them. Be encouraging, not pushy.

GOOD EXAMPLES:
- "你之前也做过这个呀，当时是怎么开始的？"
- "You have done this before. How did you start last time?"
- "你已经坚持了好几次了，这次也可以的。"
- "上次你也不想，但最后还是做完了，记得那种感觉吗？"

BAD (DO NOT DO):
- Giving another tiny step (you already tried that in resist #1)
- Being harsh (that is tough love, for resist #3)
- Making jokes (that is humor, for resist #4+)`;
      } else {
        return `[TONE_INSTRUCTION] resist_count=${resistCount} tone=curious_memory has_success_memory=false

Use CURIOUS EXPLORATION mode. No past success data available.
Ask open questions about WHY they resist, or invite them to imagine the outcome.

GOOD EXAMPLES:
- "怎么了？今天是什么让这件事特别难？"
- "What is going on? What is making this hard today?"
- "你有没有想过，做完之后会是什么感觉？"
- "如果你现在站起来，5分钟后的你会怎么想？"
- "好奇问一下，是什么在挡着你？"

BAD (DO NOT DO):
- Giving another tiny step (you already tried that)
- Being harsh (that is tough love, for resist #3)
- Making jokes (that is humor, for resist #4+)`;
      }

    case 'tough_love':
      return `[TONE_INSTRUCTION] resist_count=${resistCount} tone=tough_love

Use TOUGH LOVE mode. Be HARSH and DISAPPOINTED.
Sound impatient. Use countdown or direct commands. NO jokes. NO softening. NO "I understand".

GOOD EXAMPLES:
- "够了。三、二、一。动。"
- "Enough. 3, 2, 1. Move."
- "我以为你不是这样的人。起来。"
- "I expected better from you. Get up."
- "累？谁不累。动。"
- "还要我说几遍？现在。"

BAD (DO NOT DO - VERY IMPORTANT):
- "你的床在哭" / "Your bed is crying" - This is HUMOR, absolutely BANNED!
- "我懂，但是..." / "I understand, but..." - No softening!
- Any jokes or personification of objects - BANNED in tough love!
- Being gentle or understanding - Wrong mode!`;

    case 'absurd_humor':
      return `[TONE_INSTRUCTION] resist_count=${resistCount} tone=absurd_humor

Use ABSURD HUMOR mode. Break the loop with ridiculous jokes.
Personify objects, make silly bets/challenges, sneak in a tiny step inside the joke.

GOOD EXAMPLES:
- "你的床在哭，说你压得它喘不过气了。站起来让它休息一下。"
- "Your bed is crying. It says you are crushing it. Stand up to give it a break."
- "我赌五毛钱你连站都不敢。来，证明我错了。"
- "I bet you cannot even stand up. Prove me wrong."
- "技术上来说，站起来只是竖着躺。试试？"

BAD (DO NOT DO):
- Being harsh or disappointed (that was tough love)
- Asking serious questions (that was curious mode)`;

    default:
      return '';
  }
}

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
  /** 是否启用虚拟消息（AI 主动问候），默认 false（已禁用，改用直接开场问候） */
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
    enableVirtualMessages = false, // 禁用虚拟消息，避免干扰语气切换
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

  // 🔧 修复流式响应问题：跟踪当前 AI 回复是否已检测到 [RESIST]
  // 因为 AI 回复是分 chunks 发送的，[RESIST] 只在第一个 chunk
  // 后续 chunks 不应该触发 recordAcceptance()
  const currentTurnHasResistRef = useRef<boolean>(false);
  // 跟踪上一条消息的角色，用于检测"新一轮"的开始
  const lastProcessedRoleRef = useRef<'user' | 'assistant' | null>(null);

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 🔧 防重复触发机制 - 记录上次处理的抗拒消息 ID
  const lastProcessedResistIdRef = useRef<string>('');

  // 🎯 语气切换：追踪确认的抗拒次数（基于 AI 的 [RESIST] 标记）
  const confirmedResistCountRef = useRef<number>(0);
  // 🔧 防止虚拟消息重复发送 - 记录上次发送语气指令时的抗拒计数
  const lastSentToneInstructionCountRef = useRef<number>(0);
  // 追踪情绪状态（基于 AI 的 [RESIST_EMO] 标记）
  const isEmotionalRef = useRef<boolean>(false);
  // 上一次的语气（用于日志显示切换）
  const lastToneRef = useRef<string>('friendly');

  // 🔇 静默检测相关 refs
  const lastActivityTimeRef = useRef<number>(Date.now());
  const proactivePromptCountRef = useRef<number>(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // 动态语气管理（Tone Manager）
  // ==========================================
  const toneManager = useToneManager({
    minToneChangeInterval: 15000,    // 15秒内不重复切换
    enableDebugLog: import.meta.env.DEV,
  });

  // 用于发送 tone 切换触发词的 ref（避免循环依赖）
  const sendToneTriggerRef = useRef<(trigger: string) => void>(() => {});

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
          userSpeechBufferRef.current = '';
        }

        // 🔧 检测新一轮 AI 回复的开始（上一条是用户消息）
        const isNewAITurn = lastProcessedRoleRef.current === 'user';

        // 动态语气管理：检测 AI 回复中的 [RESIST] 标记
        let displayText = lastMessage.text;
        if (enableToneManager) {
          // 🔧 新一轮开始时重置 flag
          // 注意：不在这里判断用户是否配合，因为 AI 回复是流式的
          // [RESIST] 可能在后面的 chunk 中才出现
          if (isNewAITurn) {
            currentTurnHasResistRef.current = false;
          }

          // 检测 [RESIST_EMO]（情绪性抗拒）或 [RESIST]（普通抗拒）或 [ACTION]（开始行动）
          const hasResistEmoTag = lastMessage.text.startsWith('[RESIST_EMO]');
          const hasResistTag = lastMessage.text.startsWith('[RESIST]');
          const hasActionTag = lastMessage.text.startsWith('[ACTION]');

          if (hasResistEmoTag) {
            // 移除 [RESIST_EMO] 标记
            displayText = lastMessage.text.replace(/^\[RESIST_EMO\]\s*/, '');
            currentTurnHasResistRef.current = true;

            // 🔧 防重复：检查是否已处理过这条消息
            if (lastProcessedResistIdRef.current !== messageId) {
              lastProcessedResistIdRef.current = messageId;
              
              // 🎯 标记为情绪性抗拒，下一轮用 gentle 模式
              confirmedResistCountRef.current += 1;
              isEmotionalRef.current = true;
              
              // 日志：显示语气切换
              const newTone = 'gentle';
              if (import.meta.env.DEV) {
                console.log('😢 [ToneManager] AI 检测到情绪性抗拒');
                console.log(`🔄 [ToneManager] 语气切换: ${getToneDescription(lastToneRef.current)} → ${getToneDescription(newTone)}`);
              }
              lastToneRef.current = newTone;

              // 🎯 立即发送下一轮的语气指令（在 AI 确认抗拒后立即发送，而不是等用户下次说话）
              if (geminiLive.isConnected) {
                const hasSuccessMemory = successRecordRef.current !== null && 
                                         successRecordRef.current.totalCompletions > 0;
                
                let successMemoryHint = '';
                if (hasSuccessMemory && successRecordRef.current) {
                  const record = successRecordRef.current;
                  const hints: string[] = [];
                  if (record.totalCompletions > 0) {
                    hints.push(`User has completed this type of task ${record.totalCompletions} time(s) before.`);
                  }
                  if (record.currentStreak > 0) {
                    hints.push(`User is on a ${record.currentStreak}-day streak.`);
                  }
                  if (record.lastDuration) {
                    hints.push(`Last time they did it for ${record.lastDuration} minutes.`);
                  }
                  if (record.personalBest) {
                    hints.push(`Their personal best is ${record.personalBest} minutes.`);
                  }
                  successMemoryHint = hints.join(' ');
                }
                
                const toneInstruction = generateToneInstruction(
                  confirmedResistCountRef.current,
                  isEmotionalRef.current,
                  hasSuccessMemory,
                  successMemoryHint
                );
                
                // 延迟 100ms 发送，确保 AI 当前回复完成
                setTimeout(() => {
                  if (geminiLive.isConnected) {
                    geminiLive.sendTextMessage(toneInstruction);
                    lastSentToneInstructionCountRef.current = confirmedResistCountRef.current;
                    if (import.meta.env.DEV) {
                      console.log(`📤 [ToneManager] 发送语气指令: resist=${confirmedResistCountRef.current}, emotional=${isEmotionalRef.current}, hasMemory=${hasSuccessMemory}`);
                    }
                  }
                }, 100);
              }

              // 注意：不再调用 toneManager.recordResistance()，避免重复日志
            }
          } else if (hasResistTag) {
            // 移除 [RESIST] 标记
            displayText = lastMessage.text.replace(/^\[RESIST\]\s*/, '');
            currentTurnHasResistRef.current = true;

            // 🔧 防重复：检查是否已处理过这条消息
            if (lastProcessedResistIdRef.current !== messageId) {
              lastProcessedResistIdRef.current = messageId;
              
              // 🎯 增加确认的抗拒计数
              confirmedResistCountRef.current += 1;
              isEmotionalRef.current = false; // 普通抗拒，不是情绪性的
              
              // 日志：显示语气切换
              const newTone = getToneByResistCount(confirmedResistCountRef.current);
              if (import.meta.env.DEV) {
                console.log(`🚫 [ToneManager] AI 确认用户抗拒 (第 ${confirmedResistCountRef.current} 次)`);
                console.log(`🔄 [ToneManager] 语气切换: ${getToneDescription(lastToneRef.current)} → ${getToneDescription(newTone)}`);
              }
              lastToneRef.current = newTone;

              // 🎯 立即发送下一轮的语气指令（在 AI 确认抗拒后立即发送，而不是等用户下次说话）
              if (geminiLive.isConnected) {
                const hasSuccessMemory = successRecordRef.current !== null && 
                                         successRecordRef.current.totalCompletions > 0;
                
                let successMemoryHint = '';
                if (hasSuccessMemory && successRecordRef.current) {
                  const record = successRecordRef.current;
                  const hints: string[] = [];
                  if (record.totalCompletions > 0) {
                    hints.push(`User has completed this type of task ${record.totalCompletions} time(s) before.`);
                  }
                  if (record.currentStreak > 0) {
                    hints.push(`User is on a ${record.currentStreak}-day streak.`);
                  }
                  if (record.lastDuration) {
                    hints.push(`Last time they did it for ${record.lastDuration} minutes.`);
                  }
                  if (record.personalBest) {
                    hints.push(`Their personal best is ${record.personalBest} minutes.`);
                  }
                  successMemoryHint = hints.join(' ');
                }
                
                const toneInstruction = generateToneInstruction(
                  confirmedResistCountRef.current,
                  isEmotionalRef.current,
                  hasSuccessMemory,
                  successMemoryHint
                );
                
                // 延迟 100ms 发送，确保 AI 当前回复完成
                setTimeout(() => {
                  if (geminiLive.isConnected) {
                    geminiLive.sendTextMessage(toneInstruction);
                    lastSentToneInstructionCountRef.current = confirmedResistCountRef.current;
                    if (import.meta.env.DEV) {
                      console.log(`📤 [ToneManager] 发送语气指令: resist=${confirmedResistCountRef.current}, emotional=${isEmotionalRef.current}, hasMemory=${hasSuccessMemory}`);
                    }
                  }
                }, 100);
              }

              // 注意：不再调用 toneManager.recordResistance()，避免重复日志
            }
          } else if (hasActionTag) {
            // 移除 [ACTION] 标记
            displayText = lastMessage.text.replace(/^\[ACTION\]\s*/, '');

            // 🔧 防重复：检查是否已处理过这条消息
            if (lastProcessedResistIdRef.current !== messageId) {
              lastProcessedResistIdRef.current = messageId;
              
              // 🎯 用户开始行动，重置抗拒计数
              confirmedResistCountRef.current = 0;
              isEmotionalRef.current = false;
              
              if (import.meta.env.DEV) {
                console.log('🎉 [ToneManager] 用户开始行动！');
                console.log(`🔄 [ToneManager] 语气重置: ${getToneDescription(lastToneRef.current)} → ${getToneDescription('friendly')}`);
              }
              lastToneRef.current = 'friendly';

              // 注意：不再调用 toneManager.recordActionStarted()，避免重复日志
            }
          }
        }

        // 存储 AI 消息（使用处理后的文本）
        addMessageRef.current('ai', displayText);
        if (import.meta.env.DEV) {
          console.log('🤖 AI 说:', displayText);
        }

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'assistant';
      }

      if (lastMessage.role === 'user') {
        // 🔧 用户开始说话时，不再自动调用 recordAcceptance()
        // 因为 AI 有时不会加 [RESIST] 标记，但用户实际上在抗拒
        // 只依赖 [ACTION] 标记来重置抗拒计数
        
        // 累积用户语音碎片，不立即存储
        if (isValidUserSpeech(lastMessage.text)) {
          userSpeechBufferRef.current += lastMessage.text;
          // 🔇 用户说话了，更新活动时间并重置主动提问计数
          lastActivityTimeRef.current = Date.now();
          proactivePromptCountRef.current = 0;
          
          // 注意：语气指令现在在 AI 确认抗拒后立即发送，不再在用户说话时发送
        }

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'user';
      }
    },
  });

  // 更新 sendToneTrigger ref（使用 geminiLive.sendTextMessage）
  useEffect(() => {
    sendToneTriggerRef.current = (trigger: string) => {
      if (geminiLive.isConnected && isSessionActive) {
        geminiLive.sendTextMessage(trigger);
        if (import.meta.env.DEV) {
          console.log('📤 发送语气切换触发词:', trigger);
        }
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

  // 当 AI 开始说话时，关闭观察状态并更新活动时间
  useEffect(() => {
    if (geminiLive.isSpeaking) {
      // AI 说话也算活动，重置静默计时器
      lastActivityTimeRef.current = Date.now();
      
      if (isObserving) {
        setIsObserving(false);
        if (import.meta.env.DEV) {
          console.log('👀 AI 开始说话，观察阶段结束');
        }
      }
    }
  }, [geminiLive.isSpeaking, isObserving]);

  // ==========================================
  // 🔇 静默检测 - 用户长时间不说话时 AI 主动提问
  // ==========================================
  useEffect(() => {
    // 只有在会话活跃时才启动静默检测
    if (!isSessionActive || !geminiLive.isConnected) {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

    // 启动静默检测定时器
    silenceTimerRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityTimeRef.current;

      // 检查是否超过静默间隔
      if (timeSinceLastActivity >= SILENCE_CHECK_INTERVAL_MS) {
        // 检查是否达到最大主动提问次数
        if (proactivePromptCountRef.current >= MAX_PROACTIVE_PROMPTS) {
          if (import.meta.env.DEV) {
            console.log('🔇 已达到最大主动提问次数，停止提问');
          }
          return;
        }

        // 如果 AI 正在说话，不要打断
        if (geminiLive.isSpeaking) {
          return;
        }

        // 发送主动提问
        const currentTime = new Date();
        const timeStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
        const elapsedSeconds = Math.floor((now - taskStartTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        
        // 根据主动提问次数选择不同的提问类型
        let promptType = 'check_in';
        if (proactivePromptCountRef.current === 0) {
          promptType = 'friendly_check';
        } else if (proactivePromptCountRef.current === 1) {
          promptType = 'curious';
        } else if (proactivePromptCountRef.current >= 2) {
          promptType = 'encouraging';
        }

        geminiLive.sendTextMessage(
          `[SILENCE_CHECK] type=${promptType} silence_duration=${Math.floor(timeSinceLastActivity / 1000)}s elapsed=${elapsedMinutes}m prompt_count=${proactivePromptCountRef.current + 1} current_time=${timeStr}`
        );

        if (import.meta.env.DEV) {
          console.log(`🔇 检测到用户静默 ${Math.floor(timeSinceLastActivity / 1000)}秒，发送主动提问 #${proactivePromptCountRef.current + 1}`);
        }

        // 更新计数和活动时间
        proactivePromptCountRef.current += 1;
        lastActivityTimeRef.current = now;
      }
    }, 5000); // 每5秒检查一次

    return () => {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [isSessionActive, geminiLive.isConnected, geminiLive.isSpeaking, geminiLive.sendTextMessage, taskStartTime]);

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

    // 3. 清理静默检测定时器
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // 4. 重置状态
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
    // 🔧 重置流式响应相关的 refs
    currentTurnHasResistRef.current = false;
    lastProcessedRoleRef.current = null;
    currentTaskIdRef.current = taskId || null;
    // 🔇 重置静默检测相关的 refs
    lastActivityTimeRef.current = Date.now();
    proactivePromptCountRef.current = 0;
    setIsConnecting(true);
    setConnectionError(null); // 清除之前的错误

    // 重置语气管理器状态（新会话从 friendly 开始）
    if (enableToneManager) {
      toneManager.resetToneState();
    }
    
    // 🎯 重置语气切换相关状态
    confirmedResistCountRef.current = 0;
    isEmotionalRef.current = false;
    lastToneRef.current = 'friendly';
    lastSentToneInstructionCountRef.current = 0;

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

      // 🔧 直接发送开场问候
      // connect() 完成后 session 已建立，但需要短暂延迟确保 WebSocket 完全就绪
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // 延迟 300ms 确保 WebSocket 完全就绪（现在使用 sessionRef 检查，应该更可靠）
      setTimeout(() => {
        geminiLive.sendTextMessage(`[GREETING] task="${taskDescription}" current_time=${currentTime}`);
        if (import.meta.env.DEV) {
          console.log('👋 发送开场问候，任务:', taskDescription);
        }
      }, 300);

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
    // 🔧 重置流式响应相关的 refs
    currentTurnHasResistRef.current = false;
    lastProcessedRoleRef.current = null;
    // 🎯 重置语气切换相关状态
    confirmedResistCountRef.current = 0;
    isEmotionalRef.current = false;
    lastToneRef.current = 'friendly';
    lastSentToneInstructionCountRef.current = 0;
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
