import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '../remindMe/types';
import type { AppTab } from '../constants/routes';
import { useAICoachSession } from './useAICoachSession';
import { useCelebrationAnimation } from './useCelebrationAnimation';
import type { CelebrationFlow } from '../components/celebration/CelebrationView';
import { createReminder, fetchReminderById, updateReminder } from '../remindMe/services/reminderService';
import { isNativeApp } from '../utils/nativeTaskEvents';
import { supabase } from '../lib/supabase';
import { getPreferredLanguages } from '../lib/language';
import { isLiveKitMode, startLiveKitRoom, endLiveKitRoom, onLiveKitEvent } from '../lib/liveKitSettings';
import { devLog } from '../utils/devLog';
import { getLocalDateString } from '../utils/timeUtils';
import { saveSessionMemory } from '../lib/saveSessionMemory';
import { useTaskVerification } from './useTaskVerification';
import type { VerificationResult } from './useTaskVerification';
import type { CoinRewardSource } from '../constants/coinRewards';

// ==========================================
// 类型定义
// ==========================================

/**
 * 认证信息，由 AppTabsPage 的 AuthContext 提供
 */
interface CoachAuth {
    userId: string | null;
    userName: string | null;
    isLoggedIn: boolean;
    isSessionValidated: boolean;
}

interface AwardCoinsBreakdownItem {
    source: string;
    amount: number;
    status: string;
}

interface AwardCoinsResponse {
    total_coins_awarded?: number;
    breakdown?: AwardCoinsBreakdownItem[];
    user_total_coins?: number;
    user_weekly_coins?: number;
    streak_days?: number;
}

/**
 * 任务管理接口，由 useAppTasks hook 提供
 */
interface CoachAppTasks {
    tasks: Task[];
    tasksLoaded: boolean;
    isTaskSignatureCreated: (sig: string) => boolean;
    markTaskSignatureCreated: (sig: string) => void;
    replaceTaskId: (oldId: string, newTask: Task) => void;
    patchTask: (id: string, patch: Partial<Task>) => void;
    upsertTask: (task: Task) => void;
    markTaskAsCompleted: (
        taskId: string | null,
        actualDurationMinutes: number,
        taskType?: 'todo' | 'routine' | 'routine_instance' | null
    ) => Promise<void>;
}

/**
 * 挂起操作的回调，用于在未登录/会话验证中时暂存操作
 *
 * 这些回调仍由 AppTabsPage 持有，因为 pendingTask/pendingAction
 * 需要跨 coach 和 task 两个域进行协调。
 */
interface PendingCallbacks {
    setPendingTask: (task: Task | null) => void;
    setPendingAction: (action: 'add-task' | 'start-ai' | null) => void;
    setPendingActionSource: (source: 'session-validation' | 'auth-required' | null) => void;
    setShowAuthModal: (show: boolean) => void;
}

/**
 * useCoachController 的配置选项
 */
export interface UseCoachControllerOptions {
    /** 认证信息 */
    auth: CoachAuth;
    /** 任务管理 */
    appTasks: CoachAppTasks;
    /** Screen Time 解锁回调 */
    unlockScreenTimeIfLocked: (source: string) => void;
    /** 当前视图名称（如 'urgency'） */
    currentView: string;
    /** 切换视图的回调 */
    handleChangeView: (view: AppTab, replace?: boolean) => void;
    /** 挂起操作的回调（Auth gate 逻辑由 AppTabsPage 管理） */
    pendingCallbacks: PendingCallbacks;
    /** 任务完成后跳转 stats 页触发金币动画的回调 */
    onTaskCompleteForStats: () => void;
}

// ==========================================
// Hook 实现
// ==========================================

