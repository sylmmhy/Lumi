/**
 * useToneManager - 动态语气管理 Hook
 *
 * 根据用户抗拒次数，按照特定流程切换 AI 说话风格
 * 支持循环：超过基础流程后，在多种语气间循环切换
 *
 * 流程设计：
 * 开始 → [友好开场] → 用户配合 → 正常陪伴 → 完成 → 庆祝
 *   ↓
 * 拒绝 #1 → [承认 + 超小步骤] acknowledge_tiny
 *   ↓
 * 拒绝 #2 → [好奇探索 + 记忆成功] curious_memory
 *   ↓
 * 拒绝 #3 → 检测情绪
 *            ├→ 真的低落 → [温和 + 最小步骤] gentle
 *            └→ 单纯拖延 → [严厉推力模式] tough_love 🔥
 *   ↓
 * 拒绝 #4 → [降到荒谬小 + 幽默] absurd_humor
 *   ↓
 * 拒绝 #5+ → 循环切换 (tough_love → absurd_humor → curious_memory → gentle → ...)
 *   ↓
 * 开始行动 → [立刻正向反馈]
 *   ↓
 * 完成 → [大力庆祝 + 记录EFFECTIVE] 🎉
 */
import { useState, useCallback, useMemo, useRef } from 'react';

// ============================================
// 类型定义
// ============================================

/**
 * 可用的语气风格
 */
export type ToneStyle =
  | 'friendly'
  | 'acknowledge_tiny'
  | 'curious_memory'
  | 'gentle'
  | 'tough_love'
  | 'absurd_humor';

/**
 * 用户情绪状态
 */
export type EmotionalState = 'unknown' | 'low_mood' | 'procrastinating';

/**
 * 用户抗拒信号类型
 */
export type ResistanceSignal =
  | 'ai_detected'           // AI 检测到普通抗拒（拖延）
  | 'ai_detected_emotional' // AI 检测到情绪性抗拒（真的难过/焦虑）
  | 'explicit_refusal'
  | 'excuse'
  | 'silence'
  | 'topic_change'
  | 'negative_sentiment';

/**
 * Tone状态
 */
export interface ToneState {
  currentTone: ToneStyle;
  consecutiveRejections: number;
  emotionalState: EmotionalState;
  lastToneChangeTime: number;
  totalToneChanges: number;
  hasStartedAction: boolean;
  /** 循环阶段计数（用于超过4次后的循环） */
  cycleIndex: number;
}

export interface UseToneManagerOptions {
  minToneChangeInterval?: number;
  enableDebugLog?: boolean;
}

export interface ToneTrigger {
  trigger: string;
  targetTone: ToneStyle;
  currentTime: string;
}

// ============================================
// 常量
// ============================================

const TONE_DESCRIPTIONS: Record<ToneStyle, string> = {
  friendly: '友好开场',
  acknowledge_tiny: '承认+超小步骤',
  curious_memory: '好奇探索+记忆成功',
  gentle: '温和模式',
  tough_love: '严厉推力模式',
  absurd_humor: '荒谬幽默模式',
};

const SIGNAL_DESCRIPTIONS: Record<ResistanceSignal, string> = {
  ai_detected: 'AI检测到拖延型抗拒',
  ai_detected_emotional: 'AI检测到情绪型抗拒',
  explicit_refusal: '明确拒绝',
  excuse: '找借口',
  silence: '沉默',
  topic_change: '转移话题',
  negative_sentiment: '负面情绪',
};

/** 超过4次后的循环语气序列 - 只在严厉和幽默之间交替 */
const CYCLE_TONES: ToneStyle[] = [
  'tough_love',
  'absurd_humor',
];

/** 防重复触发的最小间隔（毫秒）- 解决 React StrictMode 双重调用问题 */
const DEBOUNCE_INTERVAL_MS = 300;

// ============================================
// 辅助函数
// ============================================

