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
import { isNativeApp, syncAllTasksToNative } from '../utils/nativeTaskEvents';
import { markRoutineComplete, unmarkRoutineComplete } from '../remindMe/services/routineCompletionService';
import { supabase } from '../lib/supabase';
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

const isAppTab = (value: string | undefined): value is AppTab => APP_TABS.includes(value as AppTab);

/**
 * 获取用户本地日期（YYYY-MM-DD 格式）
 * 使用本地时间而非 UTC，避免跨时区时日期不匹配的问题
 */
function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
        console.log('🎯 [AppTabsPage] Tour 状态变化:', {
            isActive: productTour.isActive,
            currentStep: productTour.currentStep?.step,
            stepNumber: productTour.stepNumber,
            totalSteps: productTour.totalSteps,
            url: window.location.href,
        });
    }, [productTour.isActive, productTour.currentStep, productTour.stepNumber]);

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

    // 庆祝流程相关状态
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('confirm');
    const [completionTime, setCompletionTime] = useState(0);
    const [currentTaskDescription, setCurrentTaskDescription] = useState('');
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null); // 当前正在进行的任务 ID
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

            // 合并所有任务
            const allTasks = [...todayTasks, ...routineTemplates];
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

    // 下拉刷新处理函数
    const handleRefresh = useCallback(async () => {
        console.log('🔄 Pull to refresh triggered');
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
            console.log('🔐 用户已登出，强制结束 AI 教练会话并释放媒体资源');
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
            console.log('🎙️ [AppTabsPage] LiveKit connected');
            setLiveKitConnected(true);
            setLiveKitError(null);
        });

        const cleanupDisconnected = onLiveKitEvent('disconnected', () => {
            console.log('🎙️ [AppTabsPage] LiveKit disconnected');
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

        console.log('🎙️ [AppTabsPage] LiveKit 倒计时开始');
        liveKitTimerRef.current = setInterval(() => {
            setLiveKitTimeRemaining((prev) => {
                if (prev <= 1) {
                    // 倒计时结束
                    console.log('🎙️ [AppTabsPage] LiveKit 倒计时结束');
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

        console.log('📝 addTask: 开始处理', { taskSignature, displayTime: newTask.displayTime, id: newTask.id });

        // 如果会话还未验证完成，先挂起操作，等待验证完成后再处理
        if (!auth.isSessionValidated) {
            console.log('⏳ 会话验证中，挂起 addTask 操作');
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
                console.log('✅ addTask: 任务创建成功', { id: created.id, displayTime: created.displayTime });
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
     * - routine_instance 完成时：同步更新对应的 routine 模板状态 + 记录 routine_completions
     * - routine 模板完成时：同步更新今日的 routine_instance 状态 + 记录 routine_completions
     */
    const toggleComplete = async (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task || !auth.userId) return;

        const newCompletedStatus = !task.completed;
        const today = getLocalDateString();

        // 准备需要同步更新的任务 ID 列表
        const idsToUpdate: string[] = [id];
        let routineIdForCompletion: string | null = null;

        if (task.type === 'routine_instance' && task.parentRoutineId) {
            // 完成 routine_instance 时，找到对应的 routine 模板
            routineIdForCompletion = task.parentRoutineId;
            // 同步更新模板的 UI 状态
            const routineTemplate = tasks.find(t => t.id === task.parentRoutineId);
            if (routineTemplate) {
                idsToUpdate.push(routineTemplate.id);
            }
        } else if (task.type === 'routine') {
            // 完成 routine 模板时，找到今日的 routine_instance
            routineIdForCompletion = id;
            const todayInstance = tasks.find(t =>
                t.type === 'routine_instance' &&
                t.parentRoutineId === id &&
                t.date === today
            );
            if (todayInstance) {
                idsToUpdate.push(todayInstance.id);
            }
        }

        // Optimistically update UI（同步更新所有相关任务）
        setTasks(prev => prev.map(t =>
            idsToUpdate.includes(t.id) ? { ...t, completed: newCompletedStatus } : t
        ));

        try {
            // 更新数据库中的所有相关任务
            await Promise.all(idsToUpdate.map(taskId =>
                toggleReminderCompletion(taskId, newCompletedStatus)
            ));

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
                idsToUpdate.includes(t.id) ? { ...t, completed: !newCompletedStatus } : t
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
    }, []);

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
        console.log('🤖 Starting AI Coach session for task:', task.text);

        let taskToUse = task;
        let taskId = task.id;

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
                console.log('📝 检测到临时任务 ID，先保存到数据库...', { taskSignature, displayTime: task.displayTime });
                try {
                    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: null };
                    if (sessionData?.session?.user?.id) {
                        const savedTask = await createReminder(task, sessionData.session.user.id);
                        if (savedTask) {
                            console.log('✅ 任务已保存到数据库，真实 ID:', savedTask.id);
                            // 记录已创建的任务签名，防止重复创建
                            aiCoachTaskCreatedRef.current.add(taskSignature);
                            taskToUse = savedTask;
                            taskId = savedTask.id;
                            // 更新前端任务列表中的任务（用真实 ID 替换临时 ID）
                            setTasks(prev => {
                                // 如果临时任务已在列表中，替换它
                                const existingIndex = prev.findIndex(t => t.id === task.id);
                                if (existingIndex >= 0) {
                                    const newTasks = [...prev];
                                    newTasks[existingIndex] = savedTask;
                                    return newTasks;
                                }
                                // 否则添加新任务
                                return [...prev, savedTask];
                            });
                        }
                    }
                } catch (saveError) {
                    console.error('⚠️ 保存临时任务失败，继续使用临时 ID:', saveError);
                    // 继续使用临时 ID，但 actual_duration_minutes 将无法保存
                }
            }
        }

        // 调试日志：检测 LiveKit 状态
        console.log('🎙️ LiveKit 检测:', {
            isLiveKitMode: isLiveKitMode(),
            voiceMode: localStorage.getItem('lumi_voice_mode'),
        });

        // 检测是否使用 LiveKit 模式
        if (isLiveKitMode()) {
            console.log('🎙️ 使用 LiveKit 原生模式');
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
                    console.log('✅ Task called status persisted to database');
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
            await aiCoach.startSession(taskToUse.text, {
                userId: auth.userId ?? undefined,  // 传入 userId 用于 Mem0 记忆保存
                userName: auth.userName ?? undefined,
                preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
                taskId: taskId,  // 传入真实的 taskId 用于保存 actual_duration_minutes
            });
            console.log('✅ AI Coach session started successfully');

            // 保存当前任务 ID 和类型，用于完成时更新数据库
            setCurrentTaskId(taskId);
            setCurrentTaskType(taskToUse.type || null);

            // P0 修复：持久化 called 状态到数据库（解决刷新后重复触发的问题）
            if (auth.userId && !isTemporaryId) {
                // 只有非临时任务才需要单独更新 called 状态
                // 临时任务已经在上面保存时处理了
                try {
                    await updateReminder(taskId, { called: true });
                    console.log('✅ Task called status persisted to database');
                } catch (updateError) {
                    console.error('⚠️ Failed to persist called status:', updateError);
                }
            }
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, called: true } : t));
        } catch (error) {
            console.error('❌ Failed to start AI coach session:', error);
        }
    }, [aiCoach, setTasks, auth.userId, auth.userName]);

    /**
     * 确保首次显示语音/摄像头提示；用户确认后才真正启动 AI 教练。
     *
     * @param {Task} task - 需要启动的任务
     */
    const ensureVoicePromptThenStart = useCallback((task: Task) => {
        console.log('📋 ensureVoicePromptThenStart called:', { task: task.text, hasSeenVoicePrompt });
        // 跳过语音权限提示弹窗，直接启动 AI Coach
        if (!hasSeenVoicePrompt) {
            markVoicePromptSeen();
        }
        console.log('✅ Starting AI Coach directly');
        void startAICoachForTask(task);
    }, [hasSeenVoicePrompt, markVoicePromptSeen, startAICoachForTask]);

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
            console.log('⏳ 会话验证中，挂起 handleQuickStart 操作');
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

        console.log('✅ 会话验证完成，处理挂起操作:', { pendingAction, isLoggedIn: auth.isLoggedIn });

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

            console.log('✅ Auto-starting task:', taskParam, 'taskId:', taskIdParam);

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
                    console.log('📋 Found existing task by ID:', taskIdParam);
                } else if (auth.userId) {
                    console.log('🔎 Task not found in list, fetching by ID:', taskIdParam);
                    const fetchedTask = await fetchReminderById(taskIdParam, auth.userId);
                    if (fetchedTask) {
                        taskToStart = fetchedTask;
                        setTasks(prev => {
                            if (prev.some(t => t.id === fetchedTask.id)) {
                                return prev;
                            }
                            return [...prev, fetchedTask];
                        });
                        console.log('✅ Found task from database:', taskIdParam);
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
                console.log('⏭️ Skipping voice prompt as requested');
                markVoicePromptSeen();
            }

            // 确保在 urgency 页面，并等待组件挂载
            if (currentView !== 'urgency') {
                handleChangeView('urgency', true);
                // 等待页面切换完成后再启动任务
                setTimeout(() => {
                    console.log('🚀 Launching AI Coach after navigation');
                    ensureVoicePromptThenStart(finalTask);
                    // 启动后清理 URL 参数
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 500);
            } else {
                // 延迟一小段时间确保所有组件已挂载
                setTimeout(() => {
                    console.log('🚀 Launching AI Coach directly');
                    ensureVoicePromptThenStart(finalTask);
                    // 启动后清理 URL 参数
                    const newUrl = window.location.pathname + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                }, 100);
            }
        };

        void startFromUrl();
    }, [auth.userId, currentView, fetchReminderById, handleChangeView, ensureVoicePromptThenStart, hasAutoStarted, hasSeenVoicePrompt, markVoicePromptSeen, tasks, tasksLoaded]);

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
            console.log('⚠️ 临时任务 ID，跳过数据库更新');
            return;
        }

        try {
            console.log('✅ 标记任务完成:', { taskId, actualDurationMinutes, taskType });

            // 1. 更新 tasks 表
            await updateReminder(taskId, {
                completed: true,
                actualDurationMinutes,
            });

            // 2. 如果是习惯任务，还需要更新 routine_completions 表（记录打卡历史）
            if (taskType === 'routine' && auth.userId) {
                const todayKey = getLocalDateString();
                await markRoutineComplete(auth.userId, taskId, todayKey);
                console.log('✅ 习惯打卡记录已保存:', { taskId, date: todayKey });
            }

            // 3. 同步更新前端任务列表
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, completed: true } : t
            ));

            console.log('✅ 任务已标记为完成');
        } catch (error) {
            console.error('❌ 标记任务完成失败:', error);
        }
    }, [auth.userId]);

    /**
     * 用户点击「END CALL」- 仅结束通话，不触发庆祝
     * - 保存会话记忆到 Mem0（标记为未完成）
     * - 结束当前 AI 会话
     * - 返回主界面
     */
    const handleEndCall = useCallback(async () => {
        // 🐛 修复：必须等待 saveSessionMemory 完成后再调用 endSession
        // 否则 endSession 会触发 cleanup，可能中断正在进行的网络请求
        // 详见 docs/implementation-log/20260120-memory-save-race-condition-fix.md
        await aiCoach.saveSessionMemory({ forceTaskCompleted: false });
        aiCoach.endSession();

        // 重置状态，返回主界面
        setCurrentTaskId(null);
        setCurrentTaskType(null);
    }, [aiCoach]);

    /**
     * 用户在任务执行视图中点击「I'M DOING IT!」
     * - 保存会话记忆到 Mem0
     * - 结束当前 AI 会话
     * - 直接显示庆祝页面（跳过确认页面）
     * - 标记任务为已完成
     */
    const handleEndAICoachSession = useCallback(async () => {
        // 计算完成时间（已用时间 = 初始时间 - 剩余时间）
        const usedTime = 300 - aiCoach.state.timeRemaining;
        const actualDurationMinutes = Math.round(usedTime / 60);

        setCompletionTime(usedTime);
        setCurrentTaskDescription(aiCoach.state.taskDescription);

        // 🐛 修复：必须等待 saveSessionMemory 完成后再调用 endSession
        // 否则 endSession 会触发 cleanup，可能中断正在进行的网络请求
        // 详见 docs/implementation-log/20260120-memory-save-race-condition-fix.md
        await aiCoach.saveSessionMemory({ forceTaskCompleted: true });
        aiCoach.endSession();

        // 标记任务为已完成（后台运行，不阻塞 UI）
        // 传入 currentTaskType 以便正确处理习惯任务的打卡记录
        void markTaskAsCompleted(currentTaskId, actualDurationMinutes, currentTaskType);

        // 直接显示庆祝页面（跳过确认页面）
        setCelebrationFlow('success');
        setShowCelebration(true);
    }, [aiCoach, currentTaskId, currentTaskType, markTaskAsCompleted]);

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

        // 显示庆祝页面
        setCelebrationFlow('success');
    }, [currentTaskId, currentTaskType, completionTime, markTaskAsCompleted]);

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

    return (
        <div className="fixed inset-0 w-full h-full bg-white md:bg-gray-100 flex flex-col items-center md:justify-center font-sans overflow-hidden">

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
                            isConnected: aiCoach.isConnected,
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
            {/* 当 AI 会话激活、LiveKit 模式或显示庆祝页面时隐藏主内容，避免 UrgencyView 的 fixed header 穿透显示 */}
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
