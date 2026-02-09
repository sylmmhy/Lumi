import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_TABS, DEFAULT_APP_PATH, DEFAULT_APP_TAB } from '../constants/routes';
import type { AppTab } from '../constants/routes';
import type { Task } from '../remindMe/types';
import { useAuth } from '../hooks/useAuth';
import { SessionOverlay } from '../components/overlays/SessionOverlay';
import { CelebrationOverlay } from '../components/overlays/CelebrationOverlay';
import { AuthModal } from '../components/modals/AuthModal';
import { TestVersionModal } from '../components/modals/TestVersionModal';
import { ConsequencePledgeConfirm } from '../components/ConsequencePledgeConfirm';
import { TaskReminderBanner } from '../components/banners/TaskReminderBanner';
import { TaskCompletionModal } from '../components/modals/TaskCompletionModal';
import { CoinRewardToast, useCoinRewardToast } from '../components/stats';
import { CoinFlyAnimation } from '../components/animations/CoinFlyAnimation';
import { WeeklyCelebration } from '../components/celebration/WeeklyCelebration';

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
import { useAppTasks } from '../hooks/useAppTasks';
import { useCoachController } from '../hooks/useCoachController';
import { useScreenTimeController } from '../hooks/useScreenTimeController';
import { getCoinSummary } from '../services/coinsService';

const isAppTab = (value: string | undefined): value is AppTab => APP_TABS.includes(value as AppTab);

/**
 * 判断任务 ID 是否为前端临时 ID（尚未落库）。
 * 目前兼容两种格式：
 * - 纯数字时间戳（例如 `1770539224734`）
 * - `temp-` 前缀（例如 `temp-1770539224734`）
 */
