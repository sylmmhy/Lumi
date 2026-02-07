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
  const currentTaskIdRef = useRef<string | null>(null); // 任务 ID，用于保存 actual_duration_minutes

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 保存用户首选语言，用于虚拟消息时保持语言一致性
  const preferredLanguagesRef = useRef<string[] | null>(null);

  // 诊断：音频异常检测器 ref（VoIP 未挂断检测）
  const audioAnomalyDetectorRef = useRef<ReturnType<typeof createAudioAnomalyDetector> | null>(null);
  // 跟踪当前 callRecordId（用于诊断上报）
  const callRecordIdForDiagRef = useRef<string | null>(null);

  // 用于调用 intentDetection 方法的 ref（避免闭包问题）
  const intentDetectionRef = useRef<{
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
  });

  // 习惯工具意图检测 ref（独立于篝火模式的 intentDetection）
  const habitIntentDetectionRef = useRef<{
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
  });

  // 已切换到习惯设定模式的锁（防止 switch_to_habit_setup 无限循环触发）
  const habitSetupActiveRef = useRef(false);

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
      habitIntentDetectionRef.current.addUserMessage(text);
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
    isSessionActive,
    getSessionContext: sessionContext.getContext,
  });

  // 更新 intentDetectionRef，避免 onTranscriptUpdate 闭包问题
  useEffect(() => {
    intentDetectionRef.current = {
      processAIResponse: campfire.intentDetection.processAIResponse,
      addUserMessage: campfire.intentDetection.addUserMessage,
    };
  }, [campfire.intentDetection.processAIResponse, campfire.intentDetection.addUserMessage]);

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
      devLog('🔄 [习惯切换] 开始切换...', { topic });

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
  // 习惯工具意图检测（独立于篝火模式，处理 save_goal_plan 等）
  // 用户在“陪我聊天”里提到想设立习惯时，自动检测并调用后端工具
  // ==========================================
  const habitIntentDetection = useIntentDetection({
    userId: currentUserIdRef.current || '',
    chatType: 'daily_chat',
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
    enabled: isSessionActive && !campfire.isCampfireMode,
    onToolResult: (result) => {
      // 工具执行完后，把结果注入回 Gemini 对话
      if (result.success && result.responseHint && geminiLive.isConnected) {
        devLog(`✅ [习惯工具] ${result.tool} 执行成功，注入结果到对话`);
        geminiLive.sendClientContent(
          `[TOOL_RESULT] type=${result.tool}\nresult: ${result.responseHint}\naction: 用你自己的话简短地告诉用户这个结果。不要直接照读，像朋友一样自然地说。`,
          true
        );
      } else if (!result.success) {
        devWarn(`❌ [习惯工具] ${result.tool} 执行失败:`, result.error);
      }
    },
    onDetectionComplete: (result) => {
      devLog(`🎯 [习惯意图] onDetectionComplete 被调用:`, { tool: result.tool, confidence: result.confidence });
      if (result.tool === 'switch_to_habit_setup' && result.confidence >= 0.6 && !habitSetupActiveRef.current) {
        devLog(`🎯 [习惯意图] 检测到用户想设立习惯，切换到习惯设定模式...`);
        switchToHabitSetupMode(result.args?.topic as string | undefined);
      } else if (result.tool && !['enter_campfire', 'exit_campfire', 'switch_to_habit_setup'].includes(result.tool)) {
        devLog(`🎯 [习惯意图] 检测到: ${result.tool} (置信度: ${result.confidence})`);
      }
    },
  });

  // 同步习惯意图检测 ref
  useEffect(() => {
    habitIntentDetectionRef.current = {
      processAIResponse: habitIntentDetection.processAIResponse,
      addUserMessage: habitIntentDetection.addUserMessage,
    };
  }, [habitIntentDetection.processAIResponse, habitIntentDetection.addUserMessage]);

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
  /**
   * 从 Orchestrator 获取当前对话上下文（给"智能小纸条"用）
   */
  const getConversationContext = useCallback((): VirtualMessageUserContext | null => {
    return orchestratorRef.current.getVirtualMessageContext?.() ?? null;
  }, []);

  /**
   * 调用后端 Edge Function，生成一条"小纸条"（一整句话）
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
      devWarn('⚠️ generate-coach-guidance 调用失败:', error);
      return null;
    }

    if (data && typeof (data as { note?: unknown }).note === 'string') {
      return { note: (data as { note: string }).note };
    }

    return null;
  }, []);

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
    getConversationContext,
    fetchCoachGuidance,
  });

  const { setOnTurnComplete } = geminiLive;
  const { recordTurnComplete } = virtualMessages;

  // 当 AI 说完话时（turnComplete），统一触发：
  // 1. 虚拟消息系统通知
  // 2. 裁判（意图检测）— 用 flushAIResponseBuffer 取出完整回复
  useEffect(() => {
    setOnTurnComplete(() => {
      recordTurnComplete(false);
      orchestratorRef.current.onTurnComplete();

      // 取出本轮 AI 的完整回复，传给裁判（意图检测）
      const completeAIResponse = transcript.flushAIResponseBuffer();
      if (completeAIResponse.trim()) {
        intentDetectionRef.current.processAIResponse(completeAIResponse);
        habitIntentDetectionRef.current.processAIResponse(completeAIResponse);
      }
    });
    return () => setOnTurnComplete(null);
  }, [recordTurnComplete, setOnTurnComplete, transcript.flushAIResponseBuffer]);

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
      // 新会话启动时重置习惯设定锁和对话上下文
      habitSetupActiveRef.current = false;
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
