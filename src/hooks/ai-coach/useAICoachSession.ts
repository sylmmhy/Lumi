import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive } from '../useGeminiLive';
import { useVirtualMessages } from '../useVirtualMessages';
import type { SuccessRecordForVM } from '../useVirtualMessages';
import { useVoiceActivityDetection } from '../useVoiceActivityDetection';
import { useWaveformAnimation } from '../useWaveformAnimation';
import { useVirtualMessageOrchestrator } from '../virtual-messages';
import { getSupabaseClient } from '../../lib/supabase';
import type { VirtualMessageUserContext } from '../virtual-messages/types';
import { devLog, devWarn } from '../gemini-live/utils';
import type { AICoachSessionState, UseAICoachSessionOptions } from './types';
import { useCampfireMode } from './useCampfireMode';
import { useSessionTimer } from './useSessionTimer';
import { useSessionMemory } from './useSessionMemory';
import { useTranscriptProcessor } from './useTranscriptProcessor';
import { useSessionLifecycle } from './useSessionLifecycle';
import { useBackgroundNudge } from './useBackgroundNudge';
import { useSessionContext } from '../useSessionContext';
import { createAudioAnomalyDetector } from '../../lib/callkit-diagnostic';
import { useIntentDetection } from '../ai-tools';
import { useAsyncMemoryPipeline, generateContextMessage } from '../virtual-messages/useAsyncMemoryPipeline';