function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 根据抗拒次数和情绪状态确定下一个语气
 * 支持循环：超过4次后在 tough_love 和 absurd_humor 之间交替
 * 
 * 流程：
 * #1 → acknowledge_tiny
 * #2 → curious_memory
 * #3 → tough_love (或 gentle 如果情绪低落)
 * #4 → absurd_humor
 * #5 → tough_love (循环开始)
 * #6 → absurd_humor
 * #7 → tough_love
 * ...
 */
function determineNextTone(
  rejectionCount: number,
  emotionalState: EmotionalState,
  currentCycleIndex: number
): { tone: ToneStyle; newCycleIndex: number } {
  // 基础流程：1-4次
  if (rejectionCount === 1) {
    return { tone: 'acknowledge_tiny', newCycleIndex: 0 };
  }
  
  if (rejectionCount === 2) {
    return { tone: 'curious_memory', newCycleIndex: 0 };
  }
  
  if (rejectionCount === 3) {
    if (emotionalState === 'low_mood') {
      return { tone: 'gentle', newCycleIndex: 0 };
    }
    // 🔧 第 3 次是 tough_love，设置 cycleIndex = 0 (tough_love 的索引)
    return { tone: 'tough_love', newCycleIndex: 0 };
  }
  
  if (rejectionCount === 4) {
    // 🔧 第 4 次是 absurd_humor，设置 cycleIndex = 1 (absurd_humor 的索引)
    // 这样第 5 次循环时会切换到 tough_love
    return { tone: 'absurd_humor', newCycleIndex: 1 };
  }
  
  // 超过 4 次：进入循环模式
  // 在 tough_love (索引 0) 和 absurd_humor (索引 1) 之间交替
  // CYCLE_TONES = ['tough_love', 'absurd_humor']
  const newCycleIndex = (currentCycleIndex + 1) % 2;
  const cycleTone = CYCLE_TONES[newCycleIndex];
  
  // 如果是情绪低落，优先使用温和语气
  if (emotionalState === 'low_mood') {
    return { tone: 'gentle', newCycleIndex };
  }
  
  return { tone: cycleTone, newCycleIndex };
}

// ============================================
// Hook 实现
// ============================================

