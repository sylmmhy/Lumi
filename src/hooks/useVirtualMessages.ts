import { useRef, useCallback, useEffect } from 'react';

/**
 * Virtual Messages Hook - AI 消息调度
 * 
 * 职责：
 * - 定时发送虚拟消息鼓励用户
 * - 检测用户/AI 是否在说话，避免打断
 * - 生成带时间感知的消息内容
 */

export type VirtualMessageCategory = 'encouragement_focused' | 'status_check' | 'opening';

export interface UseVirtualMessagesOptions {
  /** 是否启用虚拟消息 */
  enabled: boolean;
  /** 任务开始时间戳 */
  taskStartTime: number;
  /** AI 是否正在说话 */
  isAISpeaking: boolean;
  /** 用户是否正在说话 */
  isUserSpeaking: boolean;
  /** 用户最后说话时间 */
  lastUserSpeechTime: Date | null;
  /** 发送消息的回调 */
  onSendMessage: (message: string) => void;
  /** 添加消息到记录的回调 */
  onAddMessage?: (role: 'user' | 'ai', content: string, isVirtual?: boolean) => void;
}

// 冷却时间：15秒
const COOLDOWN_MS = 15 * 1000;
// 初始延迟：立即发送，不要延迟（thinking 已经够慢了）
const INITIAL_DELAY_MS = 0;
// 检查间隔：每5秒检查一次
const CHECK_INTERVAL_MS = 5000;

