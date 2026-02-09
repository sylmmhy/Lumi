/**
 * AI Coach Session - 记忆保存 Hook
 *
 * 封装 saveSessionMemory 的全部逻辑：
 * - 将对话消息转换为 Mem0 格式并发送到 memory-extractor Edge Function
 * - 记录任务完成时长（写入 memory metadata）
 * - 处理用户语音缓冲区（flush buffer → 追加到消息列表）
 *
 * 通过 reactiveRef 模式实现稳定的函数引用，避免 interval 回调拿到过时闭包。
 */
import { useRef, useCallback, useEffect } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import { devLog, devWarn } from '../gemini-live/utils';
import type { AICoachMessage } from './types';

/** saveSessionMemory 的可选参数 */
export interface SaveSessionMemoryOptions {
  additionalContext?: string;
  forceTaskCompleted?: boolean;
}

/** useSessionMemory 的配置（由主 Hook 传入） */
export interface UseSessionMemoryOptions {
  /** 当前用户 ID（ref，稳定引用） */
  currentUserIdRef: React.MutableRefObject<string | null>;
  /** 当前任务描述（ref，稳定引用） */
  currentTaskDescriptionRef: React.MutableRefObject<string>;
  /** 当前任务 ID（ref，稳定引用），用于在 metadata 中关联任务上下文 */
  currentTaskIdRef: React.MutableRefObject<string | null>;
  /** 用户语音缓冲区（ref，稳定引用） */
  userSpeechBufferRef: React.MutableRefObject<string>;
  /** addMessage 函数的 ref（稳定引用，避免循环依赖） */
  addMessageRef: React.MutableRefObject<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>;
  /** 当前消息列表（响应式值） */
  messages: AICoachMessage[];
  /** 倒计时剩余秒数（响应式值） */
  timeRemaining: number;
  /** 初始倒计时秒数 */
  initialTime: number;
}

export interface UseSessionMemoryReturn {
  /** 保存会话记忆到 Mem0 */
  saveSessionMemory: (options?: SaveSessionMemoryOptions) => Promise<boolean>;
  /**
   * saveSessionMemory 的 ref 版本，供 interval 等异步场景使用。
   * 由于函数引用稳定，ref 始终指向同一个函数。
   */
  saveSessionMemoryRef: React.MutableRefObject<(options?: SaveSessionMemoryOptions) => Promise<boolean>>;
}

/**
 * 记忆保存 Hook
 *
 * @example
 * const memory = useSessionMemory({
 *   currentUserIdRef, currentTaskDescriptionRef, currentTaskIdRef,
 *   userSpeechBufferRef, addMessageRef,
 *   messages, timeRemaining: timer.timeRemaining, initialTime,
 * });
 * // memory.saveSessionMemory()
 * // memory.saveSessionMemoryRef.current() // 在 interval 中使用
 */