export function useToneManager(options: UseToneManagerOptions = {}) {
  const {
    minToneChangeInterval = 10000, // 减少到10秒，让语气切换更快
    enableDebugLog = import.meta.env.DEV,
  } = options;

  const [toneState, setToneState] = useState<ToneState>({
    currentTone: 'friendly',
    consecutiveRejections: 0,
    emotionalState: 'unknown',
    lastToneChangeTime: 0,
    totalToneChanges: 0,
    hasStartedAction: false,
    cycleIndex: 0,
  });

  // 🔧 防重复触发机制（解决 React StrictMode 双重调用）
  const lastRecordTimeRef = useRef<number>(0);
  const lastRecordSignalRef = useRef<string>('');

  const log = useCallback((emoji: string, message: string, ...args: unknown[]) => {
    if (enableDebugLog) {
      console.log(`${emoji} [ToneManager] ${message}`, ...args);
    }
  }, [enableDebugLog]);

  /**
   * 记录抗拒信号 - 每次抗拒都会触发语气切换
   */
  const recordResistance = useCallback((signal: ResistanceSignal): string | null => {
    // 🔧 防重复触发：如果同一个信号在短时间内重复调用，忽略
    const now = Date.now();
    if (now - lastRecordTimeRef.current < DEBOUNCE_INTERVAL_MS && 
        lastRecordSignalRef.current === signal) {
      if (enableDebugLog) {
        console.log('⚠️ [ToneManager] 忽略重复的抗拒信号 (防抖动)');
      }
      return null;
    }
    lastRecordTimeRef.current = now;
    lastRecordSignalRef.current = signal;

    let triggerString: string | null = null;

    setToneState(prev => {
      if (prev.hasStartedAction) {
        log('✅', '用户已开始行动，忽略抗拒信号');
        return prev;
      }

      const timeSinceLastChange = now - prev.lastToneChangeTime;

      // 冷却期检查（但第一次抗拒不受冷却限制）
      // 🔧 修改：冷却期内完全忽略这次抗拒，不计数、不更新状态
      // 这样每个语气都能被用户体验到，不会跳过
      if (prev.consecutiveRejections >= 1 && timeSinceLastChange < minToneChangeInterval && prev.lastToneChangeTime > 0) {
        const remaining = Math.round((minToneChangeInterval - timeSinceLastChange) / 1000);
        log('⏳', `语气切换冷却中 (${remaining}秒后可切换) - 忽略这次抗拒`);
        // 🔧 关键修改：冷却期内完全不变，确保每个语气都能被体验到
        return prev;
      }

      // 冷却期外，正常处理
      const newRejectionCount = prev.consecutiveRejections + 1;
      
      // 更新情绪状态
      const newEmotionalState: EmotionalState = 
        signal === 'ai_detected_emotional' ? 'low_mood' : 'procrastinating';

      log('🚫', `用户抗拒信号: ${SIGNAL_DESCRIPTIONS[signal]} (连续 ${newRejectionCount} 次, 情绪: ${newEmotionalState})`);

      // 确定下一个语气
      const { tone: nextTone, newCycleIndex } = determineNextTone(
        newRejectionCount, 
        newEmotionalState,
        prev.cycleIndex
      );

      // 如果语气没变化且不在循环模式，不触发切换
      if (nextTone === prev.currentTone && newRejectionCount <= 4) {
        return { 
          ...prev, 
          consecutiveRejections: newRejectionCount,
          emotionalState: newEmotionalState,
        };
      }

      log('🔄', `语气切换: ${TONE_DESCRIPTIONS[prev.currentTone]} → ${TONE_DESCRIPTIONS[nextTone]} (拒绝 #${newRejectionCount}${newRejectionCount > 4 ? ' [循环模式]' : ''})`);

      // 生成触发词 - 纯英文指令，让 AI 自己翻译成用户的语言
      const toneInstructions: Record<ToneStyle, string> = {
        friendly: 'Be warm and friendly.',
        acknowledge_tiny: 'Say "I get it" then offer ONE tiny step. NO jokes, NO questions.',
        curious_memory: 'Ask WHY they resist. Example: "What is making this hard today?" Do NOT give steps yet.',
        gentle: 'Be soft and caring, zero pressure. Example: "Today sounds rough. I am here with you."',
        tough_love: '🚨 STRICT MODE! Sound DISAPPOINTED like a strict coach. Use COUNTDOWN or DIRECT COMMANDS. Say things like: "Enough. 3, 2, 1. Move." or "I expected better. Get up." or "Tired? Everyone is tired. Move." === FORBIDDEN: Do NOT say funny things like "your bed is crying" or "the world is waiting" - that is HUMOR which is BANNED in this mode! ===',
        absurd_humor: 'Use ABSURD humor! Personify objects. Example: "Your bed is crying" or "I bet you cannot even stand up".',
      };
      
      const instruction = toneInstructions[nextTone];
      triggerString = `[TONE:${nextTone}] ${instruction}`;
      log('📤', `生成触发词: ${triggerString}`);

      return {
        currentTone: nextTone,
        consecutiveRejections: newRejectionCount,
        emotionalState: newEmotionalState,
        lastToneChangeTime: now,
        totalToneChanges: prev.totalToneChanges + 1,
        hasStartedAction: false,
        cycleIndex: newCycleIndex,
      };
    });

    return triggerString;
  }, [minToneChangeInterval, log, enableDebugLog]);

  const recordAcceptance = useCallback(() => {
    setToneState(prev => {
      if (prev.consecutiveRejections > 0) {
        log('✅', '用户配合，重置抗拒计数，切换回友好模式');
        return { 
          ...prev, 
          consecutiveRejections: 0,
          currentTone: 'friendly', // 用户配合时切回友好模式
          emotionalState: 'unknown',
          cycleIndex: 0,
        };
      }
      return prev;
    });
  }, [log]);

  const recordActionStarted = useCallback((): string | null => {
    // 🔧 防重复触发
    const now = Date.now();
    if (now - lastRecordTimeRef.current < DEBOUNCE_INTERVAL_MS) {
      if (enableDebugLog) {
        console.log('⚠️ [ToneManager] 忽略重复的 ACTION 信号 (防抖动)');
      }
      return null;
    }
    lastRecordTimeRef.current = now;
    
    let triggerString: string | null = null;

    setToneState(prev => {
      if (prev.hasStartedAction) {
        return prev;
      }
      
      // 🔧 只有在用户之前有过抗拒时，才认为是“开始行动”
      // 如果从来没抗拒过，说明用户一开始就在配合，不需要设置 hasStartedAction
      if (prev.consecutiveRejections === 0) {
        log('ℹ️', '用户从未抗拒，不设置 hasStartedAction');
        return prev;
      }

      log('🎉', '用户开始行动！切换到正向反馈模式');

      triggerString = `[ACTION_STARTED] rejection_count_before_action=${prev.consecutiveRejections} current_time=${getCurrentTimeString()}. User finally started! Give IMMEDIATE enthusiastic positive feedback!`;

      return {
        ...prev,
        hasStartedAction: true,
        consecutiveRejections: 0,
        currentTone: 'friendly',
        cycleIndex: 0,
      };
    });

    return triggerString;
  }, [log, enableDebugLog]);

  const generateCompletionCelebration = useCallback((): string => {
    const triggerString = `[TASK_COMPLETED] total_rejections_overcome=${toneState.consecutiveRejections} current_time=${getCurrentTimeString()}. User completed the task! Give BIG celebration!`;
    log('🎊', '任务完成！生成庆祝触发词');
    return triggerString;
  }, [log, toneState.consecutiveRejections]);

  const forceToneChange = useCallback((targetTone: ToneStyle): ToneTrigger => {
    log('🎯', `手动切换语气: → ${TONE_DESCRIPTIONS[targetTone]}`);

    setToneState(prev => ({
      ...prev,
      currentTone: targetTone,
      lastToneChangeTime: Date.now(),
      totalToneChanges: prev.totalToneChanges + 1,
    }));

    return {
      trigger: `[TONE_SHIFT] style=${targetTone} manual=true current_time=${getCurrentTimeString()}`,
      targetTone,
      currentTime: getCurrentTimeString(),
    };
  }, [log]);

  const resetToneState = useCallback(() => {
    log('🔄', '重置语气状态');
    setToneState({
      currentTone: 'friendly',
      consecutiveRejections: 0,
      emotionalState: 'unknown',
      lastToneChangeTime: 0,
      totalToneChanges: 0,
      hasStartedAction: false,
      cycleIndex: 0,
    });
  }, [log]);

  const derivedState = useMemo(() => ({
    currentToneDescription: TONE_DESCRIPTIONS[toneState.currentTone],
    isInCooldown: Date.now() - toneState.lastToneChangeTime < minToneChangeInterval && toneState.lastToneChangeTime > 0,
    availableTones: Object.keys(TONE_DESCRIPTIONS) as ToneStyle[],
    toneDescriptions: TONE_DESCRIPTIONS,
    isInCycleMode: toneState.consecutiveRejections > 4,
  }), [toneState, minToneChangeInterval]);

  return {
    toneState,
    ...derivedState,
    recordResistance,
    recordAcceptance,
    recordActionStarted,
    generateCompletionCelebration,
    forceToneChange,
    resetToneState,
  };
}

export default useToneManager;
