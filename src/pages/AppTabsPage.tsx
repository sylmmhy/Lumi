import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_TABS, DEFAULT_APP_PATH, DEFAULT_APP_TAB } from '../constants/routes';
import type { AppTab } from '../constants/routes';
import type { Task } from '../remindMe/types';
import { useAuth } from '../hooks/useAuth';
import { useAICoachSession } from '../hooks/useAICoachSession';
import { useCelebrationAnimation } from '../hooks/useCelebrationAnimation';
import { TaskWorkingView } from '../components/task/TaskWorkingView';
import { CelebrationView, type CelebrationFlow } from '../components/celebration/CelebrationView';
import { AuthModal } from '../components/modals/AuthModal';
import { VoicePermissionModal } from '../components/modals/VoicePermissionModal';
import { TestVersionModal } from '../components/modals/TestVersionModal';
import {
    fetchReminders,
    createReminder,
    fetchReminderById,
    toggleReminderCompletion,
    deleteReminder,
    updateReminder,
    generateTodayRoutineInstances,
    fetchRecurringReminders,
    taskToNativeReminder,
} from '../remindMe/services/reminderService';
import { isNativeApp, syncAllTasksToNative, registerNativeRefreshTasks } from '../utils/nativeTaskEvents';
import { useScreenTime, type ScreenTimeActionEvent } from '../hooks/useScreenTime';
import { ConsequencePledgeConfirm } from '../components/ConsequencePledgeConfirm';
import { markRoutineComplete, unmarkRoutineComplete } from '../remindMe/services/routineCompletionService';
import { supabase, getSupabaseClient } from '../lib/supabase';
import { getPreferredLanguages } from '../lib/language';
import {
    isLiveKitMode,
    startLiveKitRoom,
    endLiveKitRoom,
    onLiveKitEvent,
} from '../lib/liveKitSettings';

// Extracted Components
import { HomeView } from '../components/app-tabs/HomeView';
import { LeaderboardView } from '../components/app-tabs/LeaderboardView';
import { UrgencyView } from '../components/app-tabs/UrgencyView';
import { ProfileView } from '../components/app-tabs/ProfileView';
import { StatsView } from '../components/app-tabs/StatsView';
import { BottomNavBar } from '../components/app-tabs/BottomNavBar';

// Product Tour
import { useProductTour } from '../hooks/useProductTour';
import { TourOverlay } from '../components/tour/TourOverlay';

type ViewState = AppTab;

import { devLog } from '../utils/devLog';
import { getLocalDateString } from '../utils/timeUtils';

const isAppTab = (value: string | undefined): value is AppTab => APP_TABS.includes(value as AppTab);

const SCREEN_TIME_START_TASK_INTENT_KEY = 'lumi_pending_start_task_intent';
const SCREEN_TIME_INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * 应用主入口页面，负责根据 URL tab 渲染对应视图，并复用 AI 教练、任务数据等共享逻辑。
 *
 * @returns {JSX.Element} - 主应用的 Tab 容器视图，包含任务列表、统计、紧急启动等子页面
 */
