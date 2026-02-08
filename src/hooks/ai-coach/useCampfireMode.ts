/**
 * 篝火模式 Hook
 *
 * 从 useAICoachSession 提取，管理"从 AI 教练切到篝火专注模式，再切回来"的完整生命周期。
 *
 * 篝火模式的核心行为：
 * 1. 进入时：AI 说告别语 → 断开 Gemini → 播放白噪音 → 启动专注计时
 * 2. 专注中：VAD 检测用户说话 → 重连 Gemini 对话 → 30s 空闲后断开
 * 3. 退出时：停止白噪音 → 用原 system prompt 重连 AI 教练
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchGeminiToken } from '../useGeminiLive';
import type { useGeminiLive as UseGeminiLiveType } from '../useGeminiLive';
import { useVoiceActivityDetection } from '../useVoiceActivityDetection';
import { getSupabaseClient } from '../../lib/supabase';
import { getVoiceName } from '../../lib/voiceSettings';
import { devLog, devWarn } from '../gemini-live/utils';
import { useAmbientAudio } from '../campfire/useAmbientAudio';
import { useFocusTimer } from '../campfire/useFocusTimer';

// ==========================================
// 类型定义
// ==========================================

export interface CampfireStats {
  sessionId: string;
  taskDescription: string;
  durationSeconds: number;
  chatCount: number;
}

export interface UseCampfireModeOptions {
  /** 来自主 Hook 的共享 Gemini Live 实例 */
  geminiLive: ReturnType<typeof UseGeminiLiveType>;
  /** 竞态控制：主 Hook 的 sessionEpoch ref */
  sessionEpochRef: React.MutableRefObject<number>;
  /** 当前用户 ID */
  currentUserId: string | null;
  /** 当前任务描述 */
  currentTaskDescription: string;
  /** 用户首选语言 */
  preferredLanguage: string;
  /** 获取当前对话上下文（用于重连时让 AI "记得"之前聊了什么） */
  getSessionContext?: () => { messages: Array<{ role: 'user' | 'ai'; text: string; timestamp: number }>; summary: string; topics: string[] };
}

export interface UseCampfireModeReturn {
  /** 是否处于篝火模式 */
  isCampfireMode: boolean;
  /** 篝火模式统计信息 */
  campfireStats: {
    elapsedSeconds: number;
    formattedTime: string;
    chatCount: number;
    isAmbientPlaying: boolean;
    toggleAmbient: () => void;
  };
  /** 进入篝火模式 */
  enterCampfireMode: (options?: { skipFarewell?: boolean }) => Promise<void>;
  /** 退出篝火模式 */
  exitCampfireMode: () => Promise<CampfireStats | null>;
  /** 停止篝火资源（不重连 AI，用于 startSession/endSession 时清理） */
  stopCampfireResources: () => void;
  /** 保存的原始 system instruction ref（startSession 写入，exitCampfireMode 读取） */
  savedSystemInstructionRef: React.MutableRefObject<string>;
  /** 篝火模式资源清理（供组件卸载时调用） */
  cleanupResources: () => void;
}

// ==========================================
// Hook 实现
// ==========================================

