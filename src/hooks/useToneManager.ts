/**
 * useToneManager - 动态语气管理 Hook
 *
 * 追踪用户抗拒信号，管理AI的说话风格，避免重复语气
 *
 * 设计原则：
 * - 检测用户拒绝/抗拒模式
 * - 在不同语气风格间智能切换
 * - 避免短时间内重复使用同一风格
 * - 对真正的困难保持敏感
 */
import { useState, useCallback, useMemo } from 'react';

// ============================================
// 类型定义
// ============================================

/**
 * 可用的语气风格
 *
 * friendly: 温暖鼓励（默认）
 * sneaky_friend: 损友式调侃（亲密但不伤人）
 * humorous: 幽默荒诞（打破僵局）
 * direct: 直接坦率（尊重但不绕弯）
 */
export type ToneStyle =
  | 'friendly'
  | 'sneaky_friend'
  | 'humorous'
  | 'direct';

/**
 * 用户抗拒信号类型
 *
 * ai_detected: AI 自动检测到用户抗拒（通过 [RESIST] 标记）
 * 其他类型保留用于兼容性，但主要使用 ai_detected
 */
export type ResistanceSignal =
  | 'ai_detected'         // AI 自动检测（推荐，支持所有语言）
  | 'explicit_refusal'    // 明确拒绝（保留用于兼容）
  | 'excuse'              // 找借口（保留用于兼容）
  | 'silence'             // 长时间沉默（外部判断）
  | 'topic_change'        // 转移话题（外部判断）
  | 'negative_sentiment'; // 负面情绪（外部判断）

/**
 * Tone状态
 */
export interface ToneState {
  /** 当前使用的语气风格 */
  currentTone: ToneStyle;
  /** 连续抗拒次数 */
  consecutiveRejections: number;
  /** 最近使用过的语气（避免重复） */
  usedTones: ToneStyle[];
  /** 上次语气切换的时间戳 */
  lastToneChangeTime: number;
  /** 累计切换次数（用于分析） */
  totalToneChanges: number;
}

/**
 * Hook配置选项
 */
export interface UseToneManagerOptions {
  /** 触发切换的连续拒绝次数阈值，默认2 */
  rejectionThreshold?: number;
  /** 语气切换的最小间隔（毫秒），默认30000（30秒） */
  minToneChangeInterval?: number;
  /** 启用调试日志，默认开发环境启用 */
  enableDebugLog?: boolean;
}

/**
 * Tone切换触发词的格式
 */
export interface ToneTrigger {
  /** 触发词字符串 */
  trigger: string;
  /** 目标语气 */
  targetTone: ToneStyle;
  /** 当前时间（用于上下文） */
  currentTime: string;
}

// ============================================
// 抗拒分析类型（新增）
// ============================================

/**
 * 抗拒类型
 *
 * emotional: 情感相关的抗拒（分手、压力、孤独等）
 * explicit_stop: 明确表示不想做
 * task_resistance: 普通任务抗拒（借口、拖延）
 */
export type ResistanceType = 'emotional' | 'explicit_stop' | 'task_resistance';

/**
 * 建议的响应动作
 *
 * empathy: 高强度情感 → 优先共情安慰
 * listen: 低强度情感 → 先倾听再引导
 * accept_stop: 明确拒绝 → 优雅接受
 * tiny_step: 普通抗拒 → 推进更小步骤
 * tone_shift: 连续抗拒 → 切换语气风格
 */
export type SuggestedAction = 'empathy' | 'listen' | 'accept_stop' | 'tiny_step' | 'tone_shift';

/**
 * 抗拒分析结果
 */
export interface ResistanceAnalysis {
  /** 抗拒类型 */
  type: ResistanceType;
  /** 建议的响应动作 */
  suggestedAction: SuggestedAction;
  /** 情绪强度（0-1，仅当 type=emotional 时有意义） */
  emotionIntensity?: number;
  /** 检测到的情绪类型 */
  emotion?: 'sad' | 'anxious' | 'frustrated' | 'tired' | 'neutral';
  /** 分析依据 */
  reason: string;
}

// ============================================
// 常量
// ============================================

