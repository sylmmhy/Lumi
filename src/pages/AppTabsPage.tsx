import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_TABS, DEFAULT_APP_PATH, DEFAULT_APP_TAB } from '../constants/routes';
import type { AppTab } from '../constants/routes';
import type { Task } from '../remindMe/types';
import { useAuth } from '../hooks/useAuth';
import { useAICoachSession } from '../hooks/useAICoachSession';
import { TaskWorkingView } from '../components/task/TaskWorkingView';
import { AuthModal } from '../components/modals/AuthModal';
import { VoicePermissionModal } from '../components/modals/VoicePermissionModal';
import { TestVersionModal } from '../components/modals/TestVersionModal';
import {
    fetchReminders,
    createReminder,
    toggleReminderCompletion,
    deleteReminder,
    generateTodayRoutineInstances,
    fetchRecurringReminders,
} from '../remindMe/services/reminderService';
import { isNativeApp } from '../utils/nativeTaskEvents';
import { markRoutineComplete, unmarkRoutineComplete } from '../remindMe/services/routineCompletionService';
import { supabase } from '../lib/supabase';
import { getPreferredLanguage } from '../lib/language';

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
    const urgencyStartRef = useRef<(() => void) | null>(null);
    const [showVoicePrompt, setShowVoicePrompt] = useState(false);
    const [pendingVoiceTask, setPendingVoiceTask] = useState<Task | null>(null);
    const [showTestVersionModal, setShowTestVersionModal] = useState(false);
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
                setTasks([...todayTasks, ...routineTemplates]);
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
        initialTime: 300,
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

    const addTask = async (newTask: Task) => {
        if (!auth.userId) {
            console.error('User not logged in');
            setPendingTask(newTask);
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
    };

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


    /**
     * 为某个任务启动 AI 教练会话
     * - 调用 useAICoachSession.startSession，复用与 DevTestPage / 示例中相同的 AI 流程
     * - 会在会话成功建立后，将该任务标记为已被呼叫（called=true），防止重复触发
     */
    const startAICoachForTask = useCallback(async (task: Task) => {
        console.log('🤖 Starting AI Coach session for task:', task.text);
        try {
            const preferredLanguage = getPreferredLanguage() ?? undefined;
            await aiCoach.startSession(task.text, {
                userName: auth.userName ?? undefined,
                preferredLanguage,
            });
            console.log('✅ AI Coach session started successfully');
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, called: true } : t));
        } catch (error) {
            console.error('❌ Failed to start AI coach session:', error);
        }
    }, [aiCoach, setTasks, auth.userName]);

    /**
     * 确保首次显示语音/摄像头提示；用户确认后才真正启动 AI 教练。
     *
     * @param {Task} task - 需要启动的任务
     */
    const ensureVoicePromptThenStart = useCallback((task: Task) => {
        console.log('📋 ensureVoicePromptThenStart called:', { task: task.text, hasSeenVoicePrompt });
        if (!hasSeenVoicePrompt) {
            console.log('⚠️ Showing voice prompt first');
            setPendingVoiceTask(task);
            setShowVoicePrompt(true);
            return;
        }
        console.log('✅ Starting AI Coach directly');
        void startAICoachForTask(task);
    }, [hasSeenVoicePrompt, startAICoachForTask]);

    /**
     * 「Start」按钮点击：直接进入 AI 教练任务流程
     * 注意：不再通过路由跳转，而是在当前页面内启动 useAICoachSession，
     * 这样前后逻辑与 DevTestPage / TaskWorkingExample 中保持一致。
     */
    const handleQuickStart = (task: Task) => {
        if (!auth.isLoggedIn) {
            setPendingTask(task);
            setShowAuthModal(true);
            return;
        }
        ensureVoicePromptThenStart(task);
    };

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
     * 用户在任务执行视图中点击「I'M DOING IT!」或「END CALL」
     * - 保存会话记忆到 Mem0
     * - 结束当前 AI 会话
     */
    const handleEndAICoachSession = useCallback(async () => {
        // 先保存会话记忆，再结束会话
        await aiCoach.saveSessionMemory();
        aiCoach.endSession();
    }, [aiCoach]);

    return (
        <div className="fixed inset-0 w-full h-full bg-white md:bg-gray-100 flex flex-col items-center md:justify-center font-sans overflow-hidden">

            {showConfetti && (
                <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
                    {/* Simple CSS Confetti placeholder */}
                    <div className="text-6xl animate-bounce">🎉</div>
                </div>
            )}

            {/* 为了保证前端有明显反馈，这里在「连接中」和「会话进行中」两种状态下都显示任务执行视图 */}
            {(aiCoach.isSessionActive || aiCoach.isConnecting) && (
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

            {/* Main App Shell: 使用 fixed inset-0 确保移动端全屏适配，桌面端显示为手机壳样式 */}
            <div className="w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col">

                {currentView === 'home' && (
                    <HomeView
                        tasks={tasks}
                        onAddTask={addTask}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={handleDeleteTask}
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

                {/* AI 会话全屏展示时隐藏底部导航，避免与浮层控件重叠 */}
                {!(aiCoach.isSessionActive || aiCoach.isConnecting) && (
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
            }}
            onSuccess={() => {
                auth.checkLoginState();
                if (pendingTask) {
                    ensureVoicePromptThenStart(pendingTask);
                    setPendingTask(null);
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
            isLoggedIn={auth.isLoggedIn}
        />
    </div>
);
}

export default AppTabsPage;
