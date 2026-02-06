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
import { useIntentDetection } from '../ai-tools';

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
  /** 会话是否激活（用于控制意图检测） */
  isSessionActive: boolean;
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
  /** 意图检测的方法（供 onTranscriptUpdate 喂数据） */
  intentDetection: {
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
    clearHistory: () => void;
  };
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
    isSessionActive,
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

  // 用 ref 存储进入/退出函数（避免 useIntentDetection 闭包问题）
  const enterCampfireModeRef = useRef<(options?: { skipFarewell?: boolean }) => void>(() => {});
  const exitCampfireModeRef = useRef<() => void>(() => {});
  /** 🔧 修复闭包过期：标记"篝火重连刚完成，需要发送触发消息" */
  const campfireNeedsTriggerRef = useRef(false);

  // ==========================================
  // 子 Hooks
  // ==========================================

  /** 白噪音 */
  const ambientAudio = useAmbientAudio({ normalVolume: 0.5, duckedVolume: 0.1 });

  /** 专注计时 */
  const focusTimer = useFocusTimer();

  /** 意图检测（检测 enter_campfire / exit_campfire） */
  const intentDetection = useIntentDetection({
    userId: currentUserId || '',
    chatType: 'daily_chat',
    enabled: isSessionActive && !isCampfireMode,
    onDetectionComplete: (result) => {
      if (result.tool === 'enter_campfire' && result.confidence >= 0.6) {
        enterCampfireModeRef.current({ skipFarewell: true });
      } else if (result.tool === 'exit_campfire' && result.confidence >= 0.6) {
        exitCampfireModeRef.current();
      }
    },
  });

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
    const { data, error } = await supabase.functions.invoke('start-campfire-focus', {
      body: {
        userId: currentUserId || '',
        sessionId: campfireSessionId || undefined,
        taskDescription: currentTaskDescription || undefined,
        isReconnect,
        aiTone: 'gentle',
        language: lang.startsWith('zh') ? 'zh' : 'en',
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
  }, [campfireSessionId, currentUserId, currentTaskDescription, preferredLanguage]);

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

      // 并行获取 token 和 system prompt，减少重连耗时
      const [token, config] = await Promise.all([
        fetchGeminiToken(),
        callStartCampfireFocus(true),
      ]);
      if (epochAtStart !== sessionEpochRef.current) {
        devLog('🔌 [Campfire] reconnect cancelled (stale epoch)');
        return;
      }
      if (!config?.geminiConfig?.systemPrompt) {
        devWarn('❌ [Campfire] No system prompt from backend');
        return;
      }

      // 🔧 修复：始终使用用户偏好的声音（getVoiceName），不用后端返回的 voiceConfig
      // 后端 start-campfire-focus 固定返回 Aoede（女声），但用户之前选的是 Puck（男声）
      await geminiLive.connect(
        config.geminiConfig.systemPrompt,
        [],
        token,
        getVoiceName()
      );

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
  }, [geminiLive, callStartCampfireFocus, startCampfireIdleTimer, sessionEpochRef]);

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

    // 5. 重新连接 AI 教练（用保存的原始 system prompt）
    if (savedSystemInstructionRef.current) {
      try {
        const token = await fetchGeminiToken();
        const voiceName = getVoiceName();
        geminiLive.disconnect();
        await geminiLive.connect(savedSystemInstructionRef.current, undefined, token, voiceName);
        // reconnect 后确保麦克风重新启用
        if (!geminiLive.isRecording) {
          try {
            await geminiLive.toggleMicrophone();
          } catch (e) {
            devWarn('⚠️ [Campfire] Failed to re-enable microphone after exit:', e);
          }
        }
      } catch (err) {
        devWarn('❌ [Campfire] Failed to reconnect AI coach:', err);
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
          devWarn('Failed to update focus session:', err);
        });
      }
    }

    return stats;
  }, [isCampfireMode, ambientAudio, focusTimer, campfireSessionId, campfireChatCount, geminiLive, clearCampfireIdleTimer, currentTaskDescription]);

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

  // 更新进入/退出函数的 ref（避免 useIntentDetection 闭包问题）
  useEffect(() => {
    enterCampfireModeRef.current = enterCampfireMode;
    exitCampfireModeRef.current = exitCampfireMode;
  }, [enterCampfireMode, exitCampfireMode]);

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
        const lang = preferredLanguage?.startsWith('zh') ? 'zh' : 'en';
        devLog('📤 [Campfire] Sending reconnect trigger message...');
        geminiLive.sendTextMessage(`[CAMPFIRE_RECONNECT] language=${lang}`);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isCampfireMode, geminiLive.isConnected, geminiLive, preferredLanguage]);

  // VAD 触发 → 重连 Gemini
  useEffect(() => {
    if (isCampfireMode) {
      devLog('🔥 [Campfire VAD]', {
        isSpeaking: campfireVad.isSpeaking,
        volume: campfireVad.currentVolume,
        isConnected: geminiLive.isConnected,
        reconnectLock: campfireReconnectLockRef.current,
        micStream: campfireMicStreamRef.current ? 'active' : 'null',
      });
    }
    if (isCampfireMode && campfireVad.isSpeaking && !campfireReconnectLockRef.current && !geminiLive.isConnected) {
      campfireReconnectGemini();
    }
  }, [isCampfireMode, campfireVad.isSpeaking, campfireVad.currentVolume, geminiLive.isConnected, campfireReconnectGemini]);

  // 空闲超时 → 断开 Gemini
  useEffect(() => {
    if (isCampfireMode && geminiLive.isConnected && !geminiLive.isSpeaking && !geminiLive.isRecording) {
      startCampfireIdleTimer();
    }
  }, [isCampfireMode, geminiLive.isConnected, geminiLive.isSpeaking, geminiLive.isRecording, startCampfireIdleTimer]);

  // AI 说话时降低白噪音
  useEffect(() => {
    if (isCampfireMode) {
      ambientAudio.setDucked(geminiLive.isSpeaking);
    }
  }, [isCampfireMode, geminiLive.isSpeaking, ambientAudio]);

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
    intentDetection: {
      processAIResponse: intentDetection.processAIResponse,
      addUserMessage: intentDetection.addUserMessage,
      clearHistory: intentDetection.clearHistory,
    },
    cleanupResources,
  };
}