/** 语气轮换顺序 */
const TONE_ROTATION: ToneStyle[] = ['friendly', 'sneaky_friend', 'humorous', 'direct'];

/** 语气描述（用于调试） */
const TONE_DESCRIPTIONS: Record<ToneStyle, string> = {
  friendly: 'Warm & Encouraging',
  sneaky_friend: 'Teasing Friend',
  humorous: 'Absurd Humor',
  direct: 'Direct & Frank',
};

/** 抗拒信号描述（用于调试） */
const SIGNAL_DESCRIPTIONS: Record<ResistanceSignal, string> = {
  ai_detected: 'AI detected resistance',
  explicit_refusal: 'Explicit refusal',
  excuse: 'Making excuses',
  silence: 'Silence',
  topic_change: 'Topic change',
  negative_sentiment: 'Negative sentiment',
};

/**
 * 明确拒绝的关键词（多语言）
 * 用于检测用户是否明确表示不想做任务
 */
const EXPLICIT_STOP_KEYWORDS = [
  // 英文
  "don't want to", "i don't want", "not doing", "i'm not doing", "i won't",
  "forget it", "never mind", "skip", "give up", "quit", "stop",
  // 中文
  '不想', '不做了', '算了', '放弃', '不干了', '别做了', '不要做',
  // 中文口语
  '懒得', '不管了', '随便了',
];

// ============================================
// 抗拒分析函数（新增）
// ============================================

/**
 * 话题检测结果接口（从 types.ts 简化）
 * 用于类型检查，避免循环依赖
 */
interface TopicResultForAnalysis {
  topic: { id: string; name: string } | null;
  emotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired' | 'neutral';
  emotionIntensity?: number;
  confidence?: number;
}

/**
 * 分析用户抗拒的类型和建议动作
 *
 * 决策逻辑：
 * 1. 检测到情感话题（relationship, breakup, stress 等） → type: 'emotional'
 *    - 高强度（≥0.7）→ suggestedAction: 'empathy'
 *    - 低强度（<0.7）→ suggestedAction: 'listen'
 * 2. 明确说"不想做"、"算了" → type: 'explicit_stop', suggestedAction: 'accept_stop'
 * 3. 其他借口 → type: 'task_resistance'
 *    - 根据连续抗拒次数决定 suggestedAction: 'tiny_step' 或 'tone_shift'
 *
 * @param userMessage - 用户说的话
 * @param topicResult - 话题检测结果（可选，来自 Semantic Router）
 * @param consecutiveRejections - 连续抗拒次数（用于判断是否需要 tone_shift）
 * @returns 抗拒分析结果
 */