export function useVirtualMessages(options: UseVirtualMessagesOptions) {
  const {
    enabled,
    taskStartTime,
    isAISpeaking,
    isUserSpeaking,
    lastUserSpeechTime,
    onSendMessage,
    onAddMessage,
  } = options;

  // Refs 用于在闭包中获取最新值
  const aiSpeakingRef = useRef(isAISpeaking);
  const userSpeakingRef = useRef(isUserSpeaking);
  const lastUserSpeechRef = useRef(lastUserSpeechTime);
  const lastVirtualMessageTimeRef = useRef<number>(0);
  const lastTurnCompleteTimeRef = useRef<number>(0);

  // 更新 refs
  useEffect(() => {
    aiSpeakingRef.current = isAISpeaking;
  }, [isAISpeaking]);

  useEffect(() => {
    userSpeakingRef.current = isUserSpeaking;
  }, [isUserSpeaking]);

  useEffect(() => {
    lastUserSpeechRef.current = lastUserSpeechTime;
  }, [lastUserSpeechTime]);

  /**
   * 记录 AI 完成回复的时间
   * 用于判断是否应该发送虚拟消息
   */
  const recordTurnComplete = useCallback((isFromVirtualMessage: boolean) => {
    const now = Date.now();
    const timeSinceVirtualMsg = now - lastVirtualMessageTimeRef.current;

    // 只有真实对话的 turnComplete 才需要触发冷却
    // 如果是虚拟消息引发的 AI 回复，不应该阻止下一次虚拟消息
    if (timeSinceVirtualMsg > 10000 || lastVirtualMessageTimeRef.current === 0) {
      lastTurnCompleteTimeRef.current = now;
      if (import.meta.env.DEV) {
        console.log('🔄 AI 回复完成 (来自真实对话) - 尊重用户节奏');
      }
    } else if (isFromVirtualMessage) {
      if (import.meta.env.DEV) {
        console.log('🔄 AI 回复完成 (来自虚拟消息) - 不触发冷却');
      }
    }
  }, []);

  /**
   * 检查用户是否在进行对话
   * 返回 true 表示不应该发送虚拟消息
   */
  const isUserInConversation = useCallback(() => {
    // 检查 1: 用户正在说话 (VAD 检测)
    if (userSpeakingRef.current) {
      if (import.meta.env.DEV) {
        console.log('🎤 ⏸️ 跳过虚拟消息 - 用户正在说话');
      }
      return true;
    }

    // 检查 2: AI 正在说话
    if (aiSpeakingRef.current) {
      if (import.meta.env.DEV) {
        console.log('🤖 ⏸️ 跳过虚拟消息 - AI 正在说话');
      }
      return true;
    }

    const now = Date.now();

    // 检查 3: 刚发送过虚拟消息 (防止快速连发)
    const timeSinceLastVirtualMsg = now - lastVirtualMessageTimeRef.current;
    if (timeSinceLastVirtualMsg < COOLDOWN_MS) {
      if (import.meta.env.DEV) {
        console.log(`⏰ ⏸️ 跳过虚拟消息 - 刚发送过消息 ${Math.round(timeSinceLastVirtualMsg / 1000)}秒前 (冷却: 15秒)`);
      }
      return true;
    }

    // 检查 4: 用户最近说过话
    if (lastUserSpeechRef.current) {
      const timeSinceUserSpoke = now - lastUserSpeechRef.current.getTime();
      if (timeSinceUserSpoke < COOLDOWN_MS) {
        if (import.meta.env.DEV) {
          console.log(`🎤 ⏸️ 跳过虚拟消息 - 用户刚说过话 ${Math.round(timeSinceUserSpoke / 1000)}秒前 (冷却: 15秒)`);
        }
        return true;
      }
    }

    // 检查 5: AI 刚完成回复
    const timeSinceLastTurn = now - lastTurnCompleteTimeRef.current;
    if (lastTurnCompleteTimeRef.current > 0 && timeSinceLastTurn < COOLDOWN_MS) {
      if (import.meta.env.DEV) {
        console.log(`🤖 ⏸️ 跳过虚拟消息 - AI 刚完成回复 ${Math.round(timeSinceLastTurn / 1000)}秒前 (冷却: 15秒)`);
      }
      return true;
    }

    // 所有检查通过 - 对话空闲，可以发送虚拟消息
    if (import.meta.env.DEV) {
      console.log('✅ 对话空闲 >15秒 - 准备发送虚拟消息');
    }
    return false;
  }, []);

  /**
   * 获取当前本地时间（24小时制）
   * 用于在每次触发消息中附带时间，让 AI 知道真实的用户本地时间
   */
  const getCurrentLocalTime = useCallback((): string => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  /**
   * 生成语言无关的触发词消息
   * 使用触发词格式，让 AI 根据 System Prompt 中的定义用用户语言回复
   * 这样无论虚拟消息是什么语言，AI 都会用用户选择的语言回复
   *
   * 每次触发消息都附带 current_time=HH:MM，让 AI 知道真实的用户本地时间
   * 这样 AI 就不会使用服务器时间（UTC）来判断时间
   */
  const generateTimeAwareMessage = useCallback(async (category: VirtualMessageCategory): Promise<string> => {
    const currentTime = getCurrentLocalTime();

    // 开场白消息 - 使用触发词，附带当前时间
    if (category === 'opening') {
      return `[GREETING] current_time=${currentTime}`;
    }

    const elapsedMs = Date.now() - taskStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    // 状态检查消息 - 包含精确时间
    if (category === 'status_check') {
      return `[STATUS] elapsed=${elapsedMinutes}m${elapsedSeconds % 60}s current_time=${currentTime}`;
    }

    // encouragement_focused - 默认类型
    // 触发词包含详细时间信息和当前本地时间，AI 会根据 System Prompt 用用户语言回复
    if (elapsedSeconds < 30) {
      return `[CHECK_IN] elapsed=just_started current_time=${currentTime}`;
    } else if (elapsedMinutes === 0) {
      return `[CHECK_IN] elapsed=30s current_time=${currentTime}`;
    } else if (elapsedMinutes === 1) {
      return `[CHECK_IN] elapsed=1m current_time=${currentTime}`;
    } else if (elapsedMinutes === 2) {
      return `[CHECK_IN] elapsed=2m current_time=${currentTime}`;
    } else if (elapsedMinutes === 3) {
      return `[CHECK_IN] elapsed=3m current_time=${currentTime}`;
    } else if (elapsedMinutes === 4) {
      return `[CHECK_IN] elapsed=4m remaining=1m current_time=${currentTime}`;
    } else {
      return `[CHECK_IN] elapsed=5m timer_done=true current_time=${currentTime}`;
    }
  }, [taskStartTime, getCurrentLocalTime]);

  // 使用 ref 存储回调函数，避免 useEffect 依赖变化导致的循环
  const onSendMessageRef = useRef(onSendMessage);
  const onAddMessageRef = useRef(onAddMessage);
  const taskStartTimeRef = useRef(taskStartTime);

  useEffect(() => {
    onSendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  useEffect(() => {
    onAddMessageRef.current = onAddMessage;
  }, [onAddMessage]);

  useEffect(() => {
    taskStartTimeRef.current = taskStartTime;
  }, [taskStartTime]);

  /**
   * 发送虚拟消息（内部使用，直接读取 ref）
   */
  const sendVirtualMessageInternal = useCallback(async (category: VirtualMessageCategory = 'encouragement_focused') => {
    if (isUserInConversation()) {
      return;
    }

    const message = await generateTimeAwareMessage(category);
    const currentTaskStartTime = taskStartTimeRef.current;

    if (import.meta.env.DEV) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 发送虚拟消息 (Virtual Message Sent)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 消息内容:', message);
      console.log('🕐 发送时间:', new Date().toLocaleTimeString());
      console.log('⏱️  已运行时长:', Math.floor((Date.now() - currentTaskStartTime) / 1000), '秒');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // 发送消息给 Gemini
    onSendMessageRef.current(message);

    // 添加到消息记录（标记为虚拟消息，不显示在 UI 中）
    onAddMessageRef.current?.('user', message, true);

    // 记录发送时间（防止快速连发）
    lastVirtualMessageTimeRef.current = Date.now();
  }, [isUserInConversation, generateTimeAwareMessage]);

  /**
   * 发送虚拟消息（对外暴露的接口）
   */
  const sendVirtualMessage = useCallback(async (category: VirtualMessageCategory = 'encouragement_focused') => {
    await sendVirtualMessageInternal(category);
  }, [sendVirtualMessageInternal]);

  // 虚拟消息调度器 - 只依赖 enabled 和 taskStartTime
  useEffect(() => {
    if (!enabled || taskStartTime === 0) {
      return;
    }

    // 🔑 关键：重置所有冷却时间，确保新任务不受旧任务影响
    lastVirtualMessageTimeRef.current = 0;
    lastTurnCompleteTimeRef.current = 0;

    if (import.meta.env.DEV) {
      console.log(`🤖 虚拟消息系统已激活 - AI 将在 ${INITIAL_DELAY_MS / 1000} 秒后说话`);
      console.log('🔄 冷却时间已重置');
    }

    // 使用标志位防止组件卸载后继续执行
    let isActive = true;
    let recurringTimeoutId: NodeJS.Timeout | null = null;

    const scheduleNextCheck = () => {
      if (!isActive) return;
      recurringTimeoutId = setTimeout(async () => {
        if (!isActive) return;
        await sendVirtualMessageInternal('encouragement_focused');
        scheduleNextCheck(); // 递归调度
      }, CHECK_INTERVAL_MS);
    };

    // 初始消息：使用 'opening' 类型触发 AI 开场白
    const initialTimeoutId = setTimeout(async () => {
      if (!isActive) return;
      await sendVirtualMessageInternal('opening');
      // 开始定期检查
      scheduleNextCheck();
    }, INITIAL_DELAY_MS);

    return () => {
      isActive = false;
      clearTimeout(initialTimeoutId);
      if (recurringTimeoutId) {
        clearTimeout(recurringTimeoutId);
      }
      if (import.meta.env.DEV) {
        console.log('🛑 虚拟消息系统已停止');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, taskStartTime]);

  return {
    sendVirtualMessage,
    recordTurnComplete,
    isUserInConversation,
  };
}
