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

// Extracted Components
import { HomeView } from '../components/app-tabs/HomeView';
import { LeaderboardView } from '../components/app-tabs/LeaderboardView';
import { UrgencyView } from '../components/app-tabs/UrgencyView';
import { ProfileView } from '../components/app-tabs/ProfileView';
import { StatsView } from '../components/app-tabs/StatsView';
import { BottomNavBar } from '../components/app-tabs/BottomNavBar';

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

    // 已登录但未完成 habit onboarding 时，重定向到引导页
    // 此逻辑确保 Native 登录态注入完成后（isSessionValidated=true）再判断跳转
    useEffect(() => {
        if (auth.isSessionValidated && auth.isLoggedIn && !auth.hasCompletedHabitOnboarding) {
            navigate('/habit-onboarding', { replace: true });
        }
    }, [auth.isSessionValidated, auth.isLoggedIn, auth.hasCompletedHabitOnboarding, navigate]);

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
    const [showVoicePrompt, setShowVoicePrompt] = useState(false);
    const [pendingVoiceTask, setPendingVoiceTask] = useState<Task | null>(null);
    const [showTestVersionModal, setShowTestVersionModal] = useState(false);

    // 庆祝流程相关状态
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('confirm');
    const [completionTime, setCompletionTime] = useState(0);
    const [currentTaskDescription, setCurrentTaskDescription] = useState('');
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null); // 当前正在进行的任务 ID

    const [hasSeenVoicePrompt, setHasSeenVoicePrompt] = useState(() => {
        try {
            return localStorage.getItem('hasSeenVoiceCameraPrompt') === 'true';
        } catch (error) {
            console.error('Failed to read voice prompt flag', error);
            return false;
        }
    });
    const [hasAutoStarted, setHasAutoStarted] = useState(false);

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

    /**
     * 底部导航 Start 按钮点击逻辑：
     * - 若当前不在 Urgency 页：先通过路由跳转到该页
     * - 若已在 Urgency 页：直接复用页面内的「Help me start」逻辑启动 AI 教练
     */
    const handleBottomNavStart = useCallback(() => {
        if (currentView === 'urgency') {
            urgencyStartRef.current?.();
            return;
        }
        handleChangeView('urgency');
    }, [currentView, handleChangeView]);

    // Load tasks from Supabase when user is logged in
    useEffect(() => {
        const loadTasks = async () => {
            if (!auth.userId) return;

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
            }
        };

        void loadTasks();
    }, [auth.userId]);

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

    // 庆祝动画控制
    const celebrationAnimation = useCelebrationAnimation({
        enabled: showCelebration && celebrationFlow === 'success',
        remainingTime: 300 - completionTime, // 剩余时间用于计算奖励
    });

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

        try {
            // Create reminder in Supabase，使用会话 userId 确保满足 FK 约束
            const created = await createReminder(newTask, sessionData.user.id);
            if (created) {
                setTasks(prev => [...prev, created]);

                // 如果是 routine 任务，立即为今天生成实例
                if (created.type === 'routine') {
                    const newInstances = await generateTodayRoutineInstances(sessionData.user.id);
                    if (newInstances.length > 0) {
                        setTasks(prev => [...prev, ...newInstances]);
                    }
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
            }
        } catch (error) {
            console.error('Failed to create reminder:', error);
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
            console.log('📝 检测到临时任务 ID，先保存到数据库...');
            try {
                const { data: sessionData } = await supabase?.auth.getSession() ?? { data: null };
                if (sessionData?.session?.user?.id) {
                    const savedTask = await createReminder(task, sessionData.session.user.id);
                    if (savedTask) {
                        console.log('✅ 任务已保存到数据库，真实 ID:', savedTask.id);
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

        try {
            const preferredLanguages = getPreferredLanguages();
            await aiCoach.startSession(taskToUse.text, {
                userId: auth.userId ?? undefined,  // 传入 userId 用于 Mem0 记忆保存
                userName: auth.userName ?? undefined,
                preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
                taskId: taskId,  // 传入真实的 taskId 用于保存 actual_duration_minutes
            });
            console.log('✅ AI Coach session started successfully');

            // 保存当前任务 ID，用于完成时更新数据库
            setCurrentTaskId(taskId);

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
     */
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get('task');
        const autostartParam = urlParams.get('autostart');
        const skipPromptParam = urlParams.get('skipPrompt');

        // 检查是否需要自动启动
        const shouldAutoStart = autostartParam === 'true' && taskParam && !hasAutoStarted;

        if (!shouldAutoStart) return;

        // 标记已自动启动，防止重复触发
        setHasAutoStarted(true);

        console.log('✅ Auto-starting task:', taskParam);

        // 如果设置了 skipPrompt，自动标记为已看过权限提示
        if (skipPromptParam === 'true' && !hasSeenVoicePrompt) {
            console.log('⏭️ Skipping voice prompt as requested');
            markVoicePromptSeen();
        }

        // 创建临时任务对象
        const tempTask: Task = {
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

        // 确保在 urgency 页面，并等待组件挂载
        if (currentView !== 'urgency') {
            handleChangeView('urgency', true);
            // 等待页面切换完成后再启动任务
            setTimeout(() => {
                console.log('🚀 Launching AI Coach after navigation');
                ensureVoicePromptThenStart(tempTask);
                // 启动后清理 URL 参数
                const newUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, document.title, newUrl);
            }, 500);
        } else {
            // 延迟一小段时间确保所有组件已挂载
            setTimeout(() => {
                console.log('🚀 Launching AI Coach directly');
                ensureVoicePromptThenStart(tempTask);
                // 启动后清理 URL 参数
                const newUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, document.title, newUrl);
            }, 100);
        }
    }, [currentView, hasAutoStarted, handleChangeView, ensureVoicePromptThenStart, hasSeenVoicePrompt, markVoicePromptSeen]);

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
     * @param taskId 任务 ID
     * @param actualDurationMinutes 实际完成时长（分钟）
     */
    const markTaskAsCompleted = useCallback(async (taskId: string | null, actualDurationMinutes: number) => {
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
            console.log('✅ 标记任务完成:', { taskId, actualDurationMinutes });
            await updateReminder(taskId, {
                completed: true,
                actualDurationMinutes,
            });

            // 同步更新前端任务列表
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, completed: true } : t
            ));

            console.log('✅ 任务已标记为完成');
        } catch (error) {
            console.error('❌ 标记任务完成失败:', error);
        }
    }, []);

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

        // 用户主动点击完成，强制标记为成功会话（用于提取 EFFECTIVE 激励方式）
        await aiCoach.saveSessionMemory({ forceTaskCompleted: true });
        aiCoach.endSession();

        // 标记任务为已完成
        await markTaskAsCompleted(currentTaskId, actualDurationMinutes);

        // 直接显示庆祝页面（跳过确认页面）
        setCelebrationFlow('success');
        setShowCelebration(true);
    }, [aiCoach, currentTaskId, markTaskAsCompleted]);

    /**
     * 用户在确认页面点击「YES, I DID IT!」
     * - 显示庆祝页面
     * - 标记任务为已完成
     */
    const handleConfirmTaskComplete = useCallback(async () => {
        const actualDurationMinutes = Math.round(completionTime / 60);

        // 标记任务为已完成
        await markTaskAsCompleted(currentTaskId, actualDurationMinutes);

        // 显示庆祝页面
        setCelebrationFlow('success');
    }, [currentTaskId, completionTime, markTaskAsCompleted]);

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
            {(aiCoach.isSessionActive || aiCoach.isConnecting) && !showCelebration && (
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
                            onClick: handleEndAICoachSession,
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
            {/* 当显示庆祝页面时隐藏主内容 */}
            <div className={`w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col ${showCelebration ? 'hidden' : ''}`}>

                {currentView === 'home' && (
                    <HomeView
                        tasks={tasks}
                        onAddTask={addTask}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={handleDeleteTask}
                        onUpdateTask={handleUpdateTask}
                        onRequestLogin={() => setShowAuthModal(true)}
                        isLoggedIn={auth.isLoggedIn}
                    />
                )}

                {currentView === 'stats' && (
                    <StatsView
                        onToggleComplete={handleStatsToggle}
                        refreshTrigger={statsRefreshTrigger}
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

                {/* AI 会话全屏展示或庆祝页面时隐藏底部导航，避免与浮层控件重叠 */}
                {!(aiCoach.isSessionActive || aiCoach.isConnecting || showCelebration) && (
                    <BottomNavBar
                        currentView={currentView}
                        onChange={(view) => handleChangeView(view)}
                        onStart={handleBottomNavStart}
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
    </div>
);
}

export default AppTabsPage;