/**
 * AI 教练控制器 Hook
 *
 * 封装 AI 教练会话（Gemini / LiveKit）、庆祝流程、URL 自动启动等功能。
 * 从 AppTabsPage 提取，保持完整的业务逻辑不变。
 *
 * 职责：
 * 1. 管理 AI Coach 会话生命周期（启动、结束、倒计时到期）
 * 2. 管理 LiveKit 原生模式（连接、断开、倒计时）
 * 3. 管理庆祝/确认流程
 * 4. 处理 URL 参数自动启动任务
 * 5. 处理用户登出时的会话清理
 */
export function useCoachController(options: UseCoachControllerOptions) {
    const {
        auth,
        appTasks,
        unlockScreenTimeIfLocked,
        currentView,
        handleChangeView,
        pendingCallbacks,
        onTaskCompleteForStats,
    } = options;

    // ==========================================
    // 庆祝状态
    // ==========================================
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('confirm');
    const [completionTime, setCompletionTime] = useState(0);
    const [currentTaskDescription, setCurrentTaskDescription] = useState('');
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const [currentTaskType, setCurrentTaskType] = useState<'todo' | 'routine' | 'routine_instance' | null>(null);

    // ==========================================
    // 通话追踪
    // ==========================================
    const [currentCallRecordId, setCurrentCallRecordId] = useState<string | null>(null);

    // ==========================================
    // 视觉验证
    // ==========================================
    const { verifyWithFrames, isVerifying: isVerifyingTask } = useTaskVerification();
    const [sessionVerificationResult, setSessionVerificationResult] = useState<VerificationResult | null>(null);

    // ==========================================
    // 金币奖励（fire-and-forget）
    // ==========================================

    /**
     * 调用 award-coins Edge Function，将金币持久化到后端排行榜
     *
     * @param userId - 用户 ID
     * @param taskId - 任务 ID（可选）
     * @param sources - 金币来源列表
     */
    const awardCoins = useCallback(async (
        userId: string,
        taskId: string | null,
        sources: CoinRewardSource[],
    ) => {
        if (!supabase) return;
        try {
            const body: Record<string, unknown> = { user_id: userId, sources };
            if (taskId) body.task_id = taskId;

            const { data, error } = await supabase.functions.invoke('award-coins', { body });
            if (error) {
                console.error('[CoachController] award-coins 失败:', error);
            } else {
                const response = data as AwardCoinsResponse | null;
                devLog('✅ award-coins 成功:', {
                    taskId,
                    sources,
                    totalAwarded: response?.total_coins_awarded ?? null,
                    weeklyCoins: response?.user_weekly_coins ?? null,
                    breakdown: response?.breakdown ?? [],
                });
            }
        } catch (err) {
            console.error('[CoachController] award-coins 异常:', err);
        }
    }, []);

    // ==========================================
    // 语音提示状态
    // ==========================================
    const [hasSeenVoicePrompt, setHasSeenVoicePrompt] = useState(() => {
        try {
            return localStorage.getItem('hasSeenVoiceCameraPrompt') === 'true';
        } catch (error) {
            console.error('Failed to read voice prompt flag', error);
            return false;
        }
    });
    const [hasAutoStarted, setHasAutoStarted] = useState(false);

    /**
     * 记录用户已确认语音/摄像头权限提示，避免重复弹出。
     */
    const markVoicePromptSeen = useCallback(() => {
        setHasSeenVoicePrompt(true);
        try {
            localStorage.setItem('hasSeenVoiceCameraPrompt', 'true');
        } catch (error) {
            console.error('Failed to persist voice prompt flag', error);
        }
    }, []);

    // ==========================================
    // LiveKit 模式状态
    // ==========================================
    const [usingLiveKit, setUsingLiveKit] = useState(false);
    const [liveKitConnected, setLiveKitConnected] = useState(false);
    const [liveKitError, setLiveKitError] = useState<string | null>(null);
    const [liveKitTimeRemaining, setLiveKitTimeRemaining] = useState(300);
    const liveKitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ==========================================
    // AI Coach 会话初始化
    // ==========================================

    /** AI 教练会话（封装了 Gemini Live + 计时器 + 虚拟消息等） */
    const aiCoach = useAICoachSession({
        initialTime: 300, // 5 分钟
        onCountdownComplete: () => {
            // 倒计时结束时，显示任务完成确认页面
            setCompletionTime(300); // 倒计时结束意味着用了全部时间
            setCurrentTaskDescription(aiCoach.state.taskDescription);
            setCelebrationFlow('confirm');
            setShowCelebration(true);
        },
    });

    // ==========================================
    // 庆祝动画
    // ==========================================
    const celebrationAnimation = useCelebrationAnimation({
        enabled: showCelebration && celebrationFlow === 'success',
        remainingTime: 300 - completionTime, // 剩余时间用于计算奖励
    });

    // ==========================================
    // 副作用：用户登出时清理会话
    // ==========================================

    /**
     * P0 修复：用户登出时强制清理 AI 教练会话和媒体资源
     * 防止登出后音视频数据继续发送到 Gemini，造成资源泄漏
     */
    useEffect(() => {
        if (!auth.isLoggedIn && (aiCoach.isSessionActive || aiCoach.isConnecting)) {
            devLog('🔐 用户已登出，强制结束 AI 教练会话并释放媒体资源');
            aiCoach.endSession();
            if (aiCoach.cameraEnabled) {
                aiCoach.toggleCamera();
            }
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 登出时必须同步重置状态
            setCurrentTaskId(null);
            setCurrentTaskType(null);
            setShowCelebration(false);
        }
    }, [auth.isLoggedIn, aiCoach.isSessionActive, aiCoach.isConnecting, aiCoach.cameraEnabled, aiCoach]);

    // ==========================================
    // 副作用：LiveKit 事件监听
    // ==========================================
    useEffect(() => {
        if (!usingLiveKit) return;

        const cleanupConnected = onLiveKitEvent('connected', () => {
            devLog('🎙️ [CoachController] LiveKit connected');
            setLiveKitConnected(true);
            setLiveKitError(null);
        });

        const cleanupDisconnected = onLiveKitEvent('disconnected', () => {
            devLog('🎙️ [CoachController] LiveKit disconnected');
            setLiveKitConnected(false);
        });

        const cleanupError = onLiveKitEvent('error', (detail) => {
            console.error('🎙️ [CoachController] LiveKit error:', detail);
            const errorDetail = detail as { message?: string } | undefined;
            setLiveKitError(errorDetail?.message || 'LiveKit 连接失败');
            setLiveKitConnected(false);
        });

        return () => {
            cleanupConnected();
            cleanupDisconnected();
            cleanupError();
        };
    }, [usingLiveKit]);

    // ==========================================
    // 副作用：LiveKit 倒计时
    // ==========================================
    useEffect(() => {
        if (!usingLiveKit || !liveKitConnected) return;

        devLog('🎙️ [CoachController] LiveKit 倒计时开始');
        liveKitTimerRef.current = setInterval(() => {
            setLiveKitTimeRemaining((prev) => {
                if (prev <= 1) {
                    devLog('🎙️ [CoachController] LiveKit 倒计时结束');
                    if (liveKitTimerRef.current) {
                        clearInterval(liveKitTimerRef.current);
                        liveKitTimerRef.current = null;
                    }
                    endLiveKitRoom();
                    setCompletionTime(300);
                    setCelebrationFlow('confirm');
                    setShowCelebration(true);
                    setUsingLiveKit(false);
                    setLiveKitConnected(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (liveKitTimerRef.current) {
                clearInterval(liveKitTimerRef.current);
                liveKitTimerRef.current = null;
            }
        };
    }, [usingLiveKit, liveKitConnected]);

    // ==========================================
    // 核心回调：启动 AI Coach
    // ==========================================

    /**
     * 为某个任务启动 AI 教练会话
     * - 调用 useAICoachSession.startSession，复用与 DevTestPage / 示例中相同的 AI 流程
     * - 会在会话成功建立后，将该任务标记为已被呼叫（called=true），防止重复触发
     * - 如果任务是临时任务（ID 是时间戳），先保存到数据库获取真实 UUID
     */
    const startAICoachForTask = useCallback(async (task: Task) => {
        devLog('🤖 Starting AI Coach session for task:', task.text);

        const taskToUse = task;
        const taskId = task.id;

        // 检查任务 ID 是否是临时的（时间戳格式，全数字）
        const isTemporaryId = /^\d+$/.test(task.id) || task.id.startsWith('temp-');

        if (isTemporaryId && auth.userId) {
            const taskSignature = `${task.text}|${task.time}|${task.date || ''}`;

            if (appTasks.isTaskSignatureCreated(taskSignature)) {
                console.warn('⚠️ startAICoachForTask: 检测到重复任务创建请求，跳过数据库保存', {
                    taskSignature,
                    displayTime: task.displayTime,
                    tempId: task.id
                });
            } else {
                devLog('📝 检测到临时任务 ID，后台保存到数据库...', { taskSignature, displayTime: task.displayTime });
                appTasks.markTaskSignatureCreated(taskSignature);

                // fire-and-forget：后台保存，完成后更新 taskId
                (async () => {
                    try {
                        const { data: sessionData } = await supabase?.auth.getSession() ?? { data: null };
                        if (sessionData?.session?.user?.id) {
                            const savedTask = await createReminder(task, sessionData.session.user.id);
                            if (savedTask) {
                                devLog('✅ 任务已后台保存到数据库，真实 ID:', savedTask.id);
                                aiCoach.updateTaskId(savedTask.id);
                                setCurrentTaskId(savedTask.id);
                                appTasks.replaceTaskId(task.id, savedTask);
                            }
                        }
                    } catch (saveError) {
                        console.error('⚠️ 后台保存临时任务失败:', saveError);
                    }
                })();
            }
        }

        devLog('🎙️ LiveKit 检测:', {
            isLiveKitMode: isLiveKitMode(),
            voiceMode: localStorage.getItem('lumi_voice_mode'),
        });

        // 检测是否使用 LiveKit 模式
        if (isLiveKitMode()) {
            devLog('🎙️ 使用 LiveKit 原生模式');
            setUsingLiveKit(true);
            setLiveKitTimeRemaining(300);
            setLiveKitError(null);
            setCurrentTaskDescription(taskToUse.text);
            setCurrentTaskId(taskId);
            setCurrentTaskType(taskToUse.type || null);

            startLiveKitRoom();

            if (auth.userId && !isTemporaryId) {
                try {
                    await updateReminder(taskId, { called: true });
                    devLog('✅ Task called status persisted to database');
                } catch (updateError) {
                    console.error('⚠️ Failed to persist called status:', updateError);
                }
            }
            appTasks.patchTask(taskId, { called: true });
            return;
        }

        // WebView 模式：使用 Gemini Live
        try {
            const preferredLanguages = getPreferredLanguages();
            const started = await aiCoach.startSession(taskToUse.text, {
                userId: auth.userId ?? undefined,
                userName: auth.userName ?? undefined,
                preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
                taskId: taskId,
                callRecordId: currentCallRecordId ?? undefined,
            });
            if (!started) return;
            devLog('✅ AI Coach session started successfully');

            setCurrentTaskId(taskId);
            setCurrentTaskType(taskToUse.type || null);

            if (auth.userId && !isTemporaryId) {
                try {
                    await updateReminder(taskId, { called: true });
                    devLog('✅ Task called status persisted to database');
                } catch (updateError) {
                    console.error('⚠️ Failed to persist called status:', updateError);
                }
            }
            appTasks.patchTask(taskId, { called: true });
        } catch (error) {
            console.error('❌ Failed to start AI coach session:', error);
        }
    }, [aiCoach, appTasks, auth.userId, auth.userName, currentCallRecordId]);

    /**
     * 确保首次显示语音/摄像头提示；用户确认后才真正启动 AI 教练。
     *
     * @param task - 需要启动的任务
     */
    const ensureVoicePromptThenStart = useCallback((task: Task) => {
        devLog('📋 ensureVoicePromptThenStart called:', { task: task.text, hasSeenVoicePrompt });
        if (!hasSeenVoicePrompt) {
            markVoicePromptSeen();
        }
        devLog('✅ Starting AI Coach directly');
        void startAICoachForTask(task);
    }, [hasSeenVoicePrompt, markVoicePromptSeen, startAICoachForTask]);

    // ==========================================
    // 用户操作回调
    // ==========================================

    /**
     * 「Start」按钮点击：直接进入 AI 教练任务流程
     *
     * 如果会话未验证或未登录，通过 pendingCallbacks 挂起操作，
     * 等待验证/登录完成后由 AppTabsPage 恢复执行。
     *
     * @param task - 用户选择或输入的任务
     */
    const handleQuickStart = useCallback((task: Task) => {
        if (!auth.isSessionValidated) {
            devLog('⏳ 会话验证中，挂起 handleQuickStart 操作');
            pendingCallbacks.setPendingTask(task);
            pendingCallbacks.setPendingAction('start-ai');
            pendingCallbacks.setPendingActionSource('session-validation');
            return;
        }

        if (!auth.isLoggedIn) {
            pendingCallbacks.setPendingTask(task);
            pendingCallbacks.setPendingAction('start-ai');
            pendingCallbacks.setPendingActionSource('auth-required');
            pendingCallbacks.setShowAuthModal(true);
            return;
        }
        ensureVoicePromptThenStart(task);
    }, [auth.isSessionValidated, auth.isLoggedIn, ensureVoicePromptThenStart, pendingCallbacks]);

    /**
     * Stats 页面的 Start 按钮点击处理
     * 使用真实的习惯 ID 创建 Task 对象，然后启动 AI Coach
     *
     * @param habitId - 习惯的真实 UUID
     * @param habitTitle - 习惯名称
     */
    const handleStatsStartTask = useCallback((habitId: string, habitTitle: string) => {
        const task: Task = {
            id: habitId,
            text: habitTitle,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            displayTime: 'Now',
            date: getLocalDateString(),
            completed: false,
            type: 'routine',
            category: 'morning',
            called: false,
        };
        handleQuickStart(task);
    }, [handleQuickStart]);

    /**
     * 用户点击「END CALL」按钮：结束通话但不标记任务完成
     * - 立即停止音频播放
     * - 结束会话释放资源
     * - 后台保存记忆（不阻塞 UI）
     */
    const handleEndCall = useCallback(() => {
        aiCoach.stopAudioImmediately();

        const messagesSnapshot = [...aiCoach.state.messages];
        const taskDescriptionSnapshot = aiCoach.state.taskDescription;
        aiCoach.endSession();

        setCurrentTaskId(null);
        setCurrentTaskType(null);

        void saveSessionMemory({
            messages: messagesSnapshot,
            taskDescription: taskDescriptionSnapshot,
            userId: auth.userId,
            taskCompleted: false,
        });
    }, [aiCoach, auth.userId]);

    /**
     * 用户在任务执行视图中点击「I'M DOING IT!」
     * - 保存会话记忆到 Mem0
     * - 结束当前 AI 会话
     * - 跳转到 stats 页触发金币动画（替代旧庆祝页面）
     * - 标记任务为已完成
     */
    const handleEndAICoachSession = useCallback(() => {
        aiCoach.stopAudioImmediately();

        const usedTime = 300 - aiCoach.state.timeRemaining;
        const actualDurationMinutes = Math.round(usedTime / 60);

        const messagesSnapshot = [...aiCoach.state.messages];
        const taskDescriptionSnapshot = aiCoach.state.taskDescription;
        const taskIdToComplete = currentTaskId;
        const taskTypeToComplete = currentTaskType;
        const userId = auth.userId;

        // 关键：在 endSession 前抓取帧（因为 endSession 会关闭摄像头）
        const capturedFrames = aiCoach.getRecentFrames(5);
        devLog(`📸 抓取了 ${capturedFrames.length} 帧用于视觉验证`);

        aiCoach.endSession();

        unlockScreenTimeIfLocked('GeminiLive.primaryButton');

        setCurrentTaskId(null);
        setCurrentTaskType(null);

        void saveSessionMemory({
            messages: messagesSnapshot,
            taskDescription: taskDescriptionSnapshot,
            userId,
            taskCompleted: true,
            usedTime,
            actualDurationMinutes,
        });

        void appTasks.markTaskAsCompleted(taskIdToComplete, actualDurationMinutes, taskTypeToComplete);

        // fire-and-forget: 金币奖励（统一使用后端默认规则）
        if (userId) {
            void awardCoins(userId, taskIdToComplete, ['task_complete', 'session_complete']);
        }

        // fire-and-forget: 视觉验证（不阻塞庆祝流程）
        if (userId && taskIdToComplete && capturedFrames.length > 0) {
            void (async () => {
                try {
                    const result = await verifyWithFrames(
                        taskIdToComplete,
                        taskDescriptionSnapshot,
                        capturedFrames,
                        userId
                    );
                    if (result) {
                        setSessionVerificationResult(result);
                        devLog('✅ 视觉验证完成:', { verified: result.verified, confidence: result.confidence });
                    }
                } catch (err) {
                    console.error('[CoachController] 视觉验证 fire-and-forget 错误:', err);
                }
            })();
        }

        // 跳转到 stats 页并触发金币动画（统一使用 stats 的金币记录系统）
        onTaskCompleteForStats();
    }, [aiCoach, currentTaskId, currentTaskType, appTasks, auth.userId, unlockScreenTimeIfLocked, verifyWithFrames, awardCoins, onTaskCompleteForStats]);

    /**
     * 用户在确认页面点击「YES, I DID IT!」
     * - 标记任务为已完成
     * - 关闭确认页面，跳转到 stats 页触发金币动画
     */
    const handleConfirmTaskComplete = useCallback(async () => {
        const actualDurationMinutes = Math.round(completionTime / 60);

        await appTasks.markTaskAsCompleted(currentTaskId, actualDurationMinutes, currentTaskType);

        unlockScreenTimeIfLocked('Celebration.confirmYes');

        // fire-and-forget: 金币奖励（统一使用后端默认规则）
        if (auth.userId) {
            void awardCoins(auth.userId, currentTaskId, ['task_complete']);
        }

        // 关闭确认页面
        setShowCelebration(false);
        setCelebrationFlow('confirm');
        setCompletionTime(0);
        setCurrentTaskDescription('');
        setCurrentTaskId(null);
        setCurrentTaskType(null);

        // 跳转到 stats 页并触发金币动画（统一使用 stats 的金币记录系统）
        onTaskCompleteForStats();
    }, [currentTaskId, currentTaskType, completionTime, appTasks, auth.userId, unlockScreenTimeIfLocked, awardCoins, onTaskCompleteForStats]);

    /**
     * 用户确认未完成任务 - 显示鼓励页面（不标记任务完成）
     */
    const handleConfirmTaskIncomplete = useCallback(() => {
        setCelebrationFlow('failure');
    }, []);

    /**
     * 关闭庆祝页面，返回主界面
     */
    const handleCloseCelebration = useCallback(() => {
        setShowCelebration(false);
        setCelebrationFlow('confirm');
        setCompletionTime(0);
        setCurrentTaskDescription('');
        setCurrentTaskId(null);
        setCurrentTaskType(null);
        setSessionVerificationResult(null);
    }, []);

    // ==========================================
    // LiveKit 按钮回调
    // ==========================================

    /**
     * LiveKit 模式主按钮「I'M DOING IT!」：结束通话并跳转到 stats 触发金币动画
     */
    const handleLiveKitPrimaryClick = useCallback(() => {
        endLiveKitRoom();
        if (liveKitTimerRef.current) {
            clearInterval(liveKitTimerRef.current);
            liveKitTimerRef.current = null;
        }
        unlockScreenTimeIfLocked('LiveKit.primaryButton');

        // fire-and-forget: 金币奖励（统一使用后端默认规则）
        if (auth.userId) {
            void awardCoins(auth.userId, currentTaskId, ['task_complete', 'session_complete']);
        }

        setUsingLiveKit(false);
        setLiveKitConnected(false);

        // 跳转到 stats 页并触发金币动画（统一使用 stats 的金币记录系统）
        onTaskCompleteForStats();
    }, [unlockScreenTimeIfLocked, auth.userId, currentTaskId, awardCoins, onTaskCompleteForStats]);

    /**
     * LiveKit 模式副按钮「END CALL」：结束通话并返回
     */
    const handleLiveKitSecondaryClick = useCallback(() => {
        endLiveKitRoom();
        if (liveKitTimerRef.current) {
            clearInterval(liveKitTimerRef.current);
            liveKitTimerRef.current = null;
        }
        setUsingLiveKit(false);
        setLiveKitConnected(false);
        setLiveKitTimeRemaining(300);
    }, []);

    // ==========================================
    // 副作用：URL 参数自动启动任务
    // ==========================================

    /**
     * 检测 URL 参数以支持快速启动链接
     * 示例:
     * - /app/urgency?task=Get%20out%20of%20bed&autostart=true
     * - /app/urgency?task=Get%20out%20of%20bed&autostart=true&skipPrompt=true
     * - /app/urgency?task=Get%20out%20of%20bed&taskId=uuid&autostart=true
     */
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get('task');
        const taskIdParam = urlParams.get('taskId');
        const autostartParam = urlParams.get('autostart');
        const skipPromptParam = urlParams.get('skipPrompt');
        const callRecordIdParam = urlParams.get('callRecordId');

        // 如果有 callRecordId，记录 WebView 打开时间（表示用户点击了接听）
        if (callRecordIdParam && !currentCallRecordId) {
            devLog('📞 检测到 callRecordId，记录 WebView 打开时间:', callRecordIdParam);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 参数解析后必须同步记录 callRecordId
            setCurrentCallRecordId(callRecordIdParam);

            supabase?.functions.invoke('manage-call-records', {
                body: {
                    action: 'mark_webview_opened',
                    call_record_id: callRecordIdParam,
                },
            }).then(({ error }) => {
                if (error) {
                    console.error('⚠️ 记录 webview_opened_at 失败:', error);
                } else {
                    devLog('✅ webview_opened_at 已记录');
                }
            });
        }

        const shouldAutoStart = autostartParam === 'true' && taskParam && !hasAutoStarted;

        if (!shouldAutoStart) return;

        // 关键保护：在原生 App 内，如果 autostart 没有 taskId，直接阻止启动
        if (isNativeApp() && !taskIdParam) {
            console.warn('⚠️ Autostart blocked in native app: missing taskId (防止重复任务)');
            return;
        }

        // 如果带 taskId，必须等待会话验证完成且已登录
        if (taskIdParam && (!auth.isSessionValidated || !auth.isLoggedIn)) {
            return;
        }

        // 如果带 taskId，等待任务列表加载完成
        if (taskIdParam && !appTasks.tasksLoaded) {
            return;
        }

        const startFromUrl = async () => {
            setHasAutoStarted(true);

            devLog('✅ Auto-starting task:', taskParam, 'taskId:', taskIdParam);

            let taskToStart: Task | undefined;

            if (taskIdParam) {
                if (!auth.userId) {
                    console.warn('⚠️ Autostart blocked: missing auth user for taskId', taskIdParam);
                    return;
                }
                taskToStart = appTasks.tasks.find(t => t.id === taskIdParam);
                if (taskToStart) {
                    devLog('📋 Found existing task by ID:', taskIdParam);
                } else if (auth.userId) {
                    devLog('🔎 Task not found in list, fetching by ID:', taskIdParam);
                    const fetchedTask = await fetchReminderById(taskIdParam, auth.userId);
                    if (fetchedTask) {
                        taskToStart = fetchedTask;
                        appTasks.upsertTask(fetchedTask);
                        devLog('✅ Found task from database:', taskIdParam);
                    } else {
                        console.warn('⚠️ Task not found by ID, aborting autostart to avoid duplicate task');
                        return;
                    }
                }
            }

            if (!taskToStart) {
                taskToStart = {
                    id: `temp-${Date.now()}`,
                    text: taskParam,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    displayTime: 'Now',
                    date: getLocalDateString(),
                    completed: false,
                    type: 'todo',
                    category: 'morning',
                    called: false,
                };
            }

            const finalTask = taskToStart;

            if (skipPromptParam === 'true' && !hasSeenVoicePrompt) {
                devLog('⏭️ Skipping voice prompt as requested');
                markVoicePromptSeen();
            }

            if (currentView !== 'urgency') {
                handleChangeView('urgency', true);
                setTimeout(() => {
                    devLog('🚀 Launching AI Coach after navigation');
                    ensureVoicePromptThenStart(finalTask);
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 500);
            } else {
                setTimeout(() => {
                    devLog('🚀 Launching AI Coach directly');
                    ensureVoicePromptThenStart(finalTask);
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 100);
            }
        };

        void startFromUrl();
    }, [auth.userId, auth.isLoggedIn, auth.isSessionValidated, currentCallRecordId, currentView, handleChangeView, ensureVoicePromptThenStart, hasAutoStarted, hasSeenVoicePrompt, markVoicePromptSeen, appTasks]);

    // ==========================================
    // 计算派生状态
    // ==========================================

    /** 会话遮罩是否可见（AI 会话活跃、正在连接、或 LiveKit 模式中） */
    const isSessionOverlayVisible = aiCoach.isSessionActive || aiCoach.isConnecting || usingLiveKit;

    // ==========================================
    // 返回值
    // ==========================================
    return {
        /** 底层 useAICoachSession 实例，供 UI 层直接使用 */
        aiCoach,

        // 会话遮罩可见性
        isSessionOverlayVisible,

        // LiveKit 状态
        usingLiveKit,
        liveKitConnected,
        liveKitError,
        liveKitTimeRemaining,

        // 庆祝状态
        showCelebration,
        celebrationFlow,
        setCelebrationFlow,
        completionTime,
        currentTaskDescription,
        celebrationAnimation,

        // 语音提示（供 AppTabsPage 的 VoicePrompt 组件使用）
        hasSeenVoicePrompt,
        markVoicePromptSeen,

        // 启动 AI Coach 的底层方法（供 VoicePrompt confirm 回调使用）
        startAICoachForTask,
        ensureVoicePromptThenStart,

        // 用户操作回调
        handleQuickStart,
        handleStatsStartTask,
        handleEndCall,
        handleEndAICoachSession,
        handleConfirmTaskComplete,
        handleConfirmTaskIncomplete,
        handleCloseCelebration,

        // LiveKit 按钮回调
        handleLiveKitPrimaryClick,
        handleLiveKitSecondaryClick,

        // 视觉验证状态
        isVerifyingTask,
        sessionVerificationResult,
    };
}