export function useSessionMemory(options: UseSessionMemoryOptions): UseSessionMemoryReturn {
  const {
    currentUserIdRef,
    currentTaskDescriptionRef,
    currentTaskIdRef,
    userSpeechBufferRef,
    addMessageRef,
    messages,
    timeRemaining,
    initialTime,
  } = options;

  /**
   * 用 ref 存储响应式值（messages、timeRemaining），
   * 使 saveSessionMemory 可以在不重建的情况下始终读到最新值。
   */
  const reactiveRef = useRef({ messages, timeRemaining, initialTime });

  useEffect(() => {
    reactiveRef.current = { messages, timeRemaining, initialTime };
  });

  /**
   * 保存会话记忆到 Mem0
   *
   * 函数引用稳定（不依赖任何变化的值），所有数据通过 ref 在调用时读取。
   */
  const saveSessionMemory = useCallback(async (saveOptions?: SaveSessionMemoryOptions): Promise<boolean> => {
    const { additionalContext, forceTaskCompleted } = saveOptions || {};
    const userId = currentUserIdRef.current;
    const taskDescription = currentTaskDescriptionRef.current;
    const { messages: currentMessages, timeRemaining: currentTimeRemaining, initialTime: currentInitialTime } = reactiveRef.current;

    if (!userId) {
      devLog('⚠️ 无法保存记忆：缺少 userId');
      return false;
    }

    // 复制当前消息列表
    const messagesCopy = [...currentMessages];

    // 先把 buffer 中剩余的用户消息保存
    if (userSpeechBufferRef.current.trim()) {
      const fullUserMessage = userSpeechBufferRef.current.trim();
      devLog('🎤 保存剩余用户消息:', fullUserMessage);
      const newUserMessage: AICoachMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: fullUserMessage,
        timestamp: new Date(),
        isVirtual: false,
      };
      messagesCopy.push(newUserMessage);
      addMessageRef.current('user', fullUserMessage, false);
      userSpeechBufferRef.current = '';
    }
    if (messagesCopy.length === 0) {
      devLog('⚠️ 无法保存记忆：没有对话消息');
      return false;
    }

    try {
      devLog('🧠 正在保存会话记忆...');

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      const realMessages = messagesCopy.filter(msg => !msg.isVirtual);

      if (realMessages.length === 0) {
        devLog('⚠️ 无法保存记忆：没有真实对话消息（全是虚拟消息）');
        return false;
      }

      const mem0Messages = realMessages.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      }));

      if (taskDescription) {
        mem0Messages.unshift({
          role: 'system',
          content: `User was working on task: "${taskDescription}"${additionalContext ? `. ${additionalContext}` : ''}`,
        });
      }

      if (import.meta.env.DEV) {
        devLog('📤 [Mem0] 发送到 Mem0 的内容:', {
          userId,
          taskDescription,
          totalMessages: messagesCopy.length,
          virtualMessagesFiltered: messagesCopy.length - realMessages.length,
          realMessagesCount: realMessages.length,
          mem0MessagesCount: mem0Messages.length,
          messages: mem0Messages,
        });
      }

      const wasTaskCompleted = forceTaskCompleted === true;
      const actualDurationMinutes = Math.round(currentTimeRemaining / 60); // 正计时：timeRemaining 就是已用秒数

      if (import.meta.env.DEV) {
        devLog('📊 任务完成状态:', {
          wasTaskCompleted,
          forceTaskCompleted,
          actualDurationMinutes,
          timeRemaining: currentTimeRemaining,
          initialTime: currentInitialTime,
        });
      }

      const taskId = currentTaskIdRef.current;

      const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
        body: {
          action: 'extract',
          userId,
          messages: mem0Messages,
          taskDescription,
          localDate: new Date().toISOString().split('T')[0],
          metadata: {
            source: 'ai_coach_session',
            sessionDuration: currentInitialTime - currentTimeRemaining,
            timestamp: new Date().toISOString(),
            task_completed: wasTaskCompleted,
            task_id: taskId,
            actual_duration_minutes: actualDurationMinutes,
          },
        },
      });

      if (error) {
        throw new Error(`保存记忆失败: ${error.message}`);
      }

      if (import.meta.env.DEV) {
        devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        devLog('💾 [记忆保存] 本次会话存的记忆:');
        devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const savedMemories = data?.memories as Array<{ content: string; tag: string }> | undefined;
        if (savedMemories && savedMemories.length > 0) {
          savedMemories.forEach((memory, index) => {
            devLog(`  ${index + 1}. [${memory.tag}] ${memory.content}`);
          });
        } else {
          devLog('  (无新记忆被提取)');
        }
        devLog('📊 保存统计:', {
          extracted: data?.extracted,
          saved: data?.saved,
          merged: data?.merged,
        });
        devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }

      // tasks.actual_duration_minutes 已在迁移中移除；
      // 任务时长通过 memory metadata 持久化并供后端分析使用。
      if (wasTaskCompleted && taskId && actualDurationMinutes > 0) {
        if (import.meta.env.DEV) {
          devLog('✅ 任务完成时长已写入 memory metadata:', { taskId, actualDurationMinutes });
        }
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ 保存会话记忆失败:', errorMessage);
      devWarn('❌ 保存会话记忆失败详情:', error);
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 稳定引用：所有数据通过 ref 在调用时读取

  /**
   * ref 版本，供 interval/setTimeout 等异步场景使用。
   * 由于 saveSessionMemory 引用稳定，这个 ref 永远不需要更新。
   */
  const saveSessionMemoryRef = useRef(saveSessionMemory);

  return {
    saveSessionMemory,
    saveSessionMemoryRef,
  };
}
