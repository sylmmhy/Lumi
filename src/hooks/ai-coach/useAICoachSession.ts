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

  // 用于调用 intentDetection 方法的 ref（避免闭包问题）
  const intentDetectionRef = useRef<{
    processAIResponse: (aiResponse: string) => void;
    addUserMessage: (message: string) => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
  });

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
  // 转录处理（独立 Hook：消息状态 + 去重 + 缓冲）
  // ==========================================
  const transcript = useTranscriptProcessor({
    onUserMessage: useCallback((text: string) => {
      orchestratorRef.current.onUserSpeech(text).catch((err) => {
        devWarn('话题检测失败:', err);
      });
    }, []),
    onAIMessage: useCallback((text: string) => {
      orchestratorRef.current.onAISpeech(text);
      intentDetectionRef.current.processAIResponse(text);
    }, []),
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
    isSessionActive,
  });

  // 更新 intentDetectionRef，避免 onTranscriptUpdate 闭包问题
  useEffect(() => {
    intentDetectionRef.current = {
      processAIResponse: campfire.intentDetection.processAIResponse,
      addUserMessage: campfire.intentDetection.addUserMessage,
    };
  }, [campfire.intentDetection.processAIResponse, campfire.intentDetection.addUserMessage]);

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
  });

  // 同步 cleanup 到 ref，供 handleTimerComplete 使用
  useEffect(() => {
    cleanupRef.current = lifecycle.cleanup;
  }, [lifecycle.cleanup]);

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
  // 动态虚拟消息调度器（方案 2：过渡话注入）
  // ==========================================
  const messageOrchestrator = useVirtualMessageOrchestrator({
    userId: currentUserIdRef.current,
    taskDescription: currentTaskDescriptionRef.current,
    initialDuration: initialTime,
    taskStartTime: timer.taskStartTime,
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
    enabled: enableVirtualMessages && isSessionActive && geminiLive.isConnected,
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

  // 当 AI 说完话时（turnComplete），同时通知两套虚拟消息系统
  useEffect(() => {
    setOnTurnComplete(() => {
      recordTurnComplete(false);
      orchestratorRef.current.onTurnComplete();
    });
    return () => setOnTurnComplete(null);
  }, [recordTurnComplete, setOnTurnComplete]);

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
    startSession: lifecycle.startSession,
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
  };
}
