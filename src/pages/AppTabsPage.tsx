import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_TABS, DEFAULT_APP_PATH, DEFAULT_APP_TAB } from '../constants/routes';
import type { AppTab } from '../constants/routes';
import type { Task } from '../remindMe/types';
import { useAuth } from '../hooks/useAuth';
import { TaskWorkingView } from '../components/task/TaskWorkingView';
import { CelebrationView } from '../components/celebration/CelebrationView';
import { AuthModal } from '../components/modals/AuthModal';
import { VoicePermissionModal } from '../components/modals/VoicePermissionModal';
import { TestVersionModal } from '../components/modals/TestVersionModal';
import { useScreenTime, type ScreenTimeActionEvent } from '../hooks/useScreenTime';
import { ConsequencePledgeConfirm } from '../components/ConsequencePledgeConfirm';

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
import { useAppTasks } from '../hooks/useAppTasks';
import { useCoachController } from '../hooks/useCoachController';

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

    // 任务 CRUD 和状态管理（提取到独立 hook）
    const appTasks = useAppTasks(auth.userId);

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
    const [showVoicePrompt, setShowVoicePrompt] = useState(false);
    const [pendingVoiceTask, setPendingVoiceTask] = useState<Task | null>(null);

    // Screen Time 后果确认相关状态
    const [showPledgeConfirm, setShowPledgeConfirm] = useState(false);
    const [pledgeConfirmData, setPledgeConfirmData] = useState<{
        taskName: string;
        consequence: string;
        pledge: string;
    } | null>(null);

    const handleChangeView = useCallback((view: ViewState, replace = false) => {
        navigate(`/app/${view}`, { replace });
    }, [navigate]);

    /**
     * 记录 UrgencyView 内「Help me start」的触发方法，便于底部 Start 按钮在当前页直接触发同样逻辑。
     */
    const registerUrgencyStart = useCallback((handler: (() => void) | null) => {
        urgencyStartRef.current = handler;
    }, []);

    useEffect(() => {
        if (!isAppTab(tab)) {
            navigate(DEFAULT_APP_PATH, { replace: true });
        }
    }, [navigate, tab]);

    // AI 教练控制器（封装了会话生命周期、LiveKit、庆祝流程、URL autostart 等）
    const coach = useCoachController({
        auth: {
            userId: auth.userId,
            userName: auth.userName,
            isLoggedIn: auth.isLoggedIn,
            isSessionValidated: auth.isSessionValidated,
        },
        appTasks,
        unlockScreenTimeIfLocked,
        currentView,
        handleChangeView,
        pendingCallbacks: {
            setPendingTask,
            setPendingAction,
            setPendingActionSource,
            setShowAuthModal,
        },
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
     * auth gate 逻辑保留在此（跨 task 和 coach 两个域的协调），
     * 实际 CRUD 委托给 appTasks.addTask。
     *
     * @param {Task} newTask - 待创建的任务对象
     */
    const addTask = useCallback(async (newTask: Task) => {
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

        // 委托给 useAppTasks hook 执行实际 CRUD
        await appTasks.addTask(newTask);
    }, [auth.isSessionValidated, auth.userId, appTasks]);

    /** toggleComplete 包装器：传入 unlockScreenTimeIfLocked 回调 */
    const toggleComplete = useCallback(async (id: string) => {
        await appTasks.toggleComplete(id, auth.userId, unlockScreenTimeIfLocked);
    }, [appTasks, auth.userId, unlockScreenTimeIfLocked]);

    /** handleStatsToggle 包装器：传入 unlockScreenTimeIfLocked 回调 */
    const handleStatsToggle = useCallback((id: string, completed: boolean) => {
        appTasks.handleStatsToggle(id, completed, unlockScreenTimeIfLocked);
    }, [appTasks, unlockScreenTimeIfLocked]);


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
            coach.ensureVoicePromptThenStart(task);
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
    }, [auth.isLoggedIn, auth.isSessionValidated, coach.ensureVoicePromptThenStart, handleChangeView]);

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
        if (coach.isSessionOverlayVisible) return;

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
        coach.isSessionOverlayVisible,
        handleScreenTimeAction,
    ]);

    /**
     * 会话验证完成后处理挂起的操作
     *
     * 背景：iOS WebView 的登录态恢复是异步的，过早判断"未登录"会触发登录流程
     * 这个 effect 等待会话验证完成后，再根据登录状态决定是弹登录框还是直接执行操作
     */
    useEffect(() => {
        if (!auth.isSessionValidated || !pendingTask || !pendingAction || pendingActionSource !== 'session-validation') {
            return;
        }

        devLog('✅ 会话验证完成，处理挂起操作:', { pendingAction, isLoggedIn: auth.isLoggedIn });

        if (pendingAction === 'add-task') {
            if (auth.isLoggedIn) {
                void addTask(pendingTask);
                setPendingTask(null);
                setPendingAction(null);
                setPendingActionSource(null);
            } else {
                setShowAuthModal(true);
            }
        } else if (pendingAction === 'start-ai') {
            if (auth.isLoggedIn) {
                coach.ensureVoicePromptThenStart(pendingTask);
                setPendingTask(null);
                setPendingAction(null);
                setPendingActionSource(null);
            } else {
                setShowAuthModal(true);
            }
        }
    }, [addTask, auth.isSessionValidated, auth.isLoggedIn, pendingTask, pendingAction, pendingActionSource, coach.ensureVoicePromptThenStart]);

    /**
     * 语音/摄像头提示点击「OK」后继续任务启动。
     */
    const handleVoicePromptConfirm = useCallback(() => {
        coach.markVoicePromptSeen();
        setShowVoicePrompt(false);
        if (pendingVoiceTask) {
            void coach.startAICoachForTask(pendingVoiceTask);
            setPendingVoiceTask(null);
        }
    }, [coach, pendingVoiceTask]);

    /**
     * 用户取消提示，则终止本次启动流程。
     */
    const handleVoicePromptCancel = useCallback(() => {
        setShowVoicePrompt(false);
        setPendingVoiceTask(null);
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

            {/* LiveKit 模式：使用原生音频，不显示摄像头 */}
            {coach.usingLiveKit && !coach.showCelebration && (
                <TaskWorkingView
                    taskDescription={coach.currentTaskDescription}
                    time={coach.liveKitTimeRemaining}
                    timeMode="countdown"
                    aiStatus={{
                        isConnected: coach.liveKitConnected,
                        error: coach.liveKitError,
                        waveformHeights: coach.liveKitConnected ? [0.5, 0.7, 0.6, 0.8, 0.5] : undefined,
                        isSpeaking: coach.liveKitConnected,
                        isObserving: false,
                    }}
                    primaryButton={{
                        label: "I'M DOING IT!",
                        emoji: '✅',
                        onClick: coach.handleLiveKitPrimaryClick,
                    }}
                    secondaryButton={{
                        label: 'END CALL',
                        emoji: '🛑',
                        onClick: coach.handleLiveKitSecondaryClick,
                    }}
                    hasBottomNav={false}
                />
            )}

            {/* WebView 模式（Gemini Live）：显示摄像头和 AI 状态 */}
            {(coach.aiCoach.isSessionActive || coach.aiCoach.isConnecting) && !coach.showCelebration && !coach.usingLiveKit && (
                <>
                    <canvas ref={coach.aiCoach.canvasRef} className="hidden" />
                    <TaskWorkingView
                        taskDescription={coach.aiCoach.state.taskDescription}
                        time={coach.aiCoach.state.timeRemaining}
                        timeMode="countdown"
                        camera={{
                            enabled: coach.aiCoach.cameraEnabled,
                            videoRef: coach.aiCoach.videoRef,
                        }}
                        onToggleCamera={coach.aiCoach.toggleCamera}
                        aiStatus={{
                            isConnected: coach.aiCoach.isConnected || coach.aiCoach.isCampfireMode,
                            error: coach.aiCoach.error,
                            waveformHeights: coach.aiCoach.waveformHeights,
                            isSpeaking: coach.aiCoach.isSpeaking,
                            isObserving: coach.aiCoach.isObserving,
                        }}
                        primaryButton={{
                            label: "I'M DOING IT!",
                            emoji: '✅',
                            onClick: coach.handleEndAICoachSession,
                        }}
                        secondaryButton={{
                            label: 'END CALL',
                            emoji: '🛑',
                            onClick: coach.handleEndCall,
                        }}
                        hasBottomNav={false}
                    />
                </>
            )}

            {/* 任务完成确认 & 庆祝页面 */}
            {coach.showCelebration && (
                <div className="fixed inset-0 z-[200]">
                    <CelebrationView
                        flow={coach.celebrationFlow}
                        onFlowChange={coach.setCelebrationFlow}
                        success={{
                            scene: coach.celebrationAnimation.scene,
                            coins: coach.celebrationAnimation.coins,
                            progressPercent: coach.celebrationAnimation.progressPercent,
                            showConfetti: coach.celebrationAnimation.showConfetti,
                            completionTime: coach.completionTime,
                            taskDescription: coach.currentTaskDescription,
                            ctaButton: {
                                label: 'TAKE MORE CHALLENGE',
                                onClick: coach.handleCloseCelebration,
                            },
                        }}
                        failure={{
                            button: {
                                label: 'TRY AGAIN',
                                onClick: coach.handleCloseCelebration,
                            },
                        }}
                        confirm={{
                            title: "Time's Up!",
                            subtitle: 'Did you complete your task?',
                            yesButton: {
                                label: '✅ YES, I DID IT!',
                                onClick: coach.handleConfirmTaskComplete,
                            },
                            noButton: {
                                label: "✕ NO, NOT YET",
                                onClick: coach.handleConfirmTaskIncomplete,
                            },
                        }}
                    />
                </div>
            )}

            {/* Main App Shell */}
            <div className={`w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col ${(coach.showCelebration || coach.isSessionOverlayVisible) ? 'hidden' : ''}`}>

                {currentView === 'home' && (
                    <HomeView
                        tasks={appTasks.tasks}
                        onAddTask={addTask}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={appTasks.handleDeleteTask}
                        onUpdateTask={appTasks.handleUpdateTask}
                        onRequestLogin={() => setShowAuthModal(true)}
                        isLoggedIn={auth.isLoggedIn}
                        onRefresh={appTasks.handleRefresh}
                    />
                )}

                {currentView === 'stats' && (
                    <StatsView
                        onToggleComplete={handleStatsToggle}
                        refreshTrigger={appTasks.statsRefreshTrigger}
                        onStartTask={coach.handleStatsStartTask}
                    />
                )}

                {currentView === 'urgency' && (
                    <UrgencyView
                        tasks={appTasks.tasks}
                        onStartTask={coach.handleQuickStart}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={appTasks.handleDeleteTask}
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

                {/* AI 会话全屏展示、LiveKit 模式或庆祝页面时隐藏底部导航 */}
                {!(coach.isSessionOverlayVisible || coach.showCelebration) && (
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
                            coach.ensureVoicePromptThenStart(pendingTask);
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
                isOpen={appTasks.showTestVersionModal}
                onClose={() => appTasks.setShowTestVersionModal(false)}
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