export function useCampfireMode(options: UseCampfireModeOptions): UseCampfireModeReturn {
  const {
    geminiLive,
    sessionEpochRef,
    currentUserId,
    currentTaskDescription,
    preferredLanguage,
    getSessionContext,
  } = options;

  // ==========================================
  // 状态
  // ==========================================
  const [isCampfireMode, setIsCampfireMode] = useState(false);
  const [campfireSessionId, setCampfireSessionId] = useState<string | null>(null);
  const [campfireChatCount, setCampfireChatCount] = useState(0);

  // ==========================================
  // Refs
  // ==========================================
  const campfireReconnectLockRef = useRef(false);
  const campfireIdleTimerRef = useRef<number | null>(null);
  const savedSystemInstructionRef = useRef<string>('');
  const campfireMicStreamRef = useRef<MediaStream | null>(null);

  /** 🔧 修复闭包过期：标记"篝火重连刚完成，需要发送触发消息" */
  const campfireNeedsTriggerRef = useRef(false);

  /** 篝火模式进入时间戳：用于 VAD 冷却期，避免 AI 音频残留触发误重连 */
  const campfireEntryTimeRef = useRef<number>(0);

  // ==========================================
  // 子 Hooks
  // ==========================================

  /** 白噪音 */
  const ambientAudio = useAmbientAudio({ normalVolume: 0.5, duckedVolume: 0.1 });

  /** 专注计时 */
  const focusTimer = useFocusTimer();

  /** 篝火模式独立的 VAD 实例：在 Gemini 断开时监听麦克风
   * minSpeechDuration=100ms：比默认 250ms 更灵敏，适配篝火模式的快速唤醒场景。
   * 即使误触，30 秒空闲超时会自动断开 Gemini，代价很小。 */
  const campfireVad = useVoiceActivityDetection(
    isCampfireMode ? campfireMicStreamRef.current : null,
    { threshold: 25, enabled: isCampfireMode && !geminiLive.isConnected, minSpeechDuration: 100 }
  );

  // ==========================================
  // 空闲计时器
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
        devLog('🕐 [Campfire] Idle timeout, disconnecting Gemini...');
        geminiLive.disconnect();
      }
    }, 30_000);
  }, [isCampfireMode, geminiLive, clearCampfireIdleTimer]);

  // ==========================================
  // 后端 API 调用
  // ==========================================

  /**
   * 调用后端 start-campfire-focus 获取篝火模式 system prompt
   * @param isReconnect 是否是重连（影响开场语）
   */
  const callStartCampfireFocus = useCallback(async (isReconnect: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const lang = preferredLanguage || 'en-US';

    // 重连时附带对话上下文，让 AI "记得"之前聊了什么
    const sessionContext = isReconnect && getSessionContext ? getSessionContext() : undefined;
    if (isReconnect && sessionContext) {
      devLog('📝 [Campfire] 重连携带对话上下文:', {
        messageCount: sessionContext.messages.length,
        topics: sessionContext.topics,
      });
    }

    const { data, error } = await supabase.functions.invoke('start-campfire-focus', {
      body: {
        userId: currentUserId || '',
        sessionId: campfireSessionId || undefined,
        taskDescription: currentTaskDescription || undefined,
        isReconnect,
        aiTone: 'gentle',
        language: lang.startsWith('zh') ? 'zh' : 'en',
        ...(sessionContext ? { context: sessionContext } : {}),
      },
    });

    if (error) {
      devWarn('❌ [Campfire] start-campfire-focus error:', error);
      return null;
    }

    if (!isReconnect && data?.sessionId) {
      setCampfireSessionId(data.sessionId);
    }

    return data;
  }, [campfireSessionId, currentUserId, currentTaskDescription, preferredLanguage, getSessionContext]);

  /**
   * 调用 get-system-instruction 获取正常的 AI 教练 system prompt（用于 VAD 重连和退出篝火）
   * 和首次启动时用的是同一个后端接口，保证 AI 行为完全一致
   */
  const fetchReconnectInstruction = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const sessionContext = getSessionContext ? getSessionContext() : undefined;
    if (sessionContext) {
      devLog('📝 [Campfire] 重连携带对话上下文:', {
        messageCount: sessionContext.messages.length,
        topics: sessionContext.topics,
      });
    }

    const { data, error } = await supabase.functions.invoke('get-system-instruction', {
      body: {
        taskInput: currentTaskDescription || '',
        userId: currentUserId || '',
        preferredLanguages: [preferredLanguage || 'en-US'],
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
        localDateISO: new Date().toISOString().split('T')[0],
        isReconnect: true,
        ...(sessionContext ? { context: sessionContext } : {}),
      },
    });

    if (error) {
      devWarn('❌ [Campfire] get-system-instruction error:', error);
      return null;
    }

    return data?.systemInstruction || null;
  }, [currentUserId, currentTaskDescription, preferredLanguage, getSessionContext]);

  // ==========================================
  // VAD 触发重连
  // ==========================================

  /**
   * 篝火模式 VAD 触发 → 重连 Gemini
   */
  const campfireReconnectGemini = useCallback(async () => {
    if (campfireReconnectLockRef.current) return;
    campfireReconnectLockRef.current = true;
    const epochAtStart = sessionEpochRef.current;

    try {
      devLog('🔌 [Campfire] VAD triggered, reconnecting Gemini...');
      // 防止 sessionRef 残留导致 connect 被忽略
      geminiLive.disconnect();

      // 并行获取 token 和 system prompt（用正常的 get-system-instruction，和首次启动一致）
      const [token, systemInstruction] = await Promise.all([
        fetchGeminiToken(),
        fetchReconnectInstruction(),
      ]);
      if (epochAtStart !== sessionEpochRef.current) {
        devLog('🔌 [Campfire] reconnect cancelled (stale epoch)');
        return;
      }
      if (!systemInstruction) {
        devWarn('❌ [Campfire] No system prompt from backend');
        return;
      }

      await geminiLive.connect(
        systemInstruction,
        [],
        token,
        getVoiceName()
      );

      // 更新保存的 system instruction（包含最新对话上下文）
      savedSystemInstructionRef.current = systemInstruction;

      // reconnect 后确保麦克风重新启用（disconnect 会 stop mic）
      if (!geminiLive.isRecording) {
        try {
          await geminiLive.toggleMicrophone();
        } catch (e) {
          devWarn('⚠️ [Campfire] Failed to re-enable microphone after reconnect:', e);
        }
      }

      // 🔧 修复闭包过期：不在这里直接调用 sendTextMessage
      // 因为 sendTextMessage 是 useCallback，闭包里的 sessionIsConnected 还是旧值 false
      // 改为设置 ref 标记，由 useEffect 在 isConnected 变 true 后发送
      campfireNeedsTriggerRef.current = true;

      setCampfireChatCount(prev => prev + 1);
      startCampfireIdleTimer();
    } catch (err) {
      devWarn('❌ [Campfire] Reconnect failed:', err);
    } finally {
      campfireReconnectLockRef.current = false;
    }
  }, [geminiLive, fetchReconnectInstruction, startCampfireIdleTimer, sessionEpochRef]);

  // ==========================================
  // 进入/退出篝火模式
  // ==========================================

  /**
   * 进入篝火模式
   * @param options.skipFarewell 意图检测触发时为 true（AI 已在回复中说了告别语），按钮触发时为 false
   */
  const enterCampfireMode = useCallback(async (enterOptions?: { skipFarewell?: boolean }) => {
    if (isCampfireMode) return;

    const skipFarewell = enterOptions?.skipFarewell ?? false;
    devLog('🏕️ Entering campfire mode...', { skipFarewell });

    if (skipFarewell) {
      // 意图检测触发：AI 已经说了告别语，等它说完就断开
      devLog('🏕️ [Step 1] 等待 AI 说完...');
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!geminiLive.isSpeaking) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
      devLog('🏕️ [Step 1] AI 已说完（或超时）');
    } else {
      // 按钮触发：需要让 AI 先说一句告别语
      const lang = preferredLanguage || 'en-US';
      geminiLive.sendTextMessage(`[CAMPFIRE_FAREWELL] language=${lang}`);

      devLog('🏕️ [Step 1] 等待告别语说完...');
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!geminiLive.isSpeaking) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
      devLog('🏕️ [Step 1] 告别语已说完（或超时）');
    }

    // 断开 Gemini
    devLog('🏕️ [Step 2] 断开 Gemini...');
    geminiLive.disconnect();
    devLog('🏕️ [Step 2] Gemini 已断开');

    // 获取麦克风流（用于 VAD）
    devLog('🏕️ [Step 3] 获取麦克风流...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      campfireMicStreamRef.current = stream;
      devLog('🏕️ [Step 3] 麦克风流已获取', {
        active: stream.active,
        tracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })),
      });
    } catch (micErr) {
      devWarn('⚠️ [Campfire] Failed to get mic stream for VAD:', micErr);
    }

    // 切换状态
    devLog('🏕️ [Step 4] 设置 isCampfireMode = true');
    campfireEntryTimeRef.current = Date.now();
    setIsCampfireMode(true);
    setCampfireChatCount(0);

    // 启动白噪音和计时器
    ambientAudio.play();
    focusTimer.start();
    devLog('🏕️ [Step 5] 篝火模式完全启动 ✅');

    // 调用后端创建 focus session（异步，不阻塞）
    callStartCampfireFocus(false);
  }, [isCampfireMode, geminiLive, ambientAudio, focusTimer, callStartCampfireFocus, preferredLanguage]);

  /**
   * 退出篝火模式
   * - 停止白噪音和计时器
   * - 重新连接 AI 教练
   * - 返回统计数据
   */
  const exitCampfireMode = useCallback(async () => {
    if (!isCampfireMode) return null;

    devLog('🏕️ Exiting campfire mode...');

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
    const stats: CampfireStats = {
      sessionId: campfireSessionId || '',
      taskDescription: currentTaskDescription,
      durationSeconds: focusTimer.elapsedSeconds,
      chatCount: campfireChatCount,
    };

    // 4. 切换状态
    setIsCampfireMode(false);

    // 5. 重新连接 AI 教练（重新获取 system prompt，包含对话上下文，和首次启动一致）
    try {
      const [token, systemInstruction] = await Promise.all([
        fetchGeminiToken(),
        fetchReconnectInstruction(),
      ]);

      const prompt = systemInstruction || savedSystemInstructionRef.current;
      if (prompt) {
        const voiceName = getVoiceName();
        geminiLive.disconnect();
        await geminiLive.connect(prompt, undefined, token, voiceName);

        // 更新保存的 system instruction
        if (systemInstruction) {
          savedSystemInstructionRef.current = systemInstruction;
        }

        // reconnect 后确保麦克风重新启用
        if (!geminiLive.isRecording) {
          try {
            await geminiLive.toggleMicrophone();
          } catch (e) {
            devWarn('⚠️ [Campfire] Failed to re-enable microphone after exit:', e);
          }
        }
      }
    } catch (err) {
      devWarn('❌ [Campfire] Failed to reconnect AI coach:', err);
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
          devWarn('Failed to update focus session:', err);
        });
      }
    }

    return stats;
  }, [isCampfireMode, ambientAudio, focusTimer, campfireSessionId, campfireChatCount, geminiLive, clearCampfireIdleTimer, currentTaskDescription, fetchReconnectInstruction]);

  /**
   * 停止篝火模式相关资源（白噪音/计时器/麦克风流）
   * 注意：不做 Gemini 连接处理，由 cleanup 统一负责。
   */
  const stopCampfireResources = useCallback(() => {
    ambientAudio.stop();
    focusTimer.stop();
    clearCampfireIdleTimer();
    if (campfireMicStreamRef.current) {
      campfireMicStreamRef.current.getTracks().forEach(t => t.stop());
      campfireMicStreamRef.current = null;
    }
    setIsCampfireMode(false);
  }, [ambientAudio, focusTimer, clearCampfireIdleTimer]);

  // ==========================================
  // Effects
  // ==========================================

  // 🔧 修复闭包过期：当 Gemini 连接建立后，发送篝火重连触发消息
  // 为什么不在 campfireReconnectGemini 里直接调用 sendTextMessage？
  // 因为 sendTextMessage 是 useCallback([sessionIsConnected])，
  // 在 async 函数中 await connect() 后，闭包捕获的 sessionIsConnected 还是旧值 false，
  // 导致消息被丢弃。useEffect 在 isConnected 变化后执行，拿到的是最新的 sendTextMessage。
  useEffect(() => {
    if (isCampfireMode && geminiLive.isConnected && campfireNeedsTriggerRef.current) {
      campfireNeedsTriggerRef.current = false;
      // 延迟 500ms 确保连接完全稳定（与 dev 版本一致）
      const timer = setTimeout(() => {
        devLog('📤 [Campfire] Sending reconnect trigger message...');
        geminiLive.sendTextMessage(`[RECONNECT] The user was taking a focus break and just came back. Continue the conversation naturally.`);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isCampfireMode, geminiLive.isConnected, geminiLive, preferredLanguage]);

  // VAD 触发 → 重连 Gemini（只在 isSpeaking 变化时执行，不依赖 currentVolume 避免刷屏）
  useEffect(() => {
    if (isCampfireMode && campfireVad.isSpeaking) {
      devLog('🔥 [Campfire VAD] Speaking detected, isConnected:', geminiLive.isConnected);

      // 进入篝火模式后 2 秒内忽略 VAD，避免 AI 音频残留被麦克风拾取触发误重连
      const CAMPFIRE_VAD_COOLDOWN_MS = 2000;
      if (Date.now() - campfireEntryTimeRef.current < CAMPFIRE_VAD_COOLDOWN_MS) {
        devLog('🔥 [Campfire VAD] 冷却期内，忽略');
        return;
      }

      if (!campfireReconnectLockRef.current && !geminiLive.isConnected) {
        campfireReconnectGemini();
      }
    }
  }, [isCampfireMode, campfireVad.isSpeaking, geminiLive.isConnected, campfireReconnectGemini]);

  // 空闲超时 → 断开 Gemini
  useEffect(() => {
    if (isCampfireMode && geminiLive.isConnected && !geminiLive.isSpeaking && !geminiLive.isRecording) {
      startCampfireIdleTimer();
    }
  }, [isCampfireMode, geminiLive.isConnected, geminiLive.isSpeaking, geminiLive.isRecording, startCampfireIdleTimer]);

  // Gemini 连接时关闭白噪音，断开后（回到篝火等待状态）恢复播放
  useEffect(() => {
    if (isCampfireMode) {
      if (geminiLive.isConnected) {
        ambientAudio.stop();
      } else {
        ambientAudio.play();
      }
    }
  }, [isCampfireMode, geminiLive.isConnected, ambientAudio]);

  /**
   * 清理篝火模式硬件资源（供组件卸载时调用）
   */
  const cleanupResources = useCallback(() => {
    if (campfireIdleTimerRef.current) {
      clearTimeout(campfireIdleTimerRef.current);
      campfireIdleTimerRef.current = null;
    }
    if (campfireMicStreamRef.current) {
      campfireMicStreamRef.current.getTracks().forEach(t => t.stop());
      campfireMicStreamRef.current = null;
    }
  }, []);

  // ==========================================
  // 返回值
  // ==========================================
  return {
    isCampfireMode,
    campfireStats: {
      elapsedSeconds: focusTimer.elapsedSeconds,
      formattedTime: focusTimer.formattedTime,
      chatCount: campfireChatCount,
      isAmbientPlaying: ambientAudio.isPlaying,
      toggleAmbient: ambientAudio.toggle,
    },
    enterCampfireMode,
    exitCampfireMode,
    stopCampfireResources,
    savedSystemInstructionRef,
    cleanupResources,
  };
}
