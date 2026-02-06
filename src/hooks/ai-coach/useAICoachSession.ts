import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from '../useGeminiLive';
import { useVirtualMessages } from '../useVirtualMessages';
import type { SuccessRecordForVM } from '../useVirtualMessages';
import { useVoiceActivityDetection } from '../useVoiceActivityDetection';
import { useWaveformAnimation } from '../useWaveformAnimation';
import { useVirtualMessageOrchestrator } from '../virtual-messages';
import { getSupabaseClient } from '../../lib/supabase';
import { updateReminder } from '../../remindMe/services/reminderService';
import { getVoiceName } from '../../lib/voiceSettings';
import type { VirtualMessageUserContext } from '../virtual-messages/types';
import { devError, devLog, devWarn } from '../gemini-live/utils';
import type { AICoachMessage, AICoachSessionState, UseAICoachSessionOptions } from './types';
import { CONNECTION_TIMEOUT_MS, MAX_CAMERA_RETRIES, CAMERA_RETRY_DELAY_MS } from './types';
import { withTimeout, isValidUserSpeech } from './utils';
import { useCampfireMode } from './useCampfireMode';
import { useSessionTimer } from './useSessionTimer';

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
  // 状态管理（taskDescription + messages 独立管理，timeRemaining/isTimerRunning 由 useSessionTimer 管理）
  // ==========================================
  const [taskDescription, setTaskDescription] = useState('');
  const [messages, setMessages] = useState<AICoachMessage[]>([]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isObserving, setIsObserving] = useState(false); // AI 正在观察用户
  const [connectionError, setConnectionError] = useState<string | null>(null); // 连接错误信息

  const isCleaningUpRef = useRef(false); // 防止重复清理
  const sessionEpochRef = useRef(0); // 递增用于取消 in-flight 的 startSession / campfire reconnect
  const startSessionInFlightRef = useRef(false); // 幂等守卫：防止并发 startSession

  const processedTranscriptRef = useRef<Set<string>>(new Set());

  /**
   * 保存最新的 saveSessionMemory 引用，确保倒计时结束时可以稳定触发记忆保存
   */
  const saveSessionMemoryRef = useRef<(options?: { additionalContext?: string; forceTaskCompleted?: boolean }) => Promise<boolean>>(
    async () => false
  );

  /**
   * 保存最新的 cleanup 引用，供 handleTimerComplete 使用
   * 初始为空函数，在 cleanup 定义后由 effect 同步
   */
  const cleanupRef = useRef<() => void>(() => {});

  // 使用 ref 来存储 addMessage 函数，避免循环依赖问题
  const addMessageRef = useRef<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>(() => {});

  // 使用 ref 存储当前会话信息
  const currentUserIdRef = useRef<string | null>(null);
  const currentTaskDescriptionRef = useRef<string>('');
  const currentTaskIdRef = useRef<string | null>(null); // 任务 ID，用于保存 actual_duration_minutes
  const currentCallRecordIdRef = useRef<string | null>(null); // 来电记录 ID，用于记录通话时长

  // 用于累积用户语音碎片，避免每个词都存为单独消息
  const userSpeechBufferRef = useRef<string>('');

  // 跟踪上一条消息的角色，用于检测角色切换
  const lastProcessedRoleRef = useRef<'user' | 'assistant' | null>(null);

  // 存储从服务器获取的成功记录（用于虚拟消息系统的 memory boost）
  const successRecordRef = useRef<SuccessRecordForVM | null>(null);

  // 保存用户首选语言，用于虚拟消息时保持语言一致性
  const preferredLanguagesRef = useRef<string[] | null>(null);

  // DEV: AI 语音 log 缓冲区，用于将流式碎片拼接成完整句子后再输出
  const aiSpeechLogBufferRef = useRef<string>('');
  const aiSpeechLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // 消息管理（必须在其他 hooks 之前定义）
  // ==========================================
  const addMessage = useCallback((role: 'user' | 'ai', content: string, isVirtual = false) => {
    setMessages(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        role,
        content,
        timestamp: new Date(),
        isVirtual,
      },
    ]);
  }, []);

  // 更新 addMessage ref
  useEffect(() => {
    addMessageRef.current = addMessage;
  }, [addMessage]);

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
          devLog('🎤 用户说:', fullUserMessage);
          addMessageRef.current('user', fullUserMessage, false);

          // 用完整的用户消息进行话题检测和记忆检索
          orchestratorRef.current.onUserSpeech(fullUserMessage).catch((err) => {
            devWarn('话题检测失败:', err);
          });

          userSpeechBufferRef.current = '';
        }

        // 存储 AI 消息
        const displayText = lastMessage.text;
        addMessageRef.current('ai', displayText);
        if (import.meta.env.DEV) {
          // 累积流式碎片，500ms 无新消息后输出完整句子
          aiSpeechLogBufferRef.current += displayText;
          if (aiSpeechLogTimerRef.current) clearTimeout(aiSpeechLogTimerRef.current);
          aiSpeechLogTimerRef.current = setTimeout(() => {
            devLog('🤖 AI 说:', aiSpeechLogBufferRef.current);
            aiSpeechLogBufferRef.current = '';
          }, 500);
        }

        // 通知动态虚拟消息调度器（用于上下文追踪）
        orchestratorRef.current.onAISpeech(displayText);

        // 喂意图检测（AI 回复）
        intentDetectionRef.current.processAIResponse(displayText);

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'assistant';
      }

      if (lastMessage.role === 'user') {
        // 累积用户语音碎片，不立即存储
        if (isValidUserSpeech(lastMessage.text)) {
          userSpeechBufferRef.current += lastMessage.text;

          // 喂意图检测（用户消息）
          intentDetectionRef.current.addUserMessage(lastMessage.text);
        }

        // 更新角色跟踪
        lastProcessedRoleRef.current = 'user';
      }
    },
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
    onAddMessage: (role, content, isVirtual) => addMessageRef.current(role, content, isVirtual),
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
  // 统一清理函数（解决断开连接逻辑重复问题）
  // ==========================================
  const cleanup = useCallback(() => {
    // bump epoch: 任何 cleanup 都会让 in-flight 的 startSession/campfire reconnect 作废
    sessionEpochRef.current += 1;

    // 防止重复清理
    if (isCleaningUpRef.current) {
      try {
        geminiLive.disconnect();
      } catch (e) {
        devWarn('cleanup: geminiLive.disconnect() failed (ignored)', e);
      }
      return;
    }
    isCleaningUpRef.current = true;

    devLog('🧹 执行统一清理...');

    // 记录通话结束时间和时长（如果有 callRecordId）
    const callRecordId = currentCallRecordIdRef.current;
    if (callRecordId && timer.taskStartTime > 0) {
      const durationSeconds = Math.round((Date.now() - timer.taskStartTime) / 1000);
      devLog('📞 记录通话结束:', { callRecordId, durationSeconds });

      const supabaseForEndCall = getSupabaseClient();
      if (supabaseForEndCall) {
        supabaseForEndCall.functions.invoke('manage-call-records', {
          body: {
            action: 'end_call',
            call_record_id: callRecordId,
            end_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
          },
        }).then(({ error }) => {
          if (error) {
            devWarn('⚠️ 记录通话结束失败:', error);
          } else {
            devLog('✅ 通话结束已记录');
          }
        });
      }
      currentCallRecordIdRef.current = null;
    }

    // 1. 停止计时器
    timer.stopTimer();

    // 2. 断开 Gemini 连接
    geminiLive.disconnect();

    // 3. 重置状态
    setIsSessionActive(false);
    setIsObserving(false);
    setIsConnecting(false);

    // 重置清理标志（延迟重置，确保当前清理完成）
    setTimeout(() => {
      isCleaningUpRef.current = false;
    }, 100);

    devLog('✅ 统一清理完成');
  }, [geminiLive, timer.stopTimer, timer.taskStartTime]);

  // 同步 cleanup 到 ref，供 handleTimerComplete 使用
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  // ==========================================
  // 会话管理
  // ==========================================

  /**
   * 开始 AI 教练会话
   */
  const startSession = useCallback(async (
    taskDescription: string,
    options?: { userId?: string; customSystemInstruction?: string; userName?: string; preferredLanguages?: string[]; taskId?: string; callRecordId?: string }
  ) => {
    // 幂等守卫
    if (startSessionInFlightRef.current) {
      devWarn('startSession ignored: another startSession is already in progress');
      return false;
    }
    startSessionInFlightRef.current = true;

    const { userId, customSystemInstruction, userName, preferredLanguages, taskId, callRecordId } = options || {};
    let epochAtStart = sessionEpochRef.current;

   try {
      devLog('🚀 开始 AI 教练会话...');

      // 如果当前在篝火模式，先停掉篝火资源
      if (campfire.isCampfireMode) {
        campfire.stopCampfireResources();
      }

      // 防止 sessionRef 残留导致 connect 被忽略
      geminiLive.disconnect();

      // 如果存在旧会话/正在连接，先统一 cleanup
      if (isSessionActive || isConnecting || geminiLive.isConnected) {
        devLog('⚠️ 检测到旧会话/连接中，先清理...');
        cleanup();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // 重置清理标志
      isCleaningUpRef.current = false;

      // capture epoch
      epochAtStart = sessionEpochRef.current;

      processedTranscriptRef.current.clear();
      campfire.intentDetection.clearHistory();
      currentUserIdRef.current = userId || null;
      currentTaskDescriptionRef.current = taskDescription;
      lastProcessedRoleRef.current = null;
      currentTaskIdRef.current = taskId || null;
      currentCallRecordIdRef.current = callRecordId || null;
      preferredLanguagesRef.current = preferredLanguages || null;
      setIsConnecting(true);
      setConnectionError(null);

      // 更新任务描述并重置
      setTaskDescription(taskDescription);
      setMessages([]);
      timer.resetTimer();

      devLog('🚀 全并行启动: 硬件初始化 + 网络请求同时进行...');

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      const needFetchInstruction = !customSystemInstruction;

      const [, , instructionResult, token] = await withTimeout(
        Promise.all([
          // 任务A：摄像头初始化（带重试机制）
          (async () => {
            devLog('🎬 [并行] 摄像头初始化...', { cameraEnabled: geminiLive.cameraEnabled });
            if (!geminiLive.cameraEnabled) {
              let cameraRetries = 0;
              let cameraSuccess = false;

              while (cameraRetries < MAX_CAMERA_RETRIES && !cameraSuccess) {
                devLog(`📹 摄像头尝试 #${cameraRetries + 1}，调用 toggleCamera()...`);
                try {
                  await geminiLive.toggleCamera();
                  cameraSuccess = true;
                  devLog('✅ 摄像头启用成功');
                } catch (cameraError) {
                  cameraRetries++;
                  const errorMessage = cameraError instanceof Error ? cameraError.message : String(cameraError);
                  devWarn('❌ 摄像头启用异常:', cameraError);
                  devLog('❌ 摄像头错误详情:', errorMessage);

                  if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
                    devLog('⚠️ 摄像头权限被拒绝，跳过重试');
                    break;
                  }

                  if (cameraRetries < MAX_CAMERA_RETRIES) {
                    devLog(`⚠️ 摄像头启用失败，${CAMERA_RETRY_DELAY_MS}ms 后重试 (${cameraRetries}/${MAX_CAMERA_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, CAMERA_RETRY_DELAY_MS));
                    devLog(`🔄 重试等待结束，开始第 ${cameraRetries + 1} 次尝试...`);
                  } else {
                    devLog('⚠️ 摄像头启用失败，已达最大重试次数，继续流程');
                  }
                }
              }
              devLog(`📹 摄像头初始化循环结束: cameraSuccess=${cameraSuccess}, cameraEnabled=${geminiLive.cameraEnabled}`);
            }
          })(),

          // 任务B：麦克风初始化 + callRecordId 记录
          (async () => {
            devLog('🎤 [并行] 麦克风初始化...');
            if (!geminiLive.isRecording) {
              devLog('🎤 调用 toggleMicrophone()...');
              await geminiLive.toggleMicrophone();
              devLog('🎤 toggleMicrophone() 完成');
            } else {
              devLog('🎤 麦克风已启用，跳过');
            }

            // 麦克风连接成功后，记录 callRecordId（fire-and-forget）
            if (callRecordId) {
              devLog('📞 记录 mic_connected_at:', callRecordId);
              const supabaseForMic = getSupabaseClient();
              if (supabaseForMic) {
                supabaseForMic.functions.invoke('manage-call-records', {
                  body: {
                    action: 'mark_mic_connected',
                    call_record_id: callRecordId,
                  },
                }).then(({ error }) => {
                  if (error) {
                    devWarn('⚠️ 记录 mic_connected_at 失败:', error);
                  } else {
                    devLog('✅ mic_connected_at 已记录');
                  }
                });
              }
            }
          })(),

          // 任务C：获取系统指令（后端记忆检索）
          needFetchInstruction
            ? supabaseClient.functions.invoke('get-system-instruction', {
                body: {
                  taskInput: taskDescription,
                  userName,
                  preferredLanguages,
                  userId,
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
                  localDateISO: new Date().toISOString().split('T')[0]
                }
              })
            : Promise.resolve(null),

          // 任务D：获取 Gemini token
          fetchGeminiToken(),
        ]),
        CONNECTION_TIMEOUT_MS,
        '获取配置超时，请检查网络连接后重试'
      );

      if (epochAtStart !== sessionEpochRef.current) {
        devLog('startSession cancelled after parallel init (stale epoch)');
        return false;
      }

      // 处理 system instruction 结果
      let systemInstruction = customSystemInstruction;
      if (instructionResult) {
        if (instructionResult.error) {
          throw new Error(`获取系统指令失败: ${instructionResult.error.message}`);
        }
        systemInstruction = instructionResult.data.systemInstruction;

        // 日志：显示检索到的记忆
        if (import.meta.env.DEV) {
          const retrievedMemories = instructionResult.data.retrievedMemories as string[] | undefined;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🧠 [记忆检索] 本次会话取到的记忆:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          if (retrievedMemories && retrievedMemories.length > 0) {
            retrievedMemories.forEach((memory, index) => {
              console.log(`  ${index + 1}. ${memory}`);
            });
          } else {
            console.log('  (无记忆 - 这可能是新用户或没有相关记忆)');
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        // Phase 3: 提取成功记录
        if (instructionResult.data.successRecord) {
          successRecordRef.current = instructionResult.data.successRecord;
          if (import.meta.env.DEV) {
            console.log('📊 获取到用户成功记录:', successRecordRef.current);
          }
        } else {
          successRecordRef.current = null;
        }
      } else {
        successRecordRef.current = null;
      }

      // 保存 system instruction 用于篝火模式退出后恢复
      if (systemInstruction) {
        campfire.savedSystemInstructionRef.current = systemInstruction;
      }

      if (import.meta.env.DEV) {
        devLog('✅ 并行获取完成，正在连接 Gemini Live...');
      }

      // 获取用户选择的 AI 声音
      const voiceName = getVoiceName();
      if (import.meta.env.DEV) {
        devLog('🎤 使用 AI 声音:', voiceName);
      }

      // 使用预获取的 token 连接（带超时保护）
      await withTimeout(
        geminiLive.connect(systemInstruction, undefined, token, voiceName),
        CONNECTION_TIMEOUT_MS,
        '连接 AI 服务超时，请检查网络连接后重试'
      );

      if (epochAtStart !== sessionEpochRef.current) {
        devLog('startSession cancelled after connect (stale epoch)');
        geminiLive.disconnect();
        return false;
      }

      if (import.meta.env.DEV) {
        devLog('✅ 连接已建立');
      }

      setIsConnecting(false);
      setIsSessionActive(true);
      setIsObserving(true);

      // 开始倒计时
      timer.startTimer();

      if (import.meta.env.DEV) {
        devLog('✨ AI 教练会话已成功开始');
      }

      return true;
    } catch (error) {
      if (epochAtStart !== sessionEpochRef.current) {
        devLog('startSession aborted (stale epoch), ignoring error:', error);
        return false;
      }

      const errorMessage = error instanceof Error ? error.message : '连接失败，请重试';
      console.error('❌ startSession 错误:', errorMessage);
      devError('❌ startSession 错误详情:', error);
      setIsConnecting(false);
      setConnectionError(errorMessage);

      cleanup();

      throw error;
    } finally {
      startSessionInFlightRef.current = false;
    }
  }, [initialTime, geminiLive, timer, cleanup, isSessionActive, isConnecting, campfire]);

  /**
   * 立即停止音频播放（不断开连接、不清理资源）
   */
  const stopAudioImmediately = useCallback(() => {
    devLog('🔇 立即停止音频播放...');
    geminiLive.stopAudio();
  }, [geminiLive]);

  /**
   * 结束 AI 教练会话
   */
  const endSession = useCallback(() => {
    devLog('🔌 结束 AI 教练会话...');

    // 如果在篝火模式中直接挂电话，先清理篝火模式资源
    if (campfire.isCampfireMode) {
      campfire.stopCampfireResources();
    }

    cleanup();

    devLog('✅ AI 教练会话已结束');
  }, [cleanup, campfire]);

  /**
   * 保存会话记忆到 Mem0
   */
  const saveSessionMemory = useCallback(async (options?: { additionalContext?: string; forceTaskCompleted?: boolean }) => {
    const { additionalContext, forceTaskCompleted } = options || {};
    const userId = currentUserIdRef.current;
    const taskDescription = currentTaskDescriptionRef.current;

    if (!userId) {
      devLog('⚠️ 无法保存记忆：缺少 userId');
      return false;
    }

    // 复制当前消息列表
    const messagesCopy = [...messages];

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

      const wasTaskCompleted = forceTaskCompleted === true || timer.timeRemaining === 0;
      const actualDurationMinutes = Math.round((initialTime - timer.timeRemaining) / 60);

      if (import.meta.env.DEV) {
        devLog('📊 任务完成状态:', {
          wasTaskCompleted,
          forceTaskCompleted,
          actualDurationMinutes,
          timeRemaining: timer.timeRemaining,
          initialTime,
        });
      }

      const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
        body: {
          action: 'extract',
          userId,
          messages: mem0Messages,
          taskDescription,
          localDate: new Date().toISOString().split('T')[0],
          metadata: {
            source: 'ai_coach_session',
            sessionDuration: initialTime - timer.timeRemaining,
            timestamp: new Date().toISOString(),
            task_completed: wasTaskCompleted,
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

      const taskId = currentTaskIdRef.current;
      if (wasTaskCompleted && taskId && actualDurationMinutes > 0) {
        try {
          await updateReminder(taskId, {
            actualDurationMinutes,
          });
          if (import.meta.env.DEV) {
            devLog('✅ 任务完成时长已保存到数据库:', { taskId, actualDurationMinutes });
          }
        } catch (updateError) {
          devWarn('⚠️ 保存任务完成时长失败:', updateError);
        }
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ 保存会话记忆失败:', errorMessage);
      devWarn('❌ 保存会话记忆失败详情:', error);
      return false;
    }
  }, [messages, timer.timeRemaining, initialTime]);

  /**
   * 同步 saveSessionMemory 的最新实现
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
    lastProcessedRoleRef.current = null;
    setConnectionError(null);
    setTaskDescription('');
    setMessages([]);
    timer.resetTimer();
  }, [endSession, timer]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      sessionEpochRef.current += 1;
      timer.cleanupTimer();
      geminiLive.disconnect();

      // 篝火模式资源清理（委托给子 Hook）
      campfire.cleanupResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // 返回值
  // ==========================================
  // 组合 state 对象（向后兼容，调用方仍可用 state.timeRemaining 等）
  const state: AICoachSessionState = {
    taskDescription,
    timeRemaining: timer.timeRemaining,
    isTimerRunning: timer.isTimerRunning,
    messages,
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
    startSession,
    endSession,
    stopAudioImmediately,
    resetSession,
    saveSessionMemory,
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