const isTemporaryTaskId = (taskId: string): boolean => /^\d+$/.test(taskId) || taskId.startsWith('temp-');

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

    // 金币奖励 Toast（out-of-session 完成任务后显示）
    const { coins: coinToastAmount, showCoinToast, hideCoinToast } = useCoinRewardToast();

    // 金币飞行动画状态
    const [showCoinFlyAnimation, setShowCoinFlyAnimation] = useState(false);
    const [coinFlyCount, setCoinFlyCount] = useState(0);

    // Home 页任务完成庆祝动画状态
    const [showWeeklyCelebration, setShowWeeklyCelebration] = useState(false);
    const [weeklyCelebrationCoins, setWeeklyCelebrationCoins] = useState(0);

    // StatsView 待动画金币数（从 API 返回值中扣除，避免重复掉落）
    const [statsPendingNewCoins, setStatsPendingNewCoins] = useState(0);

    // 排行榜参与状态（全局管理，HomeView 和 ProfileView 共享）
    const [leaderboardOptIn, setLeaderboardOptIn] = useState<boolean>(true);

    // 任务 CRUD 和状态管理（提取到独立 hook）
    const appTasks = useAppTasks(auth.userId);

    /**
     * Home 页面只展示持久化任务（真实 UUID），临时任务不进入 Home 列表。
     * 这样可以避免用户在 Home 中看到尚未落库的会话临时任务。
     */
    const homeTasks = useMemo(
        () => appTasks.tasks.filter(task => !isTemporaryTaskId(task.id)),
        [appTasks.tasks]
    );

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
    const [showTaskCompletionModal, setShowTaskCompletionModal] = useState(false);
    /** stats 页金币动画触发计数器（每次递增触发 EnergyBall 动画） */
    const [statsCheckInTrigger, setStatsCheckInTrigger] = useState(0);

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

    // 加载排行榜参与状态（从后端获取）
    useEffect(() => {
        if (!auth.userId) return;
        let cancelled = false;
        getCoinSummary(auth.userId)
            .then((summary) => {
                if (!cancelled) {
                    setLeaderboardOptIn(summary.leaderboard_opt_in);
                    devLog('✅ [AppTabsPage] 加载排行榜参与状态:', summary.leaderboard_opt_in);
                }
            })
            .catch((err) => {
                devLog('⚠️ [AppTabsPage] 加载排行榜状态失败，降级为默认值 true:', err);
                // 降级默认 true
            });
        return () => {
            cancelled = true;
        };
    }, [auth.userId]);

    const pendingCallbacks = {
        setPendingTask,
        setPendingAction,
        setPendingActionSource,
        setShowAuthModal,
    };

    // Screen Time 控制器（必须在 useCoachController 之前，提供 unlockScreenTimeIfLocked）
    const screenTime = useScreenTimeController({
        auth: { isLoggedIn: auth.isLoggedIn, isSessionValidated: auth.isSessionValidated },
        hasPendingTask: !!pendingTask,
        hasPendingAction: !!pendingAction,
        handleChangeView,
        pendingCallbacks,
    });

    /**
     * 更新排行榜参与状态（由 ProfileView 调用）
     */
    const handleLeaderboardOptInChange = useCallback((newValue: boolean) => {
        setLeaderboardOptIn(newValue);
        devLog('✅ [AppTabsPage] 排行榜参与状态已更新:', newValue);
    }, []);

    /**
     * AI 会话任务完成后的回调：跳转到 stats 页。
     * 只有当本次确实发放金币（awardedCoins > 0）时，才触发金币动画。
     *
     * 流程：
     * 1. 播放打卡音效 + 触发金币飞行动画（800ms）
     * 2. 动画完成后跳转到 stats 页
     * 3. stats 页触发金币掉落动画（只掉 1 个新金币）
     */
    const handleTaskCompleteForStats = useCallback((awardedCoins: number) => {
        if (awardedCoins <= 0) {
            // 没有金币奖励，直接跳转
            handleChangeView('stats');
            return;
        }

        // 0. 播放打卡音效（checkin-sound.mp3）
        const checkinAudio = new Audio('/checkin-sound.mp3');
        checkinAudio.volume = 0.7;
        checkinAudio.play().catch(() => { /* 浏览器自动播放策略可能阻止 */ });

        // 1. 记录待动画金币数，让 StatsView 初始加载时扣除这部分
        setStatsPendingNewCoins(awardedCoins);

        // 2. 显示金币飞行动画
        setCoinFlyCount(awardedCoins);
        setShowCoinFlyAnimation(true);

        // 3. 800ms 后跳转到 stats 页并触发金币掉落动画
        setTimeout(() => {
            setShowCoinFlyAnimation(false);
            handleChangeView('stats');
            // 再延迟 500ms 触发 stats 页的金币掉落动画（等 loadData 完成）
            setTimeout(() => {
                setStatsCheckInTrigger(prev => prev + 1);
            }, 500);
        }, 800);
    }, [handleChangeView]);

    // AI 教练控制器（封装了会话生命周期、LiveKit、庆祝流程、URL autostart 等）
    const coach = useCoachController({
        auth: {
            userId: auth.userId,
            userName: auth.userName,
            isLoggedIn: auth.isLoggedIn,
            isSessionValidated: auth.isSessionValidated,
        },
        appTasks,
        unlockScreenTimeIfLocked: screenTime.unlockScreenTimeIfLocked,
        currentView,
        handleChangeView,
        pendingCallbacks,
        onTaskCompleteForStats: handleTaskCompleteForStats,
    });

    // 绑定 coach 回调到 screenTime（解决循环依赖）
    screenTime.coachBindingsRef.current = {
        ensureVoicePromptThenStart: coach.ensureVoicePromptThenStart,
        isSessionOverlayVisible: coach.isSessionOverlayVisible,
    };

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

    /** toggleComplete 包装器：传入 unlockScreenTimeIfLocked 回调，完成时弹出庆祝动画 */
    const toggleComplete = useCallback(async (id: string) => {
        const task = appTasks.tasks.find(t => t.id === id);
        const wasCompleted = task?.completed ?? false;
        const success = await appTasks.toggleComplete(id, auth.userId, screenTime.unlockScreenTimeIfLocked);
        // 从未完成 → 完成 且操作成功时，触发庆祝动画
        if (success && !wasCompleted) {
            // 异步获取最新金币数用于 EnergyBall 显示
            if (auth.userId) {
                getCoinSummary(auth.userId)
                    .then((summary) => {
                        setWeeklyCelebrationCoins(summary.total_coins);
                        setShowWeeklyCelebration(true);
                    })
                    .catch(() => {
                        // 获取失败也显示庆祝，使用默认值
                        setWeeklyCelebrationCoins(1);
                        setShowWeeklyCelebration(true);
                    });
            } else {
                setWeeklyCelebrationCoins(1);
                setShowWeeklyCelebration(true);
            }
        }
        return success;
    }, [appTasks, auth.userId, screenTime.unlockScreenTimeIfLocked]);

    /** handleStatsToggle 包装器：传入 unlockScreenTimeIfLocked 回调 */
    const handleStatsToggle = useCallback((id: string, completed: boolean) => {
        appTasks.handleStatsToggle(id, completed, screenTime.unlockScreenTimeIfLocked);
    }, [appTasks, screenTime.unlockScreenTimeIfLocked]);



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



    return (
        <div className="fixed inset-0 w-full h-full bg-[#0B1220] md:bg-gray-100 flex flex-col items-center md:justify-center font-sans overflow-hidden">

            {showConfetti && (
                <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
                    {/* Simple CSS Confetti placeholder */}
                    <div className="text-6xl animate-bounce">🎉</div>
                </div>
            )}

            {/* Out-of-session 完成任务后的金币奖励 Toast */}
            <CoinRewardToast coins={coinToastAmount} onClose={hideCoinToast} />

            {/* 金币飞行动画（任务完成后，金币从屏幕中央飞向顶部） */}
            <CoinFlyAnimation
                visible={showCoinFlyAnimation}
                startPosition={{ x: window.innerWidth / 2, y: window.innerHeight / 2 }}
                endPosition={{ x: window.innerWidth / 2, y: 100 }}
                coinCount={coinFlyCount}
                onComplete={() => {
                    setShowCoinFlyAnimation(false);
                }}
            />

            {/* AI 会话全屏遮罩（LiveKit + Gemini Live 两种模式） */}
            <SessionOverlay coach={coach} />

            {/* 任务完成确认页面（倒计时结束时弹出确认 → 成功跳转 stats / 失败显示鼓励） */}
            {coach.showCelebration && <CelebrationOverlay coach={coach} />}

            {/* Main App Shell */}
            <div className={`w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col ${(coach.showCelebration || coach.isSessionOverlayVisible) ? 'hidden' : ''}`}>

                {currentView === 'home' && (
                    <HomeView
                        tasks={homeTasks}
                        onAddTask={addTask}
                        onToggleComplete={toggleComplete}
                        onDeleteTask={appTasks.handleDeleteTask}
                        onUpdateTask={appTasks.handleUpdateTask}
                        onRequestLogin={() => setShowAuthModal(true)}
                        isLoggedIn={auth.isLoggedIn}
                        onRefresh={appTasks.handleRefresh}
                        onShowCoinToast={showCoinToast}
                        onVerifySuccess={handleTaskCompleteForStats}
                        leaderboardOptIn={leaderboardOptIn}
                    />
                )}

                {currentView === 'stats' && (
                    <StatsView
                        onToggleComplete={handleStatsToggle}
                        refreshTrigger={appTasks.statsRefreshTrigger}
                        onStartTask={coach.handleStatsStartTask}
                        externalCheckInTrigger={statsCheckInTrigger}
                        pendingNewCoins={statsPendingNewCoins}
                        onPendingCoinsConsumed={() => setStatsPendingNewCoins(0)}
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
                        onTestPledge={screenTime.handleTestPledge}
                        leaderboardOptIn={leaderboardOptIn}
                        onLeaderboardOptInChange={handleLeaderboardOptInChange}
                    />
                )}

                {/* AI 会话全屏展示、LiveKit 模式或庆祝页面时隐藏底部导航和横幅 */}
                {!(coach.isSessionOverlayVisible || coach.showCelebration) && (
                    <>
                        {/* Screen Time 锁定时的任务提醒横幅 */}
                        {screenTime.isAppLocked && !screenTime.showPledgeConfirm && (
                            <TaskReminderBanner
                                taskName={screenTime.lockedTaskInfo?.taskName ?? 'your task'}
                                onCompleteTask={() => setShowTaskCompletionModal(true)}
                                onAcceptConsequences={() => {
                                    // 优先从 lockedTaskInfo 获取后果数据
                                    if (screenTime.lockedTaskInfo?.consequence) {
                                        screenTime.handleAcceptConsequences();
                                        return;
                                    }
                                    // fallback：从已加载的任务列表中查找有 consequence_pledge 的最近未完成任务
                                    const taskWithConsequence = appTasks.tasks.find(
                                        t => !t.completed && t.consequencePledge
                                    );
                                    if (taskWithConsequence) {
                                        screenTime.openPledgeConfirmWithData({
                                            taskName: taskWithConsequence.text,
                                            consequence: taskWithConsequence.preloadedConsequence || taskWithConsequence.consequenceShort || 'Accept the consequence',
                                            pledge: taskWithConsequence.consequencePledge!,
                                        });
                                    } else {
                                        // 没有任何后果数据时使用通用 fallback
                                        screenTime.handleAcceptConsequences();
                                    }
                                }}
                            />
                        )}
                        <BottomNavBar
                            currentView={currentView}
                            onChange={(view) => handleChangeView(view)}
                        />
                    </>
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
<TestVersionModal
                isOpen={appTasks.showTestVersionModal}
                onClose={() => appTasks.setShowTestVersionModal(false)}
            />

            {/* 任务完成确认弹窗（从 Banner 点击 Complete Task 触发） */}
            <TaskCompletionModal
                isOpen={showTaskCompletionModal}
                onClose={() => setShowTaskCompletionModal(false)}
                onAlreadyCompleted={async () => {
                    setShowTaskCompletionModal(false);
                    // 同步任务完成状态到数据库
                    const taskId = screenTime.lockedTaskInfo?.taskId;
                    const taskName = screenTime.lockedTaskInfo?.taskName;
                    if (taskId && !isTemporaryTaskId(taskId)) {
                        await appTasks.markTaskAsCompleted(taskId, 0);
                        devLog('✅ [Banner] Already Completed - 标记任务完成:', taskId);
                        // 没有发币时，仅跳转 stats，不触发金币动画
                        handleTaskCompleteForStats(0);
                    } else if (taskName) {
                        // fallback：通过 toggleComplete（内部已包含跳转 stats + 金币动画）
                        const matchedTask = appTasks.tasks.find(
                            t => !t.completed && t.text === taskName
                        );
                        if (matchedTask) {
                            await toggleComplete(matchedTask.id);
                            devLog('✅ [Banner] Already Completed - 通过名称匹配标记任务完成:', matchedTask.id);
                        }
                    }
                }}
                onLetLumiHelp={() => {
                    setShowTaskCompletionModal(false);
                    const taskName = screenTime.lockedTaskInfo?.taskName ?? 'Start task';
                    const taskId = screenTime.lockedTaskInfo?.taskId ?? `temp-${Date.now()}`;
                    const task: Task = {
                        id: taskId,
                        text: taskName,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        displayTime: 'Now',
                        date: new Date().toISOString().split('T')[0],
                        completed: false,
                        type: 'todo',
                        category: 'morning',
                        called: false,
                    };
                    coach.ensureVoicePromptThenStart(task);
                }}
            />

            {/* Screen Time 后果确认界面 */}
            {screenTime.showPledgeConfirm && screenTime.pledgeConfirmData && (
                <ConsequencePledgeConfirm
                    taskName={screenTime.pledgeConfirmData.taskName}
                    consequence={screenTime.pledgeConfirmData.consequence}
                    pledge={screenTime.pledgeConfirmData.pledge}
                    onUnlocked={screenTime.handlePledgeUnlocked}
                    onCancel={screenTime.handlePledgeCancel}
                />
            )}

            {/* Home 页任务完成庆祝动画（半透明黑色背景叠加在 Home 上） */}
            <WeeklyCelebration
                visible={showWeeklyCelebration}
                count={weeklyCelebrationCoins}
                onClose={() => setShowWeeklyCelebration(false)}
                backgroundColor="rgba(0, 0, 0, 0.6)"
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