/**
 * AI Coach Session Hook - 组合层
 *
 * 将 Gemini Live、虚拟消息、VAD、波形动画等功能打包成一个简单的接口
 * 方便在不同场景中复用 AI 教练功能
 *
 * 类型定义见 ./types.ts，工具函数见 ./utils.ts
 * 篝火模式见 ./useCampfireMode.ts
 */

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
  const [taskDescription, setTaskDescription] = useState('');

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isObserving, setIsObserving] = useState(false); // AI 正在观察用户
  const [connectionError, setConnectionError] = useState<string | null>(null); // 连接错误信息

  const sessionEpochRef = useRef(0); // 递增用于取消 in-flight 的 startSession / campfire reconnect

  /**
   * 保存最新的 cleanup 引用，供 handleTimerComplete 使用
   * 初始为空函数，在 lifecycle hook 定义后由 effect 同步
   */
  const cleanupRef = useRef<() => void>(() => {});

  /**
   * 保存最新的 saveSessionMemory 引用，供 handleTimerComplete 使用
   * 初始为空函数，在 useSessionMemory 定义后由 effect 同步
   */
  const saveSessionMemoryRef = useRef<(options?: { additionalContext?: string; forceTaskCompleted?: boolean }) => Promise<boolean>>(
    async () => false
  );

  // 使用 ref 存储当前会话信息
  const currentUserIdRef = useRef<string | null>(null);
  const currentTaskDescriptionRef = useRef<string>('');
  const currentTaskIdRef = useRef<string | null>(null); // 任务 ID，用于关联会话任务上下文

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 保存用户首选语言，用于虚拟消息时保持语言一致性
  const preferredLanguagesRef = useRef<string[] | null>(null);

  // 诊断：音频异常检测器 ref（VoIP 未挂断检测）
  const audioAnomalyDetectorRef = useRef<ReturnType<typeof createAudioAnomalyDetector> | null>(null);
  // 跟踪当前 callRecordId（用于诊断上报）
  const callRecordIdForDiagRef = useRef<string | null>(null);

  // 统一裁判：单一 intentDetection ref（避免闭包问题）
  // US-006: 合并原有的 intentDetectionRef + habitIntentDetectionRef 为一个
  const intentDetectionRef = useRef<{
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
  });

  // 裁判 epoch：每次模式切换（campfire/habit_setup/normal/voip_push）递增，
  // 用于丢弃过期的异步结果（US-010 将消费此值）
  const refereeEpochRef = useRef(0);

  // 已切换到习惯设定模式的锁（防止 switch_to_habit_setup 无限循环触发）
  const habitSetupActiveRef = useRef(false);

  // 智能重试：记录最后一条用户消息和空响应计数
  const lastUserMessageRef = useRef<string | null>(null);
  const emptyResponseCountRef = useRef(0);
  const MAX_EMPTY_RETRIES = 2; // 最多重试 2 次

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
  // 短期对话上下文（用于篝火模式重连时让 AI "记得"之前聊了什么）
  // ==========================================
  const sessionContext = useSessionContext({ maxMessages: 10 });

  // ==========================================
  // 转录处理（独立 Hook：消息状态 + 去重 + 缓冲）
  // ==========================================
  const transcript = useTranscriptProcessor({
    onUserMessage: useCallback((text: string) => {
      orchestratorRef.current.onUserSpeech(text).catch((err) => {
        devWarn('话题检测失败:', err);
      });
      // 同步到短期对话上下文
      sessionContext.addMessage('user', text);
    }, [sessionContext]),
    onAIMessage: useCallback((text: string) => {
      orchestratorRef.current.onAISpeech(text);
      // 注意：不再在此处调用 processAIResponse —— 改由 turnComplete 统一触发，
      // 确保裁判拿到完整的 AI 回复而非碎片。缓冲由 useTranscriptProcessor.aiResponseBufferRef 完成。
      // 同步到短期对话上下文
      sessionContext.addMessage('ai', text);
    }, [sessionContext]),
    onUserSpeechFragment: useCallback((text: string) => {
      intentDetectionRef.current.addUserMessage(text);
    }, []),
  });

  // ==========================================
  // Gemini Live
  // ==========================================
  const geminiLive = useGeminiLive({
    onTranscriptUpdate: transcript.handleTranscriptUpdate,
  });

  // ==========================================
  // 篝火模式（独立 Hook）
  // ==========================================
  const campfire = useCampfireMode({
    geminiLive,
    sessionEpochRef,
    currentUserId: currentUserIdRef.current,
    currentTaskDescription: currentTaskDescriptionRef.current,
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
    getSessionContext: sessionContext.getContext,
  });

  // US-006: intentDetectionRef 由统一裁判实例 (unifiedIntentDetection) 同步

  // ==========================================
  // US-010: 异步记忆管道（供统一裁判的 topic_changed 触发）
  // ==========================================
  const memoryPipeline = useAsyncMemoryPipeline(currentUserIdRef.current);

  // ==========================================
  // 切换到习惯设定模式：直接换 Gemini 连接，不走 lifecycle
  // ==========================================
  const switchToHabitSetupMode = useCallback(async (topic?: string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const userId = currentUserIdRef.current;
      if (!userId) return;

      // 设置锁，防止切换后再次触发
      habitSetupActiveRef.current = true;
      // US-006: 模式切换时递增 epoch，丢弃过期异步结果
      refereeEpochRef.current += 1;
      devLog('🔄 [习惯切换] 开始切换...', { topic, epoch: refereeEpochRef.current });

      // 1. 获取习惯设定 prompt
      const { data, error } = await supabase.functions.invoke('start-voice-chat', {
        body: {
          userId,
          chatType: 'intention_compile',
          context: { phase: 'onboarding' },
          aiTone: 'gentle',
        },
      });

      if (error || !data?.geminiConfig?.systemPrompt) {
        devWarn('❌ [习惯切换] 获取 prompt 失败:', error);
        return;
      }

      // 2. 断开当前 Gemini 并等待完全清理
      geminiLive.disconnect();
      await new Promise(resolve => setTimeout(resolve, 300));
      devLog('🔄 [习惯切换] Gemini 已断开，开始重连...');

      // 3. 重新连接，用习惯设定的 prompt
      const { fetchGeminiToken } = await import('../useGeminiLive');
      const { getVoiceName } = await import('../../lib/voiceSettings');
      const token = await fetchGeminiToken();
      await geminiLive.connect(
        data.geminiConfig.systemPrompt,
        [],
        token,
        getVoiceName()
      );

      // 4. 等待连接稳定后启动麦克风
      await new Promise(resolve => setTimeout(resolve, 500));

      devLog('🎤 [习惯切换] 启动麦克风...', { isRecording: geminiLive.isRecording, isConnected: geminiLive.isConnected });
      try {
        // 强制启动麦克风，不管当前状态
        if (!geminiLive.isRecording) {
          await geminiLive.toggleMicrophone();
          devLog('✅ [习惯切换] 麦克风已启动');
        } else {
          devLog('✅ [习惯切换] 麦克风已经在运行');
        }
      } catch (e) {
        devWarn('⚠️ [习惯切换] 麦克风启动失败:', e);
      }

      // 5. 告诉 AI 用户想做什么
      const topicHint = topic || 'a habit';
      setTimeout(() => {
        geminiLive.sendTextMessage(
          `The user just said they want to set up ${topicHint}. Start helping them right away - ask the first question.`
        );
        devLog('📤 [习惯切换] 已发送上下文给 AI');
      }, 500);

      // 6. 更新保存的 system prompt
      campfire.savedSystemInstructionRef.current = data.geminiConfig.systemPrompt;

      devLog('✅ [习惯切换] 切换完成！');
    } catch (err) {
      devWarn('❌ [习惯切换] 失败:', err);
    }
  }, [geminiLive, campfire.savedSystemInstructionRef]);

  // ==========================================
  // 统一裁判 — 唯一的 useIntentDetection 实例（US-006）
  // 处理所有意图：campfire enter/exit、habit setup、chat mode、工具调用
  // ==========================================
  const unifiedIntentDetection = useIntentDetection({
    userId: currentUserIdRef.current || '',
    chatType: 'daily_chat',
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
    enabled: isSessionActive && (!campfire.isCampfireMode || geminiLive.isConnected),
    onToolResult: (result) => {
      // 工具执行完后，把结果注入回 Gemini 对话
      if (result.success && result.responseHint && geminiLive.isConnected) {
        devLog(`✅ [统一裁判] ${result.tool} 执行成功，注入结果到对话`);
        geminiLive.sendClientContent(
          `[TOOL_RESULT] type=${result.tool}\nresult: ${result.responseHint}\naction: 用你自己的话简短地告诉用户这个结果。不要直接照读，像朋友一样自然地说。`,
          true
        );
      } else if (!result.success) {
        devWarn(`❌ [统一裁判] ${result.tool} 执行失败:`, result.error);
      }
    },
    onDetectionComplete: (result) => {
      devLog(`🎯 [统一裁判] onDetectionComplete:`, {
        tool: result.tool, confidence: result.confidence,
        topic_changed: result.topic_changed, fetch_memories: result.fetch_memories,
        coach_note: result.coach_note?.slice(0, 40),
      });

      // ────────────────────────────────────────
      // 优先级 1：模式切换（最高优先级，立即执行并返回）
      // ────────────────────────────────────────
      if (result.tool && result.confidence >= 0.6) {
        const modeTools = ['enter_campfire', 'exit_campfire', 'switch_to_habit_setup', 'switch_to_chat_mode'];
        if (modeTools.includes(result.tool)) {
          switch (result.tool) {
            case 'enter_campfire':
              // 🔧 防止篝火模式重连后重复触发 enter_campfire
              if (campfire.isReconnectingFromCampfireRef.current) {
                devLog(`🔥 [统一裁判] 刚从篝火模式重连，忽略 enter_campfire 检测`);
                campfire.isReconnectingFromCampfireRef.current = false; // 重置标记
                return;
              }

              refereeEpochRef.current += 1;
              devLog(`🔥 [统一裁判] 进入篝火模式 (epoch=${refereeEpochRef.current})`);
              campfire.enterCampfireMode({ skipFarewell: true });
              return; // 模式切换后不处理其他动作

            case 'exit_campfire':
              refereeEpochRef.current += 1;
              devLog(`🔥 [统一裁判] 退出篝火模式 (epoch=${refereeEpochRef.current})`);
              campfire.exitCampfireMode();
              return;

            case 'switch_to_habit_setup':
              if (!habitSetupActiveRef.current) {
                devLog(`🎯 [统一裁判] 切换到习惯设定模式`);
                switchToHabitSetupMode(result.args?.topic as string | undefined);
              }
              return;

            case 'switch_to_chat_mode':
              refereeEpochRef.current += 1;
              devLog(`💬 [统一裁判] 切换到聊天模式 (epoch=${refereeEpochRef.current})`);
              if (geminiLive.isConnected) {
                geminiLive.sendClientContent(
                  `[MODE_OVERRIDE] mode=chat\nUser doesn't want tasks right now. Switch to friend mode: stop pushing, listen and support. If user later wants to work, guide back naturally.`,
                  false,
                  'system'
                );
              }
              return;
          }
        }
      }

      // ────────────────────────────────────────
      // 优先级 2：工具调用（由 useIntentDetection 内部的 executeToolCall 处理，
      //           这里只记录日志；executeToolCall 结果通过 onToolResult 回调）
      // ────────────────────────────────────────
      if (result.tool && result.tool !== 'null' && result.confidence >= 0.6) {
        devLog(`🎯 [统一裁判] 工具调用: ${result.tool} (置信度: ${result.confidence})`);
        // 有工具调用时，跳过低优先级动作
        return;
      }

      // ────────────────────────────────────────
      // 优先级 3：话题变化 + 记忆检索（US-010）
      // ────────────────────────────────────────
      if (result.topic_changed && result.fetch_memories) {
        // 防御性检查：篝火模式下不检索记忆
        if (campfire.isCampfireMode) {
          devLog(`📚 [统一裁判] 篝火模式中，跳过记忆检索`);
        } else {
          const epochAtStart = refereeEpochRef.current;
          devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          devLog(`📚 [记忆检索] 检测到话题变化，开始检索记忆...`);
          devLog(`📌 话题: ${result.topic_changed}`);
          devLog(`🔍 查询条件: ${JSON.stringify(result.memory_queries || [], null, 2)}`);
          devLog(`🔢 Epoch: ${epochAtStart}`);

          // 异步检索记忆 — 结果注入前检查 epoch
          memoryPipeline.fetchMemoriesForTopic(
            result.topic_changed,
            result.memory_queries || [],
          ).then((memories) => {
            // epoch 检查：模式已切换，丢弃过期结果
            if (refereeEpochRef.current !== epochAtStart) {
              devWarn(`📚 [记忆检索] epoch 已变化 (${epochAtStart} → ${refereeEpochRef.current})，丢弃过期结果`);
              return;
            }

            devLog(`📊 [记忆检索] 检索完成，共获取 ${memories.length} 条记忆`);

            if (memories.length > 0) {
              devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              devLog(`📝 [记忆检索] 检索到的记忆内容:`);
              memories.forEach((mem, idx) => {
                devLog(`  ${idx + 1}. [${mem.tags?.join(', ') || 'UNKNOWN'}] ${mem.content.slice(0, 100)}${mem.content.length > 100 ? '...' : ''}`);
              });
              devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

              if (geminiLive.isConnected) {
                const contextMsg = generateContextMessage(
                  memories, result.topic_changed!, 'neutral', 0.5
                );

                devLog(`📤 [记忆检索] 注入上下文消息到 Gemini:`);
                devLog(contextMsg);
                devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

                // 静默注入：turnComplete=false, role='system'
                geminiLive.sendClientContent(contextMsg, false, 'system');
                devLog(`✅ [记忆检索] 已成功注入 ${memories.length} 条记忆`);
              } else {
                devWarn(`⚠️ [记忆检索] Gemini 未连接，跳过记忆注入`);
              }
            } else {
              devLog(`ℹ️ [记忆检索] 未找到相关记忆`);
            }
          }).catch((err) => {
            devWarn(`❌ [记忆检索] 检索失败:`, err);
          });
        }
        // 不 return —— coach_note 理论上可以和记忆检索共存
      }

      // ────────────────────────────────────────
      // 优先级 4：教练提示（coach_note）
      // ────────────────────────────────────────
      if (result.coach_note && geminiLive.isConnected) {
        devLog(`📝 [统一裁判] 注入 coach_note: ${result.coach_note.slice(0, 50)}...`);
        geminiLive.sendClientContent(
          `[COACH_NOTE] ${result.coach_note}`,
          true
        );
      }
    },
  });

  // 同步统一裁判到 ref（供 turnComplete 回调使用）
  useEffect(() => {
    intentDetectionRef.current = {
      processAIResponse: unifiedIntentDetection.processAIResponse,
      addUserMessage: unifiedIntentDetection.addUserMessage,
    };
  }, [unifiedIntentDetection.processAIResponse, unifiedIntentDetection.addUserMessage]);

  // ==========================================
  // 倒计时（独立 Hook）
  // ==========================================

  /**
   * 用 ref 存储 onCountdownComplete，避免 timer hook 因回调变化而重建 interval
   */
  const onCountdownCompleteRef = useRef(onCountdownComplete);
  useEffect(() => {
    onCountdownCompleteRef.current = onCountdownComplete;
  }, [onCountdownComplete]);

  /**
   * 倒计时归零时的处理：保存记忆 → 清理会话 → 通知调用方
   * 通过 ref 间接调用，确保 interval 回调总是拿到最新的函数引用
   */
  const handleTimerComplete = useCallback(() => {
    void saveSessionMemoryRef.current();
    cleanupRef.current();
    onCountdownCompleteRef.current?.();
  }, []);

  const timer = useSessionTimer({
    initialTime,
    onComplete: handleTimerComplete,
  });

  // ==========================================
  // 记忆保存（独立 Hook）
  // ==========================================
  const memory = useSessionMemory({
    currentUserIdRef,
    currentTaskDescriptionRef,
    currentTaskIdRef,
    userSpeechBufferRef: transcript.userSpeechBufferRef,
    addMessageRef: transcript.addMessageRef,
    messages: transcript.messages,
    timeRemaining: timer.timeRemaining,
    initialTime,
  });

  // 同步 saveSessionMemory 到 ref，供 handleTimerComplete 使用
  useEffect(() => {
    saveSessionMemoryRef.current = memory.saveSessionMemory;
  }, [memory.saveSessionMemory]);

  // ==========================================
  // 会话生命周期（独立 Hook）
  // ==========================================
  const lifecycle = useSessionLifecycle({
    geminiLive,
    campfire,
    timer,
    transcript,
    initialTime,
    isSessionActive,
    isConnecting,
    setIsConnecting,
    setIsSessionActive,
    setIsObserving,
    setConnectionError,
    setTaskDescription,
    sessionEpochRef,
    currentUserIdRef,
    currentTaskDescriptionRef,
    currentTaskIdRef,
    preferredLanguagesRef,
    successRecordRef,
    getSessionContext: sessionContext.getContext,
  });

  // 同步 cleanup 到 ref，供 handleTimerComplete 使用
  useEffect(() => {
    cleanupRef.current = lifecycle.cleanup;
  }, [lifecycle.cleanup]);

  // ==========================================
  // 后台推送召回（切后台时渐进式推送）
  // ==========================================
  useBackgroundNudge({
    isSessionActive,
    taskId: currentTaskIdRef.current,
    taskDescription: currentTaskDescriptionRef.current,
    sessionType: campfire.isCampfireMode ? 'campfire' : 'coach',
    getTranscriptSummary: () => {
      const recent = transcript.messages.slice(-5);
      return recent.map(m => `${m.role}: ${m.content}`).join('\n');
    },
  });

  // ==========================================
  // VAD (Voice Activity Detection)
  // ==========================================
  // onVolumeReport 回调：将 VAD 每秒的音量上报给音频异常检测器
  const handleVolumeReport = useCallback((volume: number) => {
    audioAnomalyDetectorRef.current?.reportVolume(volume);
  }, []);

  const vad = useVoiceActivityDetection(geminiLive.audioStream, {
    enabled: enableVAD && isSessionActive && geminiLive.isRecording,
    threshold: 30,
    smoothingTimeConstant: 0.8,
    fftSize: 2048,
    onVolumeReport: handleVolumeReport,
  });

  // 诊断：当 session 激活时创建音频异常检测器，session 结束时销毁
  useEffect(() => {
    if (isSessionActive) {
      // 创建新的异常检测器
      audioAnomalyDetectorRef.current = createAudioAnomalyDetector({
        callRecordId: callRecordIdForDiagRef.current ?? undefined,
        onAnomalyDetected: () => {
          devLog('📊 [诊断] 音频异常检测器触发，已尝试 forceEndCallKit');
        },
      });
    } else {
      // session 结束时销毁
      audioAnomalyDetectorRef.current?.dispose();
      audioAnomalyDetectorRef.current = null;
    }
  }, [isSessionActive]);

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
    taskStartTime: timer.taskStartTime,
    sendClientContent: geminiLive.sendClientContent,
    isSpeaking: geminiLive.isSpeaking,
    enabled: isSessionActive && geminiLive.isConnected && !campfire.isCampfireMode,
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

  // ==========================================
  // 虚拟消息（原有的定时触发系统）
  // ==========================================
  // US-011: generate-coach-guidance API 已被统一裁判的 coach_note 替代
  // getConversationContext 和 fetchCoachGuidance 不再需要

  const virtualMessages = useVirtualMessages({
    enabled: enableVirtualMessages && isSessionActive && geminiLive.isConnected && !campfire.isCampfireMode,
    taskStartTime: timer.taskStartTime,
    isAISpeaking: geminiLive.isSpeaking,
    isUserSpeaking: vad.isSpeaking,
    lastUserSpeechTime: vad.lastSpeakingTime,
    onSendMessage: (message) => geminiLive.sendTextMessage(message),
    onAddMessage: (role, content, isVirtual) => transcript.addMessageRef.current(role, content, isVirtual),
    successRecord: successRecordRef.current,
    initialDuration: initialTime,
    preferredLanguage: preferredLanguagesRef.current?.[0],
  });

  const { setOnTurnComplete } = geminiLive;
  const { recordTurnComplete } = virtualMessages;

  // 当 AI 说完话时（turnComplete），统一触发：
  // 1. 虚拟消息系统通知
  // 2. 裁判（意图检测）— 用 flushAIResponseBuffer 取出完整回复
  // 3. 智能重试：检测空响应并自动重试
  useEffect(() => {
    setOnTurnComplete(() => {
      recordTurnComplete(false);
      orchestratorRef.current.onTurnComplete();

      // 取出本轮 AI 的完整回复，传给统一裁判（US-006: 只调用一次）
      const completeAIResponse = transcript.flushAIResponseBuffer();

      if (completeAIResponse.trim()) {
        // ✅ 有内容 - 成功回复，重置计数器
        emptyResponseCountRef.current = 0;
        intentDetectionRef.current.processAIResponse(completeAIResponse);
      } else {
        // 🚨 空响应 - 触发智能重试
        emptyResponseCountRef.current += 1;
        devWarn(`⚠️ [EmptyResponse] 第 ${emptyResponseCountRef.current} 次空响应（interrupted 导致）`);

        if (emptyResponseCountRef.current <= MAX_EMPTY_RETRIES && lastUserMessageRef.current) {
          // 🔄 重试：重新发送用户的最后一条消息
          devLog(`🔄 [Retry] 重新发送用户消息: "${lastUserMessageRef.current.slice(0, 50)}..."`);

          // 构造重试消息（告诉 AI 用户刚才说了什么）
          const preferredLang = preferredLanguagesRef.current?.[0] || 'en-US';
          const isChinese = preferredLang.includes('zh');
          const retryPrompt = isChinese
            ? `[系统提示] 用户刚才说："${lastUserMessageRef.current}"，但你的回复被中断了，请重新回复。`
            : `[SYSTEM] User just said: "${lastUserMessageRef.current}". Your response was interrupted, please respond again.`;

          geminiLive.sendTextMessage(retryPrompt);
        } else if (emptyResponseCountRef.current > MAX_EMPTY_RETRIES) {
          // ⚠️ 超过重试次数 - 发送 fallback 消息
          devWarn('⚠️ [EmptyResponse] 超过最大重试次数，发送 fallback 消息');

          const preferredLang = preferredLanguagesRef.current?.[0] || 'en-US';
          const isChinese = preferredLang.includes('zh');
          const fallbackMsg = isChinese
            ? "抱歉，我现在有点不在状态，我们稍后再聊好吗？"
            : "Sorry, I'm having some trouble right now. Can we talk later?";

          geminiLive.sendTextMessage(fallbackMsg);
          emptyResponseCountRef.current = 0; // 重置计数器
        }
      }
    });
    return () => setOnTurnComplete(null);
  }, [recordTurnComplete, setOnTurnComplete, transcript.flushAIResponseBuffer, geminiLive.sendTextMessage]);

  // 记录用户的最后一条消息（用于智能重试）
  useEffect(() => {
    const messages = transcript.messages;
    const userMessages = messages.filter(m => m.role === 'user' && !m.isVirtual);
    if (userMessages.length > 0) {
      const lastMsg = userMessages[userMessages.length - 1];
      lastUserMessageRef.current = lastMsg.content;
    }
  }, [transcript.messages]);

  // 当 AI 开始说话时，关闭观察状态
  useEffect(() => {
    if (geminiLive.isSpeaking && isObserving) {
      setIsObserving(false);
      devLog('👀 AI 开始说话，观察阶段结束');
    }
  }, [geminiLive.isSpeaking, isObserving]);

  // ==========================================
  // 返回值
  // ==========================================
  // 组合 state 对象（向后兼容，调用方仍可用 state.timeRemaining 等）
  const state: AICoachSessionState = {
    taskDescription,
    timeRemaining: timer.timeRemaining,
    isTimerRunning: timer.isTimerRunning,
    messages: transcript.messages,
  };

  return {
    // 状态
    state,
    isConnecting,
    isSessionActive,
    isObserving,
    connectionError,

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
    startSession: useCallback(async (taskDescription: string, sessionOptions?: Parameters<typeof lifecycle.startSession>[1]) => {
      // 新会话启动时重置习惯设定锁、裁判 epoch 和对话上下文
      habitSetupActiveRef.current = false;
      refereeEpochRef.current = 0;
      sessionContext.reset();
      // 诊断：在启动前记录 callRecordId，用于音频异常检测
      callRecordIdForDiagRef.current = sessionOptions?.callRecordId ?? null;
      return lifecycle.startSession(taskDescription, sessionOptions);
    }, [lifecycle.startSession, sessionContext]),
    endSession: lifecycle.endSession,
    stopAudioImmediately: lifecycle.stopAudioImmediately,
    resetSession: lifecycle.resetSession,
    saveSessionMemory: memory.saveSessionMemory,
    /** 更新当前任务 ID（用于后台保存临时任务后替换为真实 UUID） */
    updateTaskId: (newTaskId: string) => { currentTaskIdRef.current = newTaskId; },
    sendTextMessage: geminiLive.sendTextMessage,
    toggleCamera: geminiLive.toggleCamera,

    // 动态虚拟消息调度器
    orchestratorContext: messageOrchestrator.getContext,
    triggerMemoryRetrieval: messageOrchestrator.triggerMemoryRetrieval,

    // Refs（用于 UI）
    videoRef: geminiLive.videoRef,
    canvasRef: geminiLive.canvasRef,

    // 篝火模式
    isCampfireMode: campfire.isCampfireMode,
    enterCampfireMode: campfire.enterCampfireMode,
    exitCampfireMode: campfire.exitCampfireMode,
    campfireStats: campfire.campfireStats,

    // 帧缓冲区（任务完成时抓取最近帧用于视觉验证）
    getRecentFrames: geminiLive.getRecentFrames,
  };
}