export function AppTabsPage() {
    const navigate = useNavigate();
    const { tab } = useParams<{ tab?: string }>();
    const auth = useAuth();

    // Product Tour（新用户引导）
    const productTour = useProductTour();

    // 🔍 调试日志：追踪 tour 状态变化
    useEffect(() => {
        devLog('🎯 [AppTabsPage] Tour 状态变化:', {
            isActive: productTour.isActive,
            currentStep: productTour.currentStep?.step,
            stepNumber: productTour.stepNumber,
            totalSteps: productTour.totalSteps,
            url: window.location.href,
        });
    }, [productTour.isActive, productTour.currentStep, productTour.stepNumber, productTour.totalSteps]);

    // 【已移除】onboarding 跳转逻辑
    // 网页端不再判断 hasCompletedHabitOnboarding，由端侧决定加载哪个 URL
    // 纯浏览器访问时也不强制跳转，用户可自由访问任何页面

    // Derive view directly from URL to avoid double-render (rework)
    // If tab is invalid, it defaults to DEFAULT_APP_TAB (and effect below will redirect)
    const currentView: ViewState = isAppTab(tab) ? tab : DEFAULT_APP_TAB;

    // Determine checkout success once to avoid setState inside effects
    const checkoutSuccess = useMemo(() => {
        const query = new URLSearchParams(window.location.search);
        return query.get('success') !== null;
    }, []);

    const [isPremium] = useState(() => checkoutSuccess);
    const [showConfetti, setShowConfetti] = useState(() => checkoutSuccess);

    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoaded, setTasksLoaded] = useState(false);
    // 用于触发 StatsView 重新加载数据
    const [statsRefreshTrigger, setStatsRefreshTrigger] = useState(0);
    const [showAuthModal, setShowAuthModal] = useState(false);
    /**
     * Screen Time 自动解锁相关状态
     *
     * 原理：
     * - Screen Time 的锁定/解锁是 iOS 本地状态（ManagedSettings）。
     * - 仅仅把 tasks 标记为 completed（写 Supabase）不会影响 iOS 锁定状态。
     * - 因此当用户“完成任务”（无论是 AI 会话内点击完成，还是手动勾选完成）时，需要通过 WebView bridge 显式调用 `unlockApps`。
     */
    const isScreenTimeLockedRef = useRef(false);
    const shouldUnlockScreenTimeAfterTaskCompleteRef = useRef(false);
    const unlockScreenTimeIfLocked = useCallback((source: string) => {
        // 只在 iOS Native WebView 环境生效
        if (!window.webkit?.messageHandlers?.screenTime) return;

        const shouldUnlock = isScreenTimeLockedRef.current || shouldUnlockScreenTimeAfterTaskCompleteRef.current;
        if (!shouldUnlock) return;

        // 防止重复触发（回调延迟/多次点击等）
        isScreenTimeLockedRef.current = false;
        shouldUnlockScreenTimeAfterTaskCompleteRef.current = false;

        devLog(`🔓 [ScreenTime] 任务完成触发解锁 (${source})`);
        try {
            window.webkit.messageHandlers.screenTime.postMessage({ action: 'unlockApps' });
        } catch (error) {
            console.error('[ScreenTime] unlockApps 发送失败:', error);
        }
    }, []);
    const [pendingTask, setPendingTask] = useState<Task | null>(null);
    /**
     * 区分 pendingTask 的来源：
     * - 'add-task': 用户想创建/保存任务（来自 addTask）
     * - 'start-ai': 用户想启动 AI Coach（来自 handleQuickStart）
     */
    const [pendingAction, setPendingAction] = useState<'add-task' | 'start-ai' | null>(null);
    /**
     * 记录挂起动作的来源，避免会话验证完成后误触发非验证导致的挂起。
     * - 'session-validation': 会话未验证完成时的临时挂起
     * - 'auth-required': 未登录或会话缺失导致的挂起
     */
    const [pendingActionSource, setPendingActionSource] = useState<'session-validation' | 'auth-required' | null>(null);
    const urgencyStartRef = useRef<(() => void) | null>(null);
    // 防止 addTask 重复执行的标志：记录正在处理的任务签名（text + time + date）
    const addTaskInProgressRef = useRef<string | null>(null);
    // 防止 startAICoachForTask 重复创建任务的标志：记录已创建的任务签名（避免临时 ID 任务被重复保存）
    const aiCoachTaskCreatedRef = useRef<Set<string>>(new Set());
    const [showVoicePrompt, setShowVoicePrompt] = useState(false);
    const [pendingVoiceTask, setPendingVoiceTask] = useState<Task | null>(null);
    const [showTestVersionModal, setShowTestVersionModal] = useState(false);

    // Screen Time 后果确认相关状态
    const [showPledgeConfirm, setShowPledgeConfirm] = useState(false);
    const [pledgeConfirmData, setPledgeConfirmData] = useState<{
        taskName: string;
        consequence: string;
        pledge: string;
    } | null>(null);

    // 庆祝流程相关状态
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('confirm');
    const [completionTime, setCompletionTime] = useState(0);
    const [currentTaskDescription, setCurrentTaskDescription] = useState('');
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null); // 当前正在进行的任务 ID

    // 通话追踪：来电记录 ID（用于追踪 WebView 打开和麦克风连接状态）
    const [currentCallRecordId, setCurrentCallRecordId] = useState<string | null>(null);
    const [currentTaskType, setCurrentTaskType] = useState<'todo' | 'routine' | 'routine_instance' | null>(null); // 当前任务类型（用于完成时判断是否需要更新 routine_completions）

    const [hasSeenVoicePrompt, setHasSeenVoicePrompt] = useState(() => {
        try {
            return localStorage.getItem('hasSeenVoiceCameraPrompt') === 'true';
        } catch (error) {
            console.error('Failed to read voice prompt flag', error);
            return false;
        }
    });
    const [hasAutoStarted, setHasAutoStarted] = useState(false);

    // LiveKit 模式状态
    const [usingLiveKit, setUsingLiveKit] = useState(false);
    const [liveKitConnected, setLiveKitConnected] = useState(false);
    const [liveKitError, setLiveKitError] = useState<string | null>(null);
    const [liveKitTimeRemaining, setLiveKitTimeRemaining] = useState(300);
    const liveKitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleChangeView = useCallback((view: ViewState, replace = false) => {
        // Just navigate, no local state update needed
        navigate(`/app/${view}`, { replace });
    }, [navigate]);

    /**
     * 记录 UrgencyView 内「Help me start」的触发方法，便于底部 Start 按钮在当前页直接触发同样逻辑。
     *
     * @param {(() => void) | null} handler - 来自 UrgencyView 的启动函数，组件卸载时传入 null 以清理引用
     */
    const registerUrgencyStart = useCallback((handler: (() => void) | null) => {
        urgencyStartRef.current = handler;
    }, []);

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

    // 加载任务的函数（可用于初始加载和下拉刷新）
    const loadTasks = useCallback(async () => {
        setTasksLoaded(false);
        if (!auth.userId) {
            setTasksLoaded(true);
            return;
        }

        try {
            // 并行执行所有查询，而不是串行等待
            // 这样三个网络请求同时发出，总耗时 = max(三个请求) 而不是 sum(三个请求)
            // 注意：fetchReminders 默认使用本地日期，避免 UTC 时区问题
            const [, todayTasks, routineTemplates] = await Promise.all([
                // 1. 生成今天的 routine 实例（幂等操作）
                generateTodayRoutineInstances(auth.userId),
                // 2. 加载今天的任务（todo + routine_instance），使用本地日期
                fetchReminders(auth.userId),
                // 3. 加载 routine 模板（用于 Routine tab 显示和管理）
                fetchRecurringReminders(auth.userId),
            ]);

            // 将 routine_instance 的状态同步到对应的 routine 模板
            // 这样 UI 上的 routine 模板会正确显示今天的状态

            // 🔧 Bug 修复 (2026-02-02)：将 routine_instance 的完成状态同步到 routine 模板
            // 之前 routine 模板的 status 会被错误地永久设为 completed，导致第二天仍显示已完成
            // 修复：routine 模板的数据库 status 始终为 pending，显示状态由今日 routine_instance 决定
            const completedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.completed && t.parentRoutineId
            );

            // snooze 状态：只有未完成的 snoozed 实例才显示标签
            const snoozedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.isSnoozed && t.parentRoutineId && !t.completed
            );

            // skip 状态：只有未完成且 isSkip=true 的今日实例才显示标签
            const skippedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.isSkip && t.parentRoutineId && !t.completed
            );

            const routineTemplatesWithStatus = routineTemplates.map(routine => {
                let updatedRoutine = routine;

                // 🔧 检查今日 routine_instance 是否已完成，同步到 routine 模板的显示状态
                const hasCompletedInstance = completedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasCompletedInstance) {
                    // 今日已完成：显示为已完成（注意：这只是 UI 显示，数据库中 routine 模板的 status 仍为 pending）
                    updatedRoutine = { ...updatedRoutine, completed: true };
                } else {
                    // 今日未完成：强制显示为未完成（覆盖可能残留的错误 completed 状态）
                    updatedRoutine = { ...updatedRoutine, completed: false };
                }

                // 检查这个 routine 是否有被 snooze 的今日实例
                const hasSnoozedInstance = snoozedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasSnoozedInstance) {
                    devLog('🏷️ [loadTasks] 同步 snooze 状态到 routine:', routine.text);
                    updatedRoutine = { ...updatedRoutine, isSnoozed: true };
                }

                // 检查这个 routine 是否有被 skip 的今日实例
                const hasSkippedInstance = skippedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasSkippedInstance) {
                    devLog('🏷️ [loadTasks] 同步 skip 状态到 routine:', routine.text);
                    updatedRoutine = { ...updatedRoutine, isSkip: true };
                }

                return updatedRoutine;
            });

            // 合并所有任务（routine_instance 不会显示在 UI 中，但 routine 模板会带有 snooze/skip 标签）
            const allTasks = [...todayTasks, ...routineTemplatesWithStatus];

            setTasks(allTasks);

            // P0 修复：同步所有任务到原生端（解决 App 重启后丢失提醒的问题）
            if (isNativeApp()) {
                const tasksForNative = allTasks
                    .filter(t => t.date && t.time && !t.completed)
                    .map(t => taskToNativeReminder(t, auth.userId!));
                syncAllTasksToNative(tasksForNative);
            }
        } catch (error) {
            console.error('Failed to load reminders:', error);
        } finally {
            setTasksLoaded(true);
        }
    }, [auth.userId]);

    // Load tasks from Supabase when user is logged in
    useEffect(() => {
        void loadTasks();
    }, [loadTasks]);

    // 注册原生端刷新任务的回调（iOS Live Activity "later" 按钮触发）
    useEffect(() => {
        const unregister = registerNativeRefreshTasks(() => {
            devLog('🔄 原生端请求刷新任务列表');
            void loadTasks();
        });
        return unregister;
    }, [loadTasks]);

    // 下拉刷新处理函数
    const handleRefresh = useCallback(async () => {
        devLog('🔄 Pull to refresh triggered');
        await loadTasks();
        // 同时刷新统计数据
        setStatsRefreshTrigger(prev => prev + 1);
    }, [loadTasks]);

    useEffect(() => {
        // Only handle redirection for invalid tabs
        if (!isAppTab(tab)) {
            navigate(DEFAULT_APP_PATH, { replace: true });
        }
    }, [navigate, tab]);

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

    // P0 修复：用户登出时强制清理 AI 教练会话和媒体资源
    // 防止登出后音视频数据继续发送到 Gemini，造成资源泄漏
    useEffect(() => {
        if (!auth.isLoggedIn && (aiCoach.isSessionActive || aiCoach.isConnecting)) {
            devLog('🔐 用户已登出，强制结束 AI 教练会话并释放媒体资源');
            // 结束 AI 教练会话（内部会断开 Gemini 连接、释放麦克风/摄像头）
            aiCoach.endSession();
            // 确保摄像头关闭
            if (aiCoach.cameraEnabled) {
                aiCoach.toggleCamera();
            }
            // 重置相关状态
            setCurrentTaskId(null);
            setCurrentTaskType(null);
            setShowCelebration(false);
        }
    }, [auth.isLoggedIn, aiCoach.isSessionActive, aiCoach.isConnecting, aiCoach.cameraEnabled, aiCoach]);

    // 庆祝动画控制
    const celebrationAnimation = useCelebrationAnimation({
        enabled: showCelebration && celebrationFlow === 'success',
        remainingTime: 300 - completionTime, // 剩余时间用于计算奖励
    });

    // LiveKit 事件监听
    useEffect(() => {
        if (!usingLiveKit) return;

        const cleanupConnected = onLiveKitEvent('connected', () => {
            devLog('🎙️ [AppTabsPage] LiveKit connected');
            setLiveKitConnected(true);
            setLiveKitError(null);
        });

        const cleanupDisconnected = onLiveKitEvent('disconnected', () => {
            devLog('🎙️ [AppTabsPage] LiveKit disconnected');
            setLiveKitConnected(false);
        });

        const cleanupError = onLiveKitEvent('error', (detail) => {
            console.error('🎙️ [AppTabsPage] LiveKit error:', detail);
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

    // LiveKit 倒计时（当 usingLiveKit 为 true 且 LiveKit 连接成功时开始倒计时）
    useEffect(() => {
        if (!usingLiveKit || !liveKitConnected) return;

        devLog('🎙️ [AppTabsPage] LiveKit 倒计时开始');
        liveKitTimerRef.current = setInterval(() => {
            setLiveKitTimeRemaining((prev) => {
                if (prev <= 1) {
                    // 倒计时结束
                    devLog('🎙️ [AppTabsPage] LiveKit 倒计时结束');
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

    // Handle Stripe success return without setting state inside the effect body
    useEffect(() => {
        if (!checkoutSuccess) return;
        handleChangeView('profile', true);
        // Clean URL
        window.history.replaceState({}, document.title, "/");
        const timer = window.setTimeout(() => setShowConfetti(false), 5000);
        return () => window.clearTimeout(timer);
    }, [checkoutSuccess, handleChangeView]);

    /**
     * 创建任务并在必要时触发登录/挂起流程。
     *
     * @param {Task} newTask - 待创建的任务对象
     */
    const addTask = useCallback(async (newTask: Task) => {
        // 生成任务签名用于防重入检查（text + time + date 组合）
        const taskSignature = `${newTask.text}|${newTask.time}|${newTask.date || ''}`;

        // 防重入检查：如果正在处理相同签名的任务，跳过
        if (addTaskInProgressRef.current === taskSignature) {
            console.warn('⚠️ addTask: 检测到重复调用，跳过', { taskSignature, displayTime: newTask.displayTime });
            return;
        }

        devLog('📝 addTask: 开始处理', { taskSignature, displayTime: newTask.displayTime, id: newTask.id });

        // 如果会话还未验证完成，先挂起操作，等待验证完成后再处理
        if (!auth.isSessionValidated) {
            devLog('⏳ 会话验证中，挂起 addTask 操作');
            setPendingTask(newTask);
            setPendingAction('add-task');
            setPendingActionSource('session-validation');
            return;
        }

        if (!auth.userId) {
            console.error('User not logged in');
            setPendingTask(newTask);
            setPendingAction('add-task');
            setPendingActionSource('auth-required');
            setShowAuthModal(true);
            return;
        }
        if (!supabase) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (sessionError || !sessionData?.user) {
            console.warn('Supabase 会话缺失，无法创建任务，将提示登录', sessionError);
            setPendingTask(newTask);
            setPendingAction('add-task');
            setPendingActionSource('auth-required');
            setShowAuthModal(true);
            return;
        }

        // 设置防重入标志
        addTaskInProgressRef.current = taskSignature;

        try {
            // Create reminder in Supabase，使用会话 userId 确保满足 FK 约束
            const created = await createReminder(newTask, sessionData.user.id);
            if (created) {
                // 记录已创建的任务签名，防止 startAICoachForTask 重复创建
                aiCoachTaskCreatedRef.current.add(taskSignature);

                setTasks(prev => [...prev, created]);

                // 如果是 routine 任务，立即为今天生成实例，并触发 StatsView 刷新
                if (created.type === 'routine') {
                    const newInstances = await generateTodayRoutineInstances(sessionData.user.id);
                    if (newInstances.length > 0) {
                        setTasks(prev => [...prev, ...newInstances]);
                    }
                    // 🐛 Fix: 创建新的 routine 任务后，触发 StatsView 重新加载数据
                    // 之前缺少这行代码，导致用户在 HomeView 创建习惯后切换到 StatsView 时看不到新习惯
                    setStatsRefreshTrigger(prev => prev + 1);
                }

                // 第一次设置任务后显示测试版本弹窗（仅在网页版显示，App WebView 中不显示）
                try {
                    if (!isNativeApp() && !localStorage.getItem('hasSeenTestVersionModal')) {
                        setShowTestVersionModal(true);
                        localStorage.setItem('hasSeenTestVersionModal', 'true');
                    }
                } catch (e) {
                    console.error('Failed to check/set test version modal flag', e);
                }
                devLog('✅ addTask: 任务创建成功', { id: created.id, displayTime: created.displayTime });
            }
        } catch (error) {
            console.error('Failed to create reminder:', error);
        } finally {
            // 清除防重入标志
            addTaskInProgressRef.current = null;
        }
    }, [auth.isSessionValidated, auth.userId]);

    /**
     * 切换任务的完成状态
     *
     * 同步逻辑：
     * - routine_instance 完成时：只更新 routine_instance 的数据库状态，UI 同步更新 routine 模板的显示
     * - routine 模板完成时：只更新今日 routine_instance 的数据库状态，UI 同步更新 routine 模板的显示
     *
     * 🔧 Bug 修复 (2026-02-02)：
     * 之前的逻辑会把 routine 模板的数据库 status 也改为 completed，导致：
     * - 第二天新生成的 routine_instance 是 pending 状态（后台会 call）
     * - 但 routine 模板仍然是 completed 状态（前端显示为已完成）
     * 修复：只更新 routine_instance 的数据库状态，routine 模板的 status 始终保持 pending
     */
    const toggleComplete = async (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task || !auth.userId) return;

        const newCompletedStatus = !task.completed;
        const today = getLocalDateString();

        // 需要更新数据库的任务 ID（只有 routine_instance）
        let dbIdToUpdate: string | null = null;
        // 需要更新 UI 显示的任务 ID 列表（routine_instance + routine 模板）
        const uiIdsToUpdate: string[] = [id];
        let routineIdForCompletion: string | null = null;

        if (task.type === 'routine_instance' && task.parentRoutineId) {
            // 完成 routine_instance 时：
            // - 数据库：只更新 routine_instance
            // - UI：同时更新 routine_instance 和 routine 模板的显示
            dbIdToUpdate = id;
            routineIdForCompletion = task.parentRoutineId;
            const routineTemplate = tasks.find(t => t.id === task.parentRoutineId);
            if (routineTemplate) {
                uiIdsToUpdate.push(routineTemplate.id);
            }
        } else if (task.type === 'routine') {
            // 完成 routine 模板时：
            // - 数据库：只更新今日的 routine_instance（不更新 routine 模板！）
            // - UI：同时更新 routine 模板和 routine_instance 的显示
            routineIdForCompletion = id;
            const todayInstance = tasks.find(t =>
                t.type === 'routine_instance' &&
                t.parentRoutineId === id &&
                t.date === today
            );
            if (todayInstance) {
                dbIdToUpdate = todayInstance.id;
                uiIdsToUpdate.push(todayInstance.id);
            } else {
                // 如果今天还没有 routine_instance，则不允许完成
                console.warn('No routine_instance found for today, cannot toggle completion');
                return;
            }
        } else {
            // todo 类型：直接更新
            dbIdToUpdate = id;
        }

        // Optimistically update UI（同步更新 routine_instance 和 routine 模板的显示）
        setTasks(prev => prev.map(t =>
            uiIdsToUpdate.includes(t.id) ? { ...t, completed: newCompletedStatus } : t
        ));

        // ✅ 用户手动标记“完成任务”时，如果当前处于 Screen Time 锁定状态，应立即解锁
        // 注意：解锁不依赖数据库成功与否，避免离线/网络波动导致“已完成但仍被锁”
        if (newCompletedStatus) {
            unlockScreenTimeIfLocked('toggleComplete');
        }

        try {
            // 只更新数据库中的 routine_instance（或 todo），不更新 routine 模板
            if (dbIdToUpdate) {
                await toggleReminderCompletion(dbIdToUpdate, newCompletedStatus);
            }

            // 记录 routine_completions（用于热力图）
            if (routineIdForCompletion) {
                if (newCompletedStatus) {
                    await markRoutineComplete(auth.userId, routineIdForCompletion, today);
                } else {
                    await unmarkRoutineComplete(auth.userId, routineIdForCompletion, today);
                }
            }

            // 触发 StatsView 刷新
            setStatsRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error('Failed to toggle reminder completion:', error);
            // Revert optimistic update on error
            setTasks(prev => prev.map(t =>
                uiIdsToUpdate.includes(t.id) ? { ...t, completed: !newCompletedStatus } : t
            ));
        }
    };

    /**
     * 当 StatsView 中勾选任务时，同步更新本地 tasks 状态
     * 这样切换到 HomeView 时能看到最新状态
     */
    const handleStatsToggle = useCallback((id: string, completed: boolean) => {
        setTasks(prev => prev.map(t =>
            t.id === id ? { ...t, completed } : t
        ));
        if (completed) {
            unlockScreenTimeIfLocked('StatsView.toggle');
        }
    }, [unlockScreenTimeIfLocked]);

    const handleDeleteTask = async (id: string) => {
        // if (!window.confirm('Are you sure you want to delete this task?')) return;

        // Optimistically remove from UI
        const previousTasks = [...tasks];
        setTasks(prev => prev.filter(t => t.id !== id));

        try {
            const success = await deleteReminder(id);
            if (!success) {
                throw new Error('Failed to delete');
            }
        } catch (error) {
            console.error('Failed to delete task:', error);
            // Revert on error
            setTasks(previousTasks);
            alert('Failed to delete task');
        }
    };

    const handleUpdateTask = async (updatedTask: Task) => {
        // Optimistically update UI
        const previousTasks = [...tasks];
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));

        try {
            const result = await updateReminder(updatedTask.id, {
                text: updatedTask.text,
                time: updatedTask.time,
                displayTime: updatedTask.displayTime,
                date: updatedTask.date,
                category: updatedTask.category,
                called: updatedTask.called, // 支持 Skip for Day 功能
                isSkip: updatedTask.isSkip, // 行为统计 + 前端标签显示
            });
            if (!result) {
                throw new Error('Failed to update');
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            // Revert on error
            setTasks(previousTasks);
            alert('Failed to update task');
        }
    };


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
        // UUID 格式包含连字符，而时间戳是纯数字
        const isTemporaryId = /^\d+$/.test(task.id) || task.id.startsWith('temp-');

        if (isTemporaryId && auth.userId) {
            // 生成任务签名用于防重复创建检查
            const taskSignature = `${task.text}|${task.time}|${task.date || ''}`;

            // 检查是否已经为相同签名的任务创建过记录
            if (aiCoachTaskCreatedRef.current.has(taskSignature)) {
                console.warn('⚠️ startAICoachForTask: 检测到重复任务创建请求，跳过数据库保存', {
                    taskSignature,
                    displayTime: task.displayTime,
                    tempId: task.id
                });
                // 不创建新记录，但继续启动 AI Coach（使用临时 ID）
            } else {
                // 🚀 性能优化：不阻塞 AI Coach 启动，后台保存任务
                // taskId 只在会话结束时用于保存 actualDurationMinutes，
                // 后台保存通常在 1-2 秒内完成，远早于会话结束
                devLog('📝 检测到临时任务 ID，后台保存到数据库...', { taskSignature, displayTime: task.displayTime });
                aiCoachTaskCreatedRef.current.add(taskSignature);

                // fire-and-forget：后台保存，完成后更新 taskId
                (async () => {
                    try {
                        const { data: sessionData } = await supabase?.auth.getSession() ?? { data: null };
                        if (sessionData?.session?.user?.id) {
                            const savedTask = await createReminder(task, sessionData.session.user.id);
                            if (savedTask) {
                                devLog('✅ 任务已后台保存到数据库，真实 ID:', savedTask.id);
                                // 更新 AI Coach session 内部的 taskId ref，确保会话结束时用真实 ID 保存 duration
                                aiCoach.updateTaskId(savedTask.id);
                                setCurrentTaskId(savedTask.id);
                                // 更新前端任务列表中的任务（用真实 ID 替换临时 ID）
                                setTasks(prev => {
                                    const existingIndex = prev.findIndex(t => t.id === task.id);
                                    if (existingIndex >= 0) {
                                        const newTasks = [...prev];
                                        newTasks[existingIndex] = savedTask;
                                        return newTasks;
                                    }
                                    return [...prev, savedTask];
                                });
                            }
                        }
                    } catch (saveError) {
                        console.error('⚠️ 后台保存临时任务失败:', saveError);
                    }
                })();
            }
        }

        // 调试日志：检测 LiveKit 状态
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

            // 调用 iOS 原生 LiveKit
            startLiveKitRoom();

            // 标记任务已被呼叫
            if (auth.userId && !isTemporaryId) {
                try {
                    await updateReminder(taskId, { called: true });
                    devLog('✅ Task called status persisted to database');
                } catch (updateError) {
                    console.error('⚠️ Failed to persist called status:', updateError);
                }
            }
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, called: true } : t));
            return;
        }

        // WebView 模式：使用 Gemini Live
        try {
            const preferredLanguages = getPreferredLanguages();
            const started = await aiCoach.startSession(taskToUse.text, {
                userId: auth.userId ?? undefined,  // 传入 userId 用于 Mem0 记忆保存
                userName: auth.userName ?? undefined,
                preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
                taskId: taskId,  // 传入真实的 taskId 用于保存 actual_duration_minutes
                callRecordId: currentCallRecordId ?? undefined,  // 🆕 传入 callRecordId 用于追踪麦克风连接
            });
            if (!started) return;
            devLog('✅ AI Coach session started successfully');

            // 保存当前任务 ID 和类型，用于完成时更新数据库
            setCurrentTaskId(taskId);
            setCurrentTaskType(taskToUse.type || null);

            // P0 修复：持久化 called 状态到数据库（解决刷新后重复触发的问题）
            if (auth.userId && !isTemporaryId) {
                // 只有非临时任务才需要单独更新 called 状态
                // 临时任务已经在上面保存时处理了
                try {
                    await updateReminder(taskId, { called: true });
                    devLog('✅ Task called status persisted to database');
                } catch (updateError) {
                    console.error('⚠️ Failed to persist called status:', updateError);
                }
            }
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, called: true } : t));
        } catch (error) {
            console.error('❌ Failed to start AI coach session:', error);
        }
    }, [aiCoach, setTasks, auth.userId, auth.userName, currentCallRecordId]);

    /**
     * 确保首次显示语音/摄像头提示；用户确认后才真正启动 AI 教练。
     *
     * @param {Task} task - 需要启动的任务
     */
    const ensureVoicePromptThenStart = useCallback((task: Task) => {
        devLog('📋 ensureVoicePromptThenStart called:', { task: task.text, hasSeenVoicePrompt });
        // 跳过语音权限提示弹窗，直接启动 AI Coach
        if (!hasSeenVoicePrompt) {
            markVoicePromptSeen();
        }
        devLog('✅ Starting AI Coach directly');
        void startAICoachForTask(task);
    }, [hasSeenVoicePrompt, markVoicePromptSeen, startAICoachForTask]);

    /**
     * Screen Time 事件处理
     * 当用户从 iOS Shield 界面点击按钮后，iOS 会发送事件到 Web 端
     */
    const handleScreenTimeAction = useCallback((event: ScreenTimeActionEvent) => {
        devLog('🔓 [ScreenTime] 收到操作事件:', event);

        if (event.action === 'start_task') {
            // 从 Shield 锁定页进入 “start_task” 意味着用户处于解锁流程中。
            // 这里先写一个兜底标记：即使 statusUpdate 尚未到达，也允许在“任务完成”时触发解锁。
            isScreenTimeLockedRef.current = true;
            shouldUnlockScreenTimeAfterTaskCompleteRef.current = true;

            // 用户选择"让 Lumi 陪我开始" - 直达 Gemini Live 开始任务
            const task: Task = {
                id: event.taskId || `temp-${Date.now()}`,
                text: event.taskName || '开始任务',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                displayTime: 'Now',
                date: getLocalDateString(),
                completed: false,
                type: 'todo',
                category: 'morning',
                called: false,
            };
            devLog('🚀 [ScreenTime] 启动任务:', task.text);
            // 跳转到 urgency 页面并启动任务
            handleChangeView('urgency', true);

            // 关键：不要用固定延迟直接启动。
            // 原因：iOS WebView 回到前台时，Native 登录态注入 + Supabase session 恢复是异步的。
            // 如果在会话未验证完成前就调用 startSession，会出现“偶发启动失败/页面不弹”的竞态。
            // 这里复用与 Urgency 页按钮一致的 gate：先等会话验证完成，再启动 AI。
            if (!auth.isSessionValidated) {
                devLog('⏳ [ScreenTime] 会话验证中，挂起 start_task 操作');
                try {
                    localStorage.setItem(
                        SCREEN_TIME_START_TASK_INTENT_KEY,
                        JSON.stringify({ event, savedAtMs: Date.now() })
                    );
                } catch {
                    // ignore
                }
                setPendingTask(task);
                setPendingAction('start-ai');
                setPendingActionSource('session-validation');
                return;
            }

            if (!auth.isLoggedIn) {
                devLog('🔐 [ScreenTime] 未登录，挂起 start_task 并弹出登录框');
                try {
                    localStorage.setItem(
                        SCREEN_TIME_START_TASK_INTENT_KEY,
                        JSON.stringify({ event, savedAtMs: Date.now() })
                    );
                } catch {
                    // ignore
                }
                setPendingTask(task);
                setPendingAction('start-ai');
                setPendingActionSource('auth-required');
                setShowAuthModal(true);
                return;
            }

            // 如果能走到这里，说明会话已恢复完成，清理可能残留的 pending intent
            try {
                localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
            } catch {
                // ignore
            }
            ensureVoicePromptThenStart(task);
        } else if (event.action === 'confirm_consequence') {
            // 用户选择"暂时不做，接受后果" - 显示后果确认界面
            devLog('📝 [ScreenTime] 显示后果确认界面');
            setPledgeConfirmData({
                taskName: event.taskName || '',
                consequence: event.consequence || '',
                pledge: event.consequencePledge || '',
            });
            setShowPledgeConfirm(true);
        }
    }, [auth.isLoggedIn, auth.isSessionValidated, ensureVoicePromptThenStart, handleChangeView]);

    // 使用 Screen Time Hook 监听 iOS 事件
    const screenTime = useScreenTime({
        onAction: handleScreenTimeAction,
    });

    // 同步 Screen Time 锁定状态到 ref，供“任务完成自动解锁”逻辑判断
    useEffect(() => {
        isScreenTimeLockedRef.current = screenTime.status.isLocked;
    }, [screenTime.status.isLocked]);

    // 兜底：如果 start_task 到达时 WebView 恰好 reload，React state 会丢失。
    // 我们把意图持久化到 localStorage，并在会话恢复后自动续跑，避免“偶发不弹语音页”。
    useEffect(() => {
        if (!auth.isSessionValidated || !auth.isLoggedIn) return;
        if (pendingTask || pendingAction) return;
        if (aiCoach.isSessionActive || aiCoach.isConnecting || usingLiveKit) return;

        let raw: string | null = null;
        try {
            raw = localStorage.getItem(SCREEN_TIME_START_TASK_INTENT_KEY);
        } catch {
            return;
        }

        if (!raw) return;

        try {
            const parsed = JSON.parse(raw) as {
                event?: ScreenTimeActionEvent;
                savedAtMs?: number;
            };

            const pendingEvent = parsed?.event;
            const savedAtMs = parsed?.savedAtMs;

            if (!pendingEvent || pendingEvent.action !== 'start_task') {
                localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
                return;
            }

            if (typeof savedAtMs === 'number' && Date.now() - savedAtMs > SCREEN_TIME_INTENT_TTL_MS) {
                devLog('🗑️ [ScreenTime] start_task intent 已过期，清理');
                localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
                return;
            }

            devLog('♻️ [ScreenTime] 恢复 start_task intent（可能发生了 WebView reload）:', pendingEvent);
            // 先清理再处理，避免 handleScreenTimeAction 再次 return 时形成循环
            localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
            handleScreenTimeAction(pendingEvent);
        } catch (error) {
            console.warn('[ScreenTime] 解析 start_task intent 失败，已清理:', error);
            try {
                localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
            } catch {
                // ignore
            }
        }
    }, [
        auth.isSessionValidated,
        auth.isLoggedIn,
        pendingTask,
        pendingAction,
        aiCoach.isSessionActive,
        aiCoach.isConnecting,
        usingLiveKit,
        handleScreenTimeAction,
    ]);

    /**
     * 「Start」按钮点击：直接进入 AI 教练任务流程
     * 注意：不再通过路由跳转，而是在当前页面内启动 useAICoachSession，
     * 这样前后逻辑与 DevTestPage / TaskWorkingExample 中保持一致。
     *
     * @param {Task} task - 用户选择或输入的任务
     */
    const handleQuickStart = (task: Task) => {
        // 如果会话还未验证完成，先挂起操作，等待验证完成后再处理
        if (!auth.isSessionValidated) {
            devLog('⏳ 会话验证中，挂起 handleQuickStart 操作');
            setPendingTask(task);
            setPendingAction('start-ai');
            setPendingActionSource('session-validation');
            return;
        }

        if (!auth.isLoggedIn) {
            setPendingTask(task);
            setPendingAction('start-ai');
            setPendingActionSource('auth-required');
            setShowAuthModal(true);
            return;
        }
        ensureVoicePromptThenStart(task);
    };

    /**
     * Stats 页面的 Start 按钮点击处理
     * 使用真实的习惯 ID 创建 Task 对象，然后启动 AI Coach
     *
     * 关键：使用习惯的真实 UUID 作为任务 ID，这样完成时能正确更新数据库中的习惯记录
     *
     * @param {string} habitId - 习惯的真实 UUID
     * @param {string} habitTitle - 习惯名称
     */
    const handleStatsStartTask = (habitId: string, habitTitle: string) => {
        const task: Task = {
            id: habitId,  // 🔧 关键修复：使用习惯的真实 ID，而不是临时 ID
            text: habitTitle,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            displayTime: 'Now',
            date: getLocalDateString(),
            completed: false,
            type: 'routine',  // 🔧 修复：类型应该是 routine，不是 todo
            category: 'morning',
            called: false,
        };
        handleQuickStart(task);
    };

    /**
     * 会话验证完成后处理挂起的操作
     *
     * 背景：iOS WebView 的登录态恢复是异步的，过早判断"未登录"会触发登录流程
     * 这个 effect 等待会话验证完成后，再根据登录状态决定是弹登录框还是直接执行操作
     */
    useEffect(() => {
        // 只在会话验证完成且由验证挂起的操作时处理
        if (!auth.isSessionValidated || !pendingTask || !pendingAction || pendingActionSource !== 'session-validation') {
            return;
        }

        devLog('✅ 会话验证完成，处理挂起操作:', { pendingAction, isLoggedIn: auth.isLoggedIn });

        if (pendingAction === 'add-task') {
            if (auth.isLoggedIn) {
                // 已登录，直接创建任务
                void addTask(pendingTask);
                setPendingTask(null);
                setPendingAction(null);
                setPendingActionSource(null);
            } else {
                // 未登录，弹出登录框
                setShowAuthModal(true);
            }
        } else if (pendingAction === 'start-ai') {
            if (auth.isLoggedIn) {
                // 已登录，直接启动 AI
                ensureVoicePromptThenStart(pendingTask);
                setPendingTask(null);
                setPendingAction(null);
                setPendingActionSource(null);
            } else {
                // 未登录，弹出登录框
                setShowAuthModal(true);
            }
        }
    }, [addTask, auth.isSessionValidated, auth.isLoggedIn, pendingTask, pendingAction, pendingActionSource, ensureVoicePromptThenStart]);

    /**
     * 检测 URL 参数以支持快速启动链接，类似 onboarding 的实现
     * 示例:
     * - /app/urgency?task=Get%20out%20of%20bed&autostart=true
     * - /app/urgency?task=Get%20out%20of%20bed&autostart=true&skipPrompt=true (跳过权限提示)
     * - /app/urgency?task=Get%20out%20of%20bed&taskId=uuid&autostart=true (复用已有任务，避免重复创建)
     */
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get('task');
        const taskIdParam = urlParams.get('taskId');
        const autostartParam = urlParams.get('autostart');
        const skipPromptParam = urlParams.get('skipPrompt');
        const callRecordIdParam = urlParams.get('callRecordId');

        // 🆕 如果有 callRecordId，记录 WebView 打开时间（表示用户点击了接听）
        if (callRecordIdParam && !currentCallRecordId) {
            devLog('📞 检测到 callRecordId，记录 WebView 打开时间:', callRecordIdParam);
            setCurrentCallRecordId(callRecordIdParam);

            // 立即调用 API 记录 webview_opened_at
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

        // 检查是否需要自动启动
        const shouldAutoStart = autostartParam === 'true' && taskParam && !hasAutoStarted;

        if (!shouldAutoStart) return;

        // 🛡️ 关键保护：在原生 App 内，如果 autostart 没有 taskId，直接阻止启动
        // 这是防止重复创建任务的核心检查
        // 场景：用户接听电话后返回 WebView，URL 参数仍存在但没有 taskId
        // 如果允许启动，会创建一个 time=now 的临时任务，导致重复拨打电话
        if (isNativeApp() && !taskIdParam) {
            console.warn('⚠️ Autostart blocked in native app: missing taskId (防止重复任务)');
            return;
        }

        // 如果带 taskId，必须等待会话验证完成且已登录，避免在未恢复会话时误创建临时任务
        if (taskIdParam && (!auth.isSessionValidated || !auth.isLoggedIn)) {
            return;
        }

        // 如果带 taskId，等待任务列表加载完成，避免误创建临时任务
        if (taskIdParam && !tasksLoaded) {
            return;
        }

        const startFromUrl = async () => {
            // 标记已自动启动，防止重复触发
            setHasAutoStarted(true);

            devLog('✅ Auto-starting task:', taskParam, 'taskId:', taskIdParam);

            // 尝试从现有任务列表中查找对应任务
            let taskToStart: Task | undefined;

            if (taskIdParam) {
                if (!auth.userId) {
                    console.warn('⚠️ Autostart blocked: missing auth user for taskId', taskIdParam);
                    return;
                }
                // 如果有 taskId 参数，优先从任务列表中查找
                taskToStart = tasks.find(t => t.id === taskIdParam);
                if (taskToStart) {
                    devLog('📋 Found existing task by ID:', taskIdParam);
                } else if (auth.userId) {
                    devLog('🔎 Task not found in list, fetching by ID:', taskIdParam);
                    const fetchedTask = await fetchReminderById(taskIdParam, auth.userId);
                    if (fetchedTask) {
                        taskToStart = fetchedTask;
                        setTasks(prev => {
                            if (prev.some(t => t.id === fetchedTask.id)) {
                                return prev;
                            }
                            return [...prev, fetchedTask];
                        });
                        devLog('✅ Found task from database:', taskIdParam);
                    } else {
                        console.warn('⚠️ Task not found by ID, aborting autostart to avoid duplicate task');
                        return;
                    }
                }
            }

            // 如果没有 taskId，才创建临时任务对象
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

            // 如果设置了 skipPrompt，自动标记为已看过权限提示
            if (skipPromptParam === 'true' && !hasSeenVoicePrompt) {
                devLog('⏭️ Skipping voice prompt as requested');
                markVoicePromptSeen();
            }

            // 确保在 urgency 页面，并等待组件挂载
            if (currentView !== 'urgency') {
                handleChangeView('urgency', true);
                // 等待页面切换完成后再启动任务
                setTimeout(() => {
                    devLog('🚀 Launching AI Coach after navigation');
                    ensureVoicePromptThenStart(finalTask);
                    // 启动后清理 URL 参数
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 500);
            } else {
                // 延迟一小段时间确保所有组件已挂载
                setTimeout(() => {
                    devLog('🚀 Launching AI Coach directly');
                    ensureVoicePromptThenStart(finalTask);
                    // 启动后清理 URL 参数
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 100);
            }
        };

        void startFromUrl();
    }, [auth.userId, auth.isLoggedIn, auth.isSessionValidated, currentCallRecordId, currentView, handleChangeView, ensureVoicePromptThenStart, hasAutoStarted, hasSeenVoicePrompt, markVoicePromptSeen, tasks, tasksLoaded]);

    /**
     * 语音/摄像头提示点击「OK」后继续任务启动。
     */
    const handleVoicePromptConfirm = useCallback(() => {
        markVoicePromptSeen();
        setShowVoicePrompt(false);
        if (pendingVoiceTask) {
            void startAICoachForTask(pendingVoiceTask);
            setPendingVoiceTask(null);
        }
    }, [markVoicePromptSeen, pendingVoiceTask, startAICoachForTask]);

    /**
     * 用户取消提示，则终止本次启动流程。
     */
    const handleVoicePromptCancel = useCallback(() => {
        setShowVoicePrompt(false);
        setPendingVoiceTask(null);
    }, []);

    /**
     * 标记任务为已完成，更新数据库
     *
     * 对于习惯任务（routine），还会额外更新 routine_completions 表以记录打卡历史
     *
     * @param taskId 任务 ID
     * @param actualDurationMinutes 实际完成时长（分钟）
     * @param taskType 任务类型（可选），用于判断是否需要更新 routine_completions
     */
    const markTaskAsCompleted = useCallback(async (
        taskId: string | null,
        actualDurationMinutes: number,
        taskType?: 'todo' | 'routine' | 'routine_instance' | null
    ) => {
        if (!taskId) {
            console.warn('⚠️ 无法标记任务完成：缺少 taskId');
            return;
        }

        // 检查是否是临时 ID（不更新数据库）
        const isTemporaryId = /^\d+$/.test(taskId) || taskId.startsWith('temp-');
        if (isTemporaryId) {
            devLog('⚠️ 临时任务 ID，跳过数据库更新');
            return;
        }

        try {
            devLog('✅ 标记任务完成:', { taskId, actualDurationMinutes, taskType });

            // 1. 更新 tasks 表
            await updateReminder(taskId, {
                completed: true,
                actualDurationMinutes,
            });

            // 2. 如果是习惯任务，还需要更新 routine_completions 表（记录打卡历史）
            if (taskType === 'routine' && auth.userId) {
                const todayKey = getLocalDateString();
                await markRoutineComplete(auth.userId, taskId, todayKey);
                devLog('✅ 习惯打卡记录已保存:', { taskId, date: todayKey });
            }

            // 3. 同步更新前端任务列表
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, completed: true } : t
            ));

            devLog('✅ 任务已标记为完成');
        } catch (error) {
            console.error('❌ 标记任务完成失败:', error);
        }
    }, [auth.userId]);

    /**
     * 用户点击「END CALL」- 仅结束通话，不触发庆祝
     * - 保存会话记忆到 Mem0（标记为未完成）
     * - 结束当前 AI 会话
     * - 返回主界面
     *
     * 优化：
     * 1. 立即停止音频播放（用户体验优先）
     * 2. 立即结束会话，返回主页面
     * 3. 后台保存记忆（完全不阻塞 UI）
     */
    const handleEndCall = useCallback(() => {
        // 1. 立即停止音频播放，让 AI 马上静音
        aiCoach.stopAudioImmediately();

        // 2. 立即结束会话（释放摄像头、麦克风等资源）
        // 注意：先复制 messages 和 taskDescription 快照用于后台保存
        const messagesSnapshot = [...aiCoach.state.messages];
        const taskDescriptionSnapshot = aiCoach.state.taskDescription;
        aiCoach.endSession();

        // 3. 重置任务状态，UI 立即切换回主页面
        setCurrentTaskId(null);
        setCurrentTaskType(null);

        // 4. 后台保存记忆（完全不阻塞 UI，使用快照数据）
        void (async () => {
            try {
                devLog('🧠 [记忆保存] 开始后台保存记忆...');
                devLog('🧠 [记忆保存] 消息快照数量:', messagesSnapshot.length);
                devLog('🧠 [记忆保存] 用户ID:', auth.userId);

                // 直接调用 Supabase 保存记忆，不依赖 aiCoach 状态
                if (messagesSnapshot.length > 0 && auth.userId) {
                    const supabaseClient = getSupabaseClient();
                    devLog('🧠 [记忆保存] Supabase 客户端:', supabaseClient ? '已获取' : '为空');

                    if (supabaseClient) {
                        const realMessages = messagesSnapshot.filter(msg => !msg.isVirtual);
                        devLog('🧠 [记忆保存] 真实消息数量:', realMessages.length, '/', messagesSnapshot.length);

                        if (realMessages.length > 0) {
                            const mem0Messages = realMessages.map(msg => ({
                                role: msg.role === 'ai' ? 'assistant' : 'user',
                                content: msg.content,
                            }));
                            // 添加任务描述作为上下文（与完成任务时一致）
                            if (taskDescriptionSnapshot) {
                                mem0Messages.unshift({
                                    role: 'system',
                                    content: `User was working on task: "${taskDescriptionSnapshot}"`,
                                });
                            }
                            devLog('🧠 [记忆保存] 调用 memory-extractor...');
                            devLog('🧠 [记忆保存] 任务描述:', taskDescriptionSnapshot);
                            const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
                                body: {
                                    action: 'extract',
                                    userId: auth.userId,
                                    messages: mem0Messages,
                                    taskDescription: taskDescriptionSnapshot,
                                    metadata: {
                                        source: 'ai_coach_session',
                                        timestamp: new Date().toISOString(),
                                        task_completed: false,
                                    },
                                },
                            });
                            if (error) {
                                console.error('🧠 [记忆保存] memory-extractor 返回错误:', error);
                            } else {
                                devLog('✅ [记忆保存] 记忆提取成功:', data);
                                // 显示具体保存了哪些记忆
                                if (data?.memories && Array.isArray(data.memories)) {
                                    devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                    devLog('📝 [记忆保存] 保存的记忆内容:');
                                    data.memories.forEach((mem: { content?: string; tag?: string }, idx: number) => {
                                        devLog(`  ${idx + 1}. [${mem.tag || 'UNKNOWN'}] ${mem.content || '(无内容)'}`);
                                    });
                                    devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                }
                            }
                        } else {
                            devLog('⚠️ [记忆保存] 跳过：没有真实消息（所有消息都是虚拟消息）');
                        }
                    } else {
                        devLog('⚠️ [记忆保存] 跳过：Supabase 客户端为空');
                    }
                } else {
                    devLog('⚠️ [记忆保存] 跳过：消息为空或用户ID为空');
                }
            } catch (error) {
                console.error('⚠️ 后台保存记忆失败（不影响用户体验）:', error);
            }
        })();
    }, [aiCoach, auth.userId]);

    /**
     * 用户在任务执行视图中点击「I'M DOING IT!」
     * - 保存会话记忆到 Mem0
     * - 结束当前 AI 会话
     * - 直接显示庆祝页面（跳过确认页面）
     * - 标记任务为已完成
     *
     * 优化：
     * 1. 立即停止音频播放（用户体验优先）
     * 2. 立即结束会话，显示庆祝页面
     * 3. 后台保存记忆（完全不阻塞 UI）
     */
    const handleEndAICoachSession = useCallback(() => {
        // 1. 立即停止音频播放，让 AI 马上静音
        aiCoach.stopAudioImmediately();

        // 计算完成时间（已用时间 = 初始时间 - 剩余时间）
        const usedTime = 300 - aiCoach.state.timeRemaining;
        const actualDurationMinutes = Math.round(usedTime / 60);

        // 保存当前状态用于后台操作
        const messagesSnapshot = [...aiCoach.state.messages];
        const taskDescriptionSnapshot = aiCoach.state.taskDescription;
        const taskIdToComplete = currentTaskId;
        const taskTypeToComplete = currentTaskType;

        // 2. 立即结束会话（释放摄像头、麦克风等资源）
        aiCoach.endSession();

        // 3. 立即更新 UI，显示庆祝页面
        setCompletionTime(usedTime);
        setCurrentTaskDescription(taskDescriptionSnapshot);
        setCelebrationFlow('success');
        setShowCelebration(true);

        // ✅ 任务完成：如果仍处于 Screen Time 锁定状态，立即解锁应用
        unlockScreenTimeIfLocked('GeminiLive.primaryButton');

        // 重置任务状态
        setCurrentTaskId(null);
        setCurrentTaskType(null);

        // 4. 后台保存记忆（完全不阻塞 UI）
        void (async () => {
            try {
                devLog('🧠 [记忆保存-完成] 开始后台保存记忆（任务完成）...');
                devLog('🧠 [记忆保存-完成] 消息快照数量:', messagesSnapshot.length);
                devLog('🧠 [记忆保存-完成] 用户ID:', auth.userId);
                devLog('🧠 [记忆保存-完成] 任务描述:', taskDescriptionSnapshot);

                if (messagesSnapshot.length > 0 && auth.userId) {
                    const supabaseClient = getSupabaseClient();
                    devLog('🧠 [记忆保存-完成] Supabase 客户端:', supabaseClient ? '已获取' : '为空');

                    if (supabaseClient) {
                        const realMessages = messagesSnapshot.filter(msg => !msg.isVirtual);
                        devLog('🧠 [记忆保存-完成] 真实消息数量:', realMessages.length, '/', messagesSnapshot.length);

                        if (realMessages.length > 0) {
                            const mem0Messages = realMessages.map(msg => ({
                                role: msg.role === 'ai' ? 'assistant' : 'user',
                                content: msg.content,
                            }));
                            mem0Messages.unshift({
                                role: 'system',
                                content: `User was working on task: "${taskDescriptionSnapshot}"`,
                            });
                            devLog('🧠 [记忆保存-完成] 调用 memory-extractor...');
                            const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
                                body: {
                                    action: 'extract',
                                    userId: auth.userId,
                                    messages: mem0Messages,
                                    taskDescription: taskDescriptionSnapshot,
                                    metadata: {
                                        source: 'ai_coach_session',
                                        sessionDuration: usedTime,
                                        timestamp: new Date().toISOString(),
                                        task_completed: true,
                                        actual_duration_minutes: actualDurationMinutes,
                                    },
                                },
                            });
                            if (error) {
                                console.error('🧠 [记忆保存-完成] memory-extractor 返回错误:', error);
                            } else {
                                devLog('✅ [记忆保存-完成] 记忆提取成功:', data);
                                // 显示具体保存了哪些记忆
                                if (data?.memories && Array.isArray(data.memories)) {
                                    devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                    devLog('📝 [记忆保存-完成] 保存的记忆内容:');
                                    data.memories.forEach((mem: { content?: string; tag?: string }, idx: number) => {
                                        devLog(`  ${idx + 1}. [${mem.tag || 'UNKNOWN'}] ${mem.content || '(无内容)'}`);
                                    });
                                    devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                }
                            }
                        } else {
                            devLog('⚠️ [记忆保存-完成] 跳过：没有真实消息');
                        }
                    } else {
                        devLog('⚠️ [记忆保存-完成] 跳过：Supabase 客户端为空');
                    }
                } else {
                    devLog('⚠️ [记忆保存-完成] 跳过：消息为空或用户ID为空');
                }
            } catch (error) {
                console.error('⚠️ 后台保存记忆失败（不影响用户体验）:', error);
            }
        })();

        // 5. 后台标记任务为已完成
        void markTaskAsCompleted(taskIdToComplete, actualDurationMinutes, taskTypeToComplete);
    }, [aiCoach, currentTaskId, currentTaskType, markTaskAsCompleted, auth.userId, unlockScreenTimeIfLocked]);

    /**
     * 用户在确认页面点击「YES, I DID IT!」
     * - 显示庆祝页面
     * - 标记任务为已完成
     */
    const handleConfirmTaskComplete = useCallback(async () => {
        const actualDurationMinutes = Math.round(completionTime / 60);

        // 标记任务为已完成
        // 传入 currentTaskType 以便正确处理习惯任务的打卡记录
        await markTaskAsCompleted(currentTaskId, actualDurationMinutes, currentTaskType);

        // ✅ 用户手动确认完成：如果仍处于 Screen Time 锁定状态，解锁应用
        unlockScreenTimeIfLocked('Celebration.confirmYes');

        // 显示庆祝页面
        setCelebrationFlow('success');
    }, [currentTaskId, currentTaskType, completionTime, markTaskAsCompleted, unlockScreenTimeIfLocked]);

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
    }, []);

    /**
     * 测试承诺确认页面 (用于 UI 调整)
     */
    const handleTestPledge = useCallback(() => {
        setPledgeConfirmData({
            taskName: 'Focus for 45 mins',
            consequence: 'No YouTube for 2 hours',
            pledge: 'I Accept The Consequence That I will lose access to YouTube for 2 hours if I fail to focus for 45 minutes.'
        });
        setShowPledgeConfirm(true);
    }, []);

    return (
        <div className="fixed inset-0 w-full h-full bg-[#0B1220] md:bg-gray-100 flex flex-col items-center md:justify-center font-sans overflow-hidden">

            {showConfetti && (
                <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
                    {/* Simple CSS Confetti placeholder */}
                    <div className="text-6xl animate-bounce">🎉</div>
                </div>
            )}

            {/* 为了保证前端有明显反馈，这里在「连接中」和「会话进行中」两种状态下都显示任务执行视图 */}
            {/* LiveKit 模式：使用原生音频，不显示摄像头 */}
            {usingLiveKit && !showCelebration && (
                <TaskWorkingView
                    taskDescription={currentTaskDescription}
                    time={liveKitTimeRemaining}
                    timeMode="countdown"
                    aiStatus={{
                        isConnected: liveKitConnected,
                        error: liveKitError,
                        // LiveKit 模式显示简单的波形（音频在原生端处理）
                        waveformHeights: liveKitConnected ? [0.5, 0.7, 0.6, 0.8, 0.5] : undefined,
                        isSpeaking: liveKitConnected,
                        isObserving: false,
                    }}
                    primaryButton={{
                        label: "I'M DOING IT!",
                        emoji: '✅',
                        onClick: () => {
                            // 结束 LiveKit 并显示庆祝页面
                            const usedSeconds = 300 - liveKitTimeRemaining;
                            endLiveKitRoom();
                            if (liveKitTimerRef.current) {
                                clearInterval(liveKitTimerRef.current);
                                liveKitTimerRef.current = null;
                            }
                            setCompletionTime(usedSeconds);
                            setCelebrationFlow('success');
                            setShowCelebration(true);
                            unlockScreenTimeIfLocked('LiveKit.primaryButton');
                            setUsingLiveKit(false);
                            setLiveKitConnected(false);
                        },
                    }}
                    secondaryButton={{
                        label: 'END CALL',
                        emoji: '🛑',
                        onClick: () => {
                            // 结束 LiveKit 并返回
                            endLiveKitRoom();
                            if (liveKitTimerRef.current) {
                                clearInterval(liveKitTimerRef.current);
                                liveKitTimerRef.current = null;
                            }
                            setUsingLiveKit(false);
                            setLiveKitConnected(false);
                            setLiveKitTimeRemaining(300);
                        },
                    }}
                    hasBottomNav={false}
                />
            )}

            {/* WebView 模式（Gemini Live）：显示摄像头和 AI 状态 */}
            {(aiCoach.isSessionActive || aiCoach.isConnecting) && !showCelebration && !usingLiveKit && (
                <>
                    <canvas ref={aiCoach.canvasRef} className="hidden" />
                    <TaskWorkingView
                        taskDescription={aiCoach.state.taskDescription}
                        time={aiCoach.state.timeRemaining}
                        timeMode="countdown"
                        camera={{
                            enabled: aiCoach.cameraEnabled,
                            videoRef: aiCoach.videoRef,
                        }}
                        onToggleCamera={aiCoach.toggleCamera}
                        aiStatus={{
                            isConnected: aiCoach.isConnected || aiCoach.isCampfireMode,
                            error: aiCoach.error,
                            waveformHeights: aiCoach.waveformHeights,
                            isSpeaking: aiCoach.isSpeaking,
                            isObserving: aiCoach.isObserving,
                        }}
                        primaryButton={{
                            label: "I'M DOING IT!",
                            emoji: '✅',
                            onClick: handleEndAICoachSession,
                        }}
                        secondaryButton={{
                            label: 'END CALL',
                            emoji: '🛑',
                            onClick: handleEndCall,
                        }}
                        hasBottomNav={false}
                    />
                </>
            )}

            {/* 任务完成确认 & 庆祝页面 - 使用高 z-index 确保覆盖在最上层 */}
            {showCelebration && (
                <div className="fixed inset-0 z-[200]">
                    <CelebrationView
                        flow={celebrationFlow}
                        onFlowChange={setCelebrationFlow}
                        success={{
                            scene: celebrationAnimation.scene,
                            coins: celebrationAnimation.coins,
                            progressPercent: celebrationAnimation.progressPercent,
                            showConfetti: celebrationAnimation.showConfetti,
                            completionTime: completionTime,
                            taskDescription: currentTaskDescription,
                            ctaButton: {
                                label: 'TAKE MORE CHALLENGE',
                                onClick: handleCloseCelebration,
                            },
                        }}
                        failure={{
                            button: {
                                label: 'TRY AGAIN',
                                onClick: handleCloseCelebration,
                            },
                        }}
                        confirm={{
                            title: "Time's Up!",
                            subtitle: 'Did you complete your task?',
                            yesButton: {
                                label: '✅ YES, I DID IT!',
                                onClick: handleConfirmTaskComplete,
                            },
                            noButton: {
                                label: "✕ NO, NOT YET",
                                onClick: handleConfirmTaskIncomplete,
                            },
                        }}
                    />
                </div>
            )}

            {/* Main App Shell: 使用 fixed inset-0 确保移动端全屏适配，桌面端显示为手机壳样式 */}
            {/* 当 AI 会话激活、LiveKit 模式、显示庆祝页面时隐藏主内容 */}
            <div className={`w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col ${(showCelebration || aiCoach.isSessionActive || aiCoach.isConnecting || usingLiveKit) ? 'hidden' : ''}`}>

                {currentView === 'home' && (
                    <HomeView
                        tasks={tasks}
                        onAddTask={addTask}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={handleDeleteTask}
                        onUpdateTask={handleUpdateTask}
                        onRequestLogin={() => setShowAuthModal(true)}
                        isLoggedIn={auth.isLoggedIn}
                        onRefresh={handleRefresh}
                    />
                )}

                {currentView === 'stats' && (
                    <StatsView
                        onToggleComplete={handleStatsToggle}
                        refreshTrigger={statsRefreshTrigger}
                        onStartTask={handleStatsStartTask}
                    />
                )}

                {currentView === 'urgency' && (
                    <UrgencyView
                        tasks={tasks}
                        onStartTask={handleQuickStart}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={handleDeleteTask}
                        onRegisterHelpMeStart={registerUrgencyStart}
                    />
                )}

                {currentView === 'leaderboard' && (
                    <LeaderboardView />
                )}

                {currentView === 'profile' && (
                    <ProfileView
                        isPremium={isPremium}
                        onRequestLogin={() => setShowAuthModal(true)}
                        onTestPledge={handleTestPledge}
                    />
                )}

                {/* AI 会话全屏展示、LiveKit 模式或庆祝页面时隐藏底部导航，避免与浮层控件重叠 */}
                {!(aiCoach.isSessionActive || aiCoach.isConnecting || showCelebration || usingLiveKit) && (
                    <BottomNavBar
                        currentView={currentView}
                        onChange={(view) => handleChangeView(view)}
                    />
                )}

            </div>

            <AuthModal
                isOpen={showAuthModal}
                onClose={() => {
                    setShowAuthModal(false);
                    setPendingTask(null);
                    setPendingAction(null);
                    setPendingActionSource(null);
                }}
                onSuccess={() => {
                    auth.checkLoginState();
                    if (pendingTask) {
                        if (!auth.isSessionValidated) {
                            // 会话尚未验证完成，延后处理，等待验证完成后再继续
                            setPendingActionSource('session-validation');
                            return;
                        }
                        // 根据 pendingAction 决定执行什么操作
                        if (pendingAction === 'start-ai') {
                            // 用户想启动 AI Coach
                            ensureVoicePromptThenStart(pendingTask);
                        } else if (pendingAction === 'add-task') {
                            // 用户只想创建任务，不启动 AI
                            void addTask(pendingTask);
                        }
                        setPendingTask(null);
                        setPendingAction(null);
                        setPendingActionSource(null);
                    }
                }}
            />
            <VoicePermissionModal
                isOpen={showVoicePrompt}
                onConfirm={handleVoicePromptConfirm}
                onCancel={handleVoicePromptCancel}
            />
            <TestVersionModal
                isOpen={showTestVersionModal}
                onClose={() => setShowTestVersionModal(false)}
            />

            {/* Screen Time 后果确认界面 */}
            {showPledgeConfirm && pledgeConfirmData && (
                <ConsequencePledgeConfirm
                    taskName={pledgeConfirmData.taskName}
                    consequence={pledgeConfirmData.consequence}
                    pledge={pledgeConfirmData.pledge}
                    onUnlocked={() => {
                        devLog('✅ [ScreenTime] 后果确认完成，应用已解锁');
                        setShowPledgeConfirm(false);
                        setPledgeConfirmData(null);
                    }}
                    onCancel={() => {
                        devLog('❌ [ScreenTime] 用户取消后果确认');
                        setShowPledgeConfirm(false);
                        setPledgeConfirmData(null);
                    }}
                />
            )}

            {/* Product Tour 新用户引导蒙层 */}
            {productTour.isActive && productTour.currentStep && (
                <TourOverlay
                    step={productTour.currentStep}
                    stepNumber={productTour.stepNumber}
                    totalSteps={productTour.totalSteps}
                    context={productTour.context}
                    onNext={productTour.nextStep}
                    onSkip={productTour.skipTour}
                />
            )}
        </div>
    );
}

export default AppTabsPage;