export function analyzeResistance(
  userMessage: string,
  topicResult?: TopicResultForAnalysis | null,
  consecutiveRejections: number = 0
): ResistanceAnalysis {
  const lowerMessage = userMessage.toLowerCase();

  // ====== 情感类话题检测 ======
  // 优先判断：如果 Semantic Router 检测到情感类话题
  const emotionalTopicIds = [
    'relationship_issue',
    'breakup',
    'stress',
    'loneliness',
  ];

  if (topicResult?.topic && emotionalTopicIds.includes(topicResult.topic.id)) {
    const intensity = topicResult.emotionIntensity ?? 0.6;
    const emotion = topicResult.emotion ?? 'sad';

    if (intensity >= 0.7) {
      return {
        type: 'emotional',
        suggestedAction: 'empathy',
        emotionIntensity: intensity,
        emotion,
        reason: `检测到强烈情感话题: ${topicResult.topic.name} (强度: ${(intensity * 100).toFixed(0)}%)`,
      };
    } else {
      return {
        type: 'emotional',
        suggestedAction: 'listen',
        emotionIntensity: intensity,
        emotion,
        reason: `检测到情感话题: ${topicResult.topic.name} (强度: ${(intensity * 100).toFixed(0)}%)，先倾听`,
      };
    }
  }

  // ====== 明确拒绝检测 ======
  const hasExplicitStop = EXPLICIT_STOP_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (hasExplicitStop) {
    return {
      type: 'explicit_stop',
      suggestedAction: 'accept_stop',
      reason: `用户明确表示不想做: "${userMessage.substring(0, 50)}..."`,
    };
  }

  // ====== 普通任务抗拒 ======
  // 根据连续抗拒次数决定策略
  if (consecutiveRejections >= 2) {
    return {
      type: 'task_resistance',
      suggestedAction: 'tone_shift',
      reason: `连续抗拒 ${consecutiveRejections} 次，建议切换语气`,
    };
  }

  return {
    type: 'task_resistance',
    suggestedAction: 'tiny_step',
    reason: `普通抗拒，建议推进更小的步骤`,
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取当前本地时间字符串（HH:MM格式）
 */
function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 选择下一个语气（避免重复最近用过的）
 */
function selectNextTone(currentTone: ToneStyle, usedTones: ToneStyle[]): ToneStyle {
  // 找出最近没用过的语气
  const availableTones = TONE_ROTATION.filter(t => !usedTones.includes(t));

  if (availableTones.length > 0) {
    // 优先选择没用过的
    return availableTones[0];
  }

  // 如果都用过了，按顺序轮换
  const currentIndex = TONE_ROTATION.indexOf(currentTone);
  return TONE_ROTATION[(currentIndex + 1) % TONE_ROTATION.length];
}

// ============================================
// Hook 实现
// ============================================

/**
 * Tone Manager Hook
 *
 * 管理AI说话风格的状态，支持动态切换
 *
 * 注意：抗拒信号检测现在由 AI 完成（通过 [RESIST] 标记），
 * 不再使用客户端关键词匹配，以支持所有语言。
 *
 * @example
 * ```tsx
 * const {
 *   toneState,
 *   recordResistance,
 *   recordAcceptance,
 *   generateToneTrigger,
 * } = useToneManager();
 *
 * // 在处理 AI 回复时检测 [RESIST] 标记
 * if (aiMessage.startsWith('[RESIST]')) {
 *   const cleanMessage = aiMessage.replace(/^\[RESIST\]\s*\/, '');
 *   recordResistance('ai_detected');
 *   // ... 发送 tone 切换触发词
 * }
 * ```
 */
export function useToneManager(options: UseToneManagerOptions = {}) {
  const {
    rejectionThreshold = 2,
    minToneChangeInterval = 30000, // 30秒
    enableDebugLog = import.meta.env.DEV,
  } = options;

  // ====== State ======
  const [toneState, setToneState] = useState<ToneState>({
    currentTone: 'friendly',
    consecutiveRejections: 0,
    usedTones: ['friendly'],
    lastToneChangeTime: 0,
    totalToneChanges: 0,
  });

  // ====== 调试日志 ======
  const log = useCallback((emoji: string, message: string, ...args: unknown[]) => {
    if (enableDebugLog) {
      console.log(`${emoji} [ToneManager] ${message}`, ...args);
    }
  }, [enableDebugLog]);

  // ====== 记录抗拒信号 ======
  /**
   * 返回触发词字符串（如果语气切换发生），否则返回 null
   * 注意：直接返回触发词字符串，避免 React 闭包过期问题
   */
  const recordResistance = useCallback((signal: ResistanceSignal): string | null => {
    let triggerString: string | null = null;

    setToneState(prev => {
      const newRejectionCount = prev.consecutiveRejections + 1;

      log('🚫', `User resistance signal: ${SIGNAL_DESCRIPTIONS[signal]} (consecutive: ${newRejectionCount})`);

      // 检查是否应该切换语气
      if (newRejectionCount >= rejectionThreshold) {
        const now = Date.now();
        const timeSinceLastChange = now - prev.lastToneChangeTime;

        // 冷却期检查
        if (timeSinceLastChange < minToneChangeInterval && prev.lastToneChangeTime > 0) {
          const remaining = Math.round((minToneChangeInterval - timeSinceLastChange) / 1000);
          log('⏳', `Tone switch cooling down (${remaining}s remaining)`);
          return { ...prev, consecutiveRejections: newRejectionCount };
        }

        // 选择下一个语气
        const nextTone = selectNextTone(prev.currentTone, prev.usedTones);

        log('🔄', `Tone switch: ${TONE_DESCRIPTIONS[prev.currentTone]} → ${TONE_DESCRIPTIONS[nextTone]}`);

        // 直接生成触发词字符串（避免闭包过期）
        // 格式：[TONE_SHIFT] style=X current_time=HH:MM language={LANG}
        // 注意：{LANG} 占位符会被 useAICoachSession 替换为实际语言代码
        triggerString = `[TONE_SHIFT] style=${nextTone} current_time=${getCurrentTimeString()} language={LANG}`;
        log('📤', `Generated trigger: ${triggerString}`);

        return {
          currentTone: nextTone,
          consecutiveRejections: 0,
          usedTones: [...prev.usedTones.slice(-2), nextTone], // 保留最近3个
          lastToneChangeTime: now,
          totalToneChanges: prev.totalToneChanges + 1,
        };
      }

      return { ...prev, consecutiveRejections: newRejectionCount };
    });

    return triggerString;
  }, [rejectionThreshold, minToneChangeInterval, log]);

  // ====== 记录用户配合 ======
  const recordAcceptance = useCallback(() => {
    setToneState(prev => {
      if (prev.consecutiveRejections > 0) {
        log('✅', 'User cooperating, resetting resistance count');
        return { ...prev, consecutiveRejections: 0 };
      }
      return prev;
    });
  }, [log]);

  // ====== 生成语气切换触发词 ======
  const generateToneTrigger = useCallback((): ToneTrigger | null => {
    const { currentTone, lastToneChangeTime } = toneState;

    // 只有在刚切换过语气时（5秒内）才生成触发词
    const timeSinceChange = Date.now() - lastToneChangeTime;
    if (timeSinceChange < 5000 && lastToneChangeTime > 0) {
      const trigger: ToneTrigger = {
        trigger: `[TONE_SHIFT] style=${currentTone} current_time=${getCurrentTimeString()} language={LANG}`,
        targetTone: currentTone,
        currentTime: getCurrentTimeString(),
      };

      log('📤', `Generated trigger: ${trigger.trigger}`);
      return trigger;
    }

    return null;
  }, [toneState, log]);

  // ====== 强制切换语气（手动触发） ======
  const forceToneChange = useCallback((targetTone: ToneStyle): ToneTrigger => {
    log('🎯', `Manual tone switch: → ${TONE_DESCRIPTIONS[targetTone]}`);

    setToneState(prev => ({
      ...prev,
      currentTone: targetTone,
      consecutiveRejections: 0,
      usedTones: [...prev.usedTones.slice(-2), targetTone],
      lastToneChangeTime: Date.now(),
      totalToneChanges: prev.totalToneChanges + 1,
    }));

    return {
      trigger: `[TONE_SHIFT] style=${targetTone} current_time=${getCurrentTimeString()} language={LANG}`,
      targetTone,
      currentTime: getCurrentTimeString(),
    };
  }, [log]);

  // ====== 重置状态（新会话开始时） ======
  const resetToneState = useCallback(() => {
    log('🔄', 'Resetting tone state');
    setToneState({
      currentTone: 'friendly',
      consecutiveRejections: 0,
      usedTones: ['friendly'],
      lastToneChangeTime: 0,
      totalToneChanges: 0,
    });
  }, [log]);

  // ====== 派生状态 ======
  const derivedState = useMemo(() => ({
    /** 当前语气描述 */
    currentToneDescription: TONE_DESCRIPTIONS[toneState.currentTone],
    /** 是否接近切换阈值 */
    isNearThreshold: toneState.consecutiveRejections >= rejectionThreshold - 1,
    /** 是否在冷却期 */
    isInCooldown: Date.now() - toneState.lastToneChangeTime < minToneChangeInterval && toneState.lastToneChangeTime > 0,
    /** 可用的语气列表 */
    availableTones: TONE_ROTATION,
    /** 语气描述映射 */
    toneDescriptions: TONE_DESCRIPTIONS,
  }), [toneState, rejectionThreshold, minToneChangeInterval]);

  return {
    // 状态
    toneState,
    ...derivedState,

    // 操作
    recordResistance,
    recordAcceptance,
    generateToneTrigger,
    forceToneChange,
    resetToneState,
  };
}

export default useToneManager;
