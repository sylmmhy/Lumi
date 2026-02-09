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
import { cleanNoiseMarkers } from './utils';
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

/** 生成的计划数据类型（与后端 plan-types.ts 对齐） */
interface GeneratedGoalPlan {
  goalType: string;
  goalName: string;
  baselineTime: string;
  ultimateTargetTime: string;
  currentTargetTime: string;
  advanceDirection: 'increase' | 'decrease';
  adjustmentStep: number;
  routines: Array<{
    name: string;
    durationMinutes: number;
    scheduledTime: string;
  }>;
  summary: {
    currentLevel: string;
    firstMilestone: string;
    ultimateGoal: string;
    adjustmentExplain: string;
  };
}

export function useAICoachSession(options: UseAICoachSessionOptions = {}) {
  const {
    initialTime = 300, // 保留供记忆系统参考，不再用于倒计时
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

  // 计划生成相关状态
  const [planGenerationState, setPlanGenerationState] = useState<
    'idle' | 'generating' | 'reviewing' | 'error'
  >('idle');
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedGoalPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

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
    clearHistory: () => void;
  }>({
    processAIResponse: () => {},
    addUserMessage: () => {},
    clearHistory: () => {},
  });

  // 裁判 epoch：每次模式切换（campfire/habit_setup/normal/voip_push）递增，
  // 用于丢弃过期的异步结果（US-010 将消费此值）
  const refereeEpochRef = useRef(0);

  // 用户消息 epoch：每次用户说话时递增，用于检测异步操作完成时用户是否说了新话
  // 解决意图检测滞后问题（上一轮的记忆检索在用户说新话后才完成并注入）
  const userMsgEpochRef = useRef(0);

  // 独立记忆搜索：防抖定时器 + 冷却时间戳
  const memorySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMemorySearchTimeRef = useRef(0); // 上次成功检索的时间戳
  const MEMORY_SEARCH_DEBOUNCE_MS = 1000; // 1秒防抖
  const MEMORY_SEARCH_COOLDOWN_MS = 30000; // 30秒冷却
  // ref 间接引用 triggerMemorySearch（避免 TDZ：函数定义在 memoryPipeline 之后，但 onUserMessage 在之前）
  const triggerMemorySearchRef = useRef<(msg: string) => void>(() => {});

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
    getContext: () => {
      currentTopic: { name: string } | null;
      recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
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
      // 🔧 用户说话时递增 epoch，用于检测异步操作过时
      userMsgEpochRef.current += 1;

      orchestratorRef.current.onUserSpeech(text).catch((err) => {
        devWarn('话题检测失败:', err);
      });
      // 同步到短期对话上下文
      sessionContext.addMessage('user', text);
      // 🔧 清理噪音标签后同步完整消息给意图检测（替代之前的碎片发送）
      const cleaned = cleanNoiseMarkers(text);
      if (cleaned) {
        intentDetectionRef.current.addUserMessage(cleaned);

        // 🆕 独立记忆搜索：用户说话后直接触发，与 Gemini Live 并行
        triggerMemorySearchRef.current(cleaned);
      }
    }, [sessionContext]),
    onAIMessage: useCallback((text: string) => {
      orchestratorRef.current.onAISpeech(text);
      // 注意：不再在此处调用 processAIResponse —— 改由 turnComplete 统一触发，
      // 确保裁判拿到完整的 AI 回复而非碎片。缓冲由 useTranscriptProcessor.aiResponseBufferRef 完成。
      // 🔧 不在碎片级存入 sessionContext — AI 转录碎片太多（一次回复 10-20 个碎片），
      // 会把用户消息挤出 maxMessages=10 的窗口。改由 turnComplete 时存完整 AI 回复。
    }, []),
    onUserSpeechFragment: useCallback((_text: string) => {
      // 不再给意图检测发碎片 — 改由 onUserMessage 发完整消息
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
  // 独立记忆搜索：用户说话后直接触发，与 Gemini Live 并行
  // ==========================================
  const triggerMemorySearch = useCallback((userMessage: string) => {
    // 防御：篝火模式且未连接时不搜索
    if (campfire.isCampfireMode && !geminiLive.isConnected) return;

    // 冷却检查：上次成功检索后 30 秒内不再检索
    const now = Date.now();
    if (now - lastMemorySearchTimeRef.current < MEMORY_SEARCH_COOLDOWN_MS) {
      devLog(`📚 [独立记忆] 冷却中，跳过 (距上次 ${Math.round((now - lastMemorySearchTimeRef.current) / 1000)}s)`);
      return;
    }

    // 防抖：清除之前的定时器
    if (memorySearchTimerRef.current) {
      clearTimeout(memorySearchTimerRef.current);
    }

    memorySearchTimerRef.current = setTimeout(async () => {
      const epochAtStart = refereeEpochRef.current;
      const userEpochAtStart = userMsgEpochRef.current;

      devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      devLog(`📚 [独立记忆] 用户说话触发记忆搜索...`);
      devLog(`📌 用户消息: "${userMessage.slice(0, 80)}"`);
      devLog(`🔢 Epoch: mode=${epochAtStart}, user=${userEpochAtStart}`);

      try {
        const memories = await memoryPipeline.fetchMemoriesForTopic(
          userMessage, // 用户原话作为 topic
          [],          // keywords 空，让后端自己提取
        );

        // epoch 检查 1：模式已切换
        if (refereeEpochRef.current !== epochAtStart) {
          devWarn(`📚 [独立记忆] 模式 epoch 已变化 (${epochAtStart} → ${refereeEpochRef.current})，丢弃`);
          return;
        }

        // epoch 检查 2：用户说了新话
        if (userMsgEpochRef.current !== userEpochAtStart) {
          devWarn(`📚 [独立记忆] 用户说了新话 (epoch ${userEpochAtStart} → ${userMsgEpochRef.current})，丢弃`);
          return;
        }

        devLog(`📊 [独立记忆] 检索完成，共获取 ${memories.length} 条记忆`);

        if (memories.length > 0 && geminiLive.isConnected) {
          devLog(`📝 [独立记忆] 检索到的记忆:`);
          memories.forEach((mem, idx) => {
            devLog(`  ${idx + 1}. [${mem.tags?.join(', ') || 'UNKNOWN'}] ${mem.content.slice(0, 100)}${mem.content.length > 100 ? '...' : ''}`);
          });

          const contextMsg = generateContextMessage(
            memories, userMessage, 'neutral', 0.5
          );

          devLog(`📤 [独立记忆] 注入上下文消息到 Gemini`);
          geminiLive.sendClientContent(contextMsg, false, 'user');
          devLog(`✅ [独立记忆] 已成功注入 ${memories.length} 条记忆`);

          // 更新冷却时间戳
          lastMemorySearchTimeRef.current = Date.now();
        } else if (memories.length === 0) {
          devLog(`ℹ️ [独立记忆] 未找到相关记忆`);
        }
      } catch (err) {
        devWarn(`❌ [独立记忆] 检索失败:`, err);
      }
      devLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }, MEMORY_SEARCH_DEBOUNCE_MS);
  }, [campfire.isCampfireMode, geminiLive.isConnected, geminiLive.sendClientContent, memoryPipeline]);

  // 同步 triggerMemorySearch 到 ref（供 onUserMessage 回调使用）
  useEffect(() => {
    triggerMemorySearchRef.current = triggerMemorySearch;
  }, [triggerMemorySearch]);

  // ==========================================
  // 切换到习惯设定模式：走 get-system-instruction + chatMode='setup'
  // 复用完整记忆管道，保持上下文接力
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
      devLog('🔄 [习惯切换] 开始切换（新架构: get-system-instruction + setup）...', { topic, epoch: refereeEpochRef.current });

      // 1. 打包对话上下文（上下文接力：切换前捕获快照）
      const conversationContext = sessionContext.getContext();
      devLog('📦 [习惯切换] 对话上下文已打包', {
        messageCount: conversationContext?.messages?.length || 0,
        summary: conversationContext?.summary || '无',
      });

      // 2. 通过 get-system-instruction 获取 Prompt C（带完整记忆管道）
      const taskDescription = topic ? `Setting up habit: ${topic}` : 'Setting up a new habit';
      const { data, error } = await supabase.functions.invoke('get-system-instruction', {
        body: {
          taskInput: taskDescription,
          userName: undefined, // lifecycle 会填充
          preferredLanguages: preferredLanguagesRef.current || undefined,
          userId,
          chatMode: 'setup',
          localTime: (() => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes} (24-hour format)`;
          })(),
          localDate: new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          }),
          localDateISO: new Date().toISOString().split('T')[0],
          // 注入对话上下文，保持记忆不磨灭
          isReconnect: true,
          context: conversationContext,
        },
      });

      if (error || !data?.systemInstruction) {
        devWarn('❌ [习惯切换] 获取 prompt 失败:', error);
        habitSetupActiveRef.current = false;
        return;
      }

      devLog('✅ [习惯切换] 获取到 Setup Prompt', {
        promptLength: data.systemInstruction.length,
        memoriesCount: data.retrievedMemories?.length || 0,
      });

      // 3. 断开当前 Gemini 并等待完全清理
      geminiLive.disconnect();
      await new Promise(resolve => setTimeout(resolve, 300));
      devLog('🔄 [习惯切换] Gemini 已断开，开始重连...');

      // 4. 重新连接，用习惯设定的 prompt（带完整记忆）
      const { fetchGeminiToken } = await import('../useGeminiLive');
      const { getVoiceName } = await import('../../lib/voiceSettings');
      const token = await fetchGeminiToken();
      await geminiLive.connect(
        data.systemInstruction,
        [],
        token,
        getVoiceName()
      );

      // 5. 等待连接稳定后启动麦克风
      await new Promise(resolve => setTimeout(resolve, 500));

      devLog('🎤 [习惯切换] 启动麦克风...', { isRecording: geminiLive.isRecording, isConnected: geminiLive.isConnected });
      try {
        if (!geminiLive.isRecording) {
          await geminiLive.toggleMicrophone();
          devLog('✅ [习惯切换] 麦克风已启动');
        } else {
          devLog('✅ [习惯切换] 麦克风已经在运行');
        }
      } catch (e) {
        devWarn('⚠️ [习惯切换] 麦克风启动失败:', e);
      }

      // 6. 告诉 AI 用户想做什么（prompt 中已有完整流程，这里只提供 topic 提示）
      const topicHint = topic || 'a habit';
      setTimeout(() => {
        geminiLive.sendTextMessage(
          `The user just said they want to set up ${topicHint}. Start helping them right away - ask the first question.`
        );
        devLog('📤 [习惯切换] 已发送上下文给 AI');
      }, 500);

      // 7. 更新保存的 system prompt
      campfire.savedSystemInstructionRef.current = data.systemInstruction;

      devLog('✅ [习惯切换] 切换完成！（新架构）');
    } catch (err) {
      devWarn('❌ [习惯切换] 失败:', err);
      habitSetupActiveRef.current = false;
    }
  }, [geminiLive, campfire.savedSystemInstructionRef, sessionContext]);

  // ==========================================
  // 计划生成流程（三个函数）
  // ==========================================

  /**
   * 处理异步计划生成
   * 在 detect-intent 返回 generate_plan 时调用
   */
  const handleGeneratePlan = useCallback(async () => {
    try {
      setPlanGenerationState('generating');
      setPlanError(null);

      // 1. 从 transcript 获取对话历史（过滤虚拟消息）
      const rawMessages = transcript.messages
        .filter((m: any) => !m.isVirtual)
        .map((m: any) => ({
          role: m.role === 'ai' ? 'assistant' as const : 'user' as const,
          content: m.content,
        }));

      if (rawMessages.length === 0) {
        setPlanError('对话历史为空');
        setPlanGenerationState('error');
        return;
      }

      // 2. 合并连续同角色的消息（解决流式 AI 回复碎片化问题）
      const realMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const msg of rawMessages) {
        const lastMsg = realMessages[realMessages.length - 1];
        if (lastMsg && lastMsg.role === msg.role) {
          // 同角色连续消息，拼接内容
          lastMsg.content += msg.content;
        } else {
          // 不同角色或第一条消息，新增
          realMessages.push({ role: msg.role, content: msg.content });
        }
      }

      devLog(`📋 [GeneratePlan] 原始消息: ${rawMessages.length} 条, 合并后: ${realMessages.length} 条`);

      // 3. 断开 Gemini Live
      devLog('🔌 [GeneratePlan] 断开 Gemini Live...');
      geminiLive.disconnect();

      // 4. 调用 generate-goal-plan Edge Function
      devLog('📋 [GeneratePlan] 调用 generate-goal-plan API...');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-goal-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userId: currentUserIdRef.current,
            messages: realMessages,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        devLog('❌ [GeneratePlan] HTTP 错误:', response.status, errorText.substring(0, 200));
        setPlanError(`服务器错误 (${response.status})，请重试`);
        setPlanGenerationState('error');
        return;
      }

      const data = await response.json();

      if (!data.success || !data.plan) {
        devLog('❌ [GeneratePlan] 生成失败:', data.error);
        setPlanError(data.error || '生成计划失败');
        setPlanGenerationState('error');
        return;
      }

      // 5. 设置计划数据，切换到审查模式
      devLog('✅ [GeneratePlan] 计划生成成功:', data.plan.goalName);
      setGeneratedPlan(data.plan);
      setPlanGenerationState('reviewing');

    } catch (err) {
      console.error('❌ [GeneratePlan] 错误:', err);
      setPlanError(err instanceof Error ? err.message : '未知错误');
      setPlanGenerationState('error');
    }
  }, [transcript.messages, geminiLive]);

  /**
   * 确认计划并保存
   */
  const confirmPlan = useCallback(async () => {
    if (!generatedPlan) return;

    try {
      setPlanGenerationState('generating'); // 复用 generating 状态显示加载

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-goal-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userId: currentUserIdRef.current,
            ...generatedPlan,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        setPlanError(data.error || '保存失败');
        setPlanGenerationState('error');
        return;
      }

      devLog('✅ [ConfirmPlan] 保存成功:', data.goalId);

      // 保存成功 → 重置状态
      setPlanGenerationState('idle');
      setGeneratedPlan(null);
      habitSetupActiveRef.current = false;

    } catch (err) {
      console.error('❌ [ConfirmPlan] 保存失败:', err);
      setPlanError(err instanceof Error ? err.message : '保存失败');
      setPlanGenerationState('error');
    }
  }, [generatedPlan]);

  /**
   * 重新聊聊（放弃当前计划，重新进入习惯设定模式）
   */
  const retryPlanChat = useCallback(() => {
    setPlanGenerationState('idle');
    setGeneratedPlan(null);
    setPlanError(null);
    // 重新连接 Gemini，走 switchToHabitSetupMode
    switchToHabitSetupMode();
  }, [switchToHabitSetupMode]);

  // ==========================================
  // 统一裁判 — 唯一的 useIntentDetection 实例（US-006）
  // 处理所有意图：campfire enter/exit、habit setup、chat mode、工具调用
  // ==========================================
  const unifiedIntentDetection = useIntentDetection({
    userId: currentUserIdRef.current || '',
    chatType: 'daily_chat',
    preferredLanguage: preferredLanguagesRef.current?.[0] || 'en-US',
    enabled: isSessionActive && (!campfire.isCampfireMode || geminiLive.isConnected),

    // 统一裁判上下文（用于话题检测和记忆检索）
    getCurrentTopic: useCallback(() => {
      const context = orchestratorRef.current.getContext();
      return context.currentTopic?.name || null;
    }, []),
    getCurrentMode: useCallback(() => {
      if (campfire.isCampfireMode) return 'campfire';
      if (habitSetupActiveRef.current) return 'habit_setup';
      return 'normal';
    }, [campfire.isCampfireMode]),
    getSilenceDuration: useCallback(() => {
      // TODO: 从 VAD 获取用户沉默时长
      return null;
    }, []),
    getTriggerType: useCallback(() => {
      // TODO: 区分 silence 触发和 ai_response 触发
      return 'ai_response' as const;
    }, []),
    getConversationHistory: useCallback(() => {
      const context = orchestratorRef.current.getContext();
      const messages = context.recentMessages || [];

      // 合并连续的 assistant 消息（因为 Gemini Live 流式输出会拆成多条）
      const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const msg of messages) {
        const last = merged[merged.length - 1];
        if (last && last.role === 'assistant' && msg.role === 'assistant') {
          // 合并到上一条
          last.content += msg.content;
        } else {
          // 新消息
          merged.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      return merged;
    }, []),

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
                campfire.clearReconnectingFlag(); // 清除标记和定时器
                return;
              }

              refereeEpochRef.current += 1;
              devLog(`🔥 [统一裁判] 进入篝火模式 (epoch=${refereeEpochRef.current})`);
              intentDetectionRef.current.clearHistory(); // 🔧 清空意图检测历史，避免旧消息残留
              campfire.enterCampfireMode({ skipFarewell: true });
              return; // 模式切换后不处理其他动作

            case 'exit_campfire':
              refereeEpochRef.current += 1;
              devLog(`🔥 [统一裁判] 退出篝火模式 (epoch=${refereeEpochRef.current})`);
              intentDetectionRef.current.clearHistory(); // 🔧 清空意图检测历史，避免旧消息残留
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
                  'user'
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
        // 特殊处理：generate_plan 不由 executeToolCall 处理，需要在这里手动调用
        if (result.tool === 'generate_plan') {
          devLog(`📋 [统一裁判] 检测到信息收集完成，开始生成计划`);
          handleGeneratePlan();
          return;
        }

        devLog(`🎯 [统一裁判] 工具调用: ${result.tool} (置信度: ${result.confidence})`);
        // 有工具调用时，跳过低优先级动作
        return;
      }

      // ────────────────────────────────────────
      // 优先级 3（已移除）：记忆检索现在由 triggerMemorySearch 在用户说话时独立触发
      // ────────────────────────────────────────

      // ────────────────────────────────────────
      // 优先级 4：教练提示（coach_note）
      // ────────────────────────────────────────
      if (result.coach_note && geminiLive.isConnected) {
        devLog(`📝 [统一裁判] 注入 coach_note: ${result.coach_note.slice(0, 50)}...`);
        geminiLive.sendClientContent(
          `[COACH_NOTE] ${result.coach_note}`,
          false  // ✅ 修复：不触发 AI 回复，静默注入上下文
        );
      }
    },
  });

  // 同步统一裁判到 ref（供 turnComplete 回调使用）
  useEffect(() => {
    intentDetectionRef.current = {
      processAIResponse: unifiedIntentDetection.processAIResponse,
      addUserMessage: unifiedIntentDetection.addUserMessage,
      clearHistory: unifiedIntentDetection.clearHistory,
    };
  }, [unifiedIntentDetection.processAIResponse, unifiedIntentDetection.addUserMessage, unifiedIntentDetection.clearHistory]);

  // ==========================================
  // 正计时（独立 Hook，无自动结束）
  // ==========================================

  const timer = useSessionTimer();

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
    // 🔧 Bug 3 修复：移除 !campfire.isCampfireMode 条件
    // 进入篝火时 disconnect() → isConnected=false → 自然关闭
    // 篝火重连时 isConnected=true → 应该启动
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
  // US-011: generate-coach-guidance API 已被统一裁判的 coach_note 替代
  // getConversationContext 和 fetchCoachGuidance 不再需要

  const virtualMessages = useVirtualMessages({
    // 🔧 Bug 3 修复：移除 !campfire.isCampfireMode 条件
    // isConnected 已足够作为启停条件：篝火 disconnect 时自动关闭，重连时自动启动
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
    getConversationHistory: useCallback(() => {
      const context = orchestratorRef.current.getContext();
      const messages = context.recentMessages || [];

      // 合并连续的 assistant 消息（因为 Gemini Live 流式输出会拆成多条）
      const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const msg of messages) {
        const last = merged[merged.length - 1];
        if (last && last.role === 'assistant' && msg.role === 'assistant') {
          last.content += msg.content;
        } else {
          merged.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      return merged;
    }, []),
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
        // 🔧 将完整 AI 回复存入 sessionContext（替代碎片式存储，避免挤掉用户消息）
        sessionContext.addMessage('ai', completeAIResponse);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意只依赖具体方法引用，避免整个对象变化导致不必要的重注册
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
      // 新会话启动时重置裁判 epoch 和对话上下文
      // 如果是 setup 模式（通过按钮冷启动），设置习惯设定锁防止意图检测重复触发
      habitSetupActiveRef.current = sessionOptions?.chatMode === 'setup';
      refereeEpochRef.current = 0;
      userMsgEpochRef.current = 0; // 🔧 重置用户消息 epoch
      sessionContext.reset();
      // 🔧 清空意图检测的历史记录，避免读取到之前会话的消息
      intentDetectionRef.current.clearHistory();
      // 诊断：在启动前记录 callRecordId，用于音频异常检测
      callRecordIdForDiagRef.current = sessionOptions?.callRecordId ?? null;
      return lifecycle.startSession(taskDescription, sessionOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意只依赖 lifecycle.startSession，避免整个 lifecycle 对象变化导致重建
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
    wakeUpLumi: campfire.wakeUpLumi,

    // 帧缓冲区（任务完成时抓取最近帧用于视觉验证）
    getRecentFrames: geminiLive.getRecentFrames,

    // 计划生成
    planGenerationState,
    generatedPlan,
    planError,
    confirmPlan,
    retryPlanChat,
  };
}
