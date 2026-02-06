import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '../remindMe/types';
import type { AppTab } from '../constants/routes';
import { useScreenTime, type ScreenTimeActionEvent } from './useScreenTime';
import { devLog } from '../utils/devLog';
import { getLocalDateString } from '../utils/timeUtils';

// ==========================================
// 常量
// ==========================================
const SCREEN_TIME_START_TASK_INTENT_KEY = 'lumi_pending_start_task_intent';
const SCREEN_TIME_INTENT_TTL_MS = 10 * 60 * 1000;

// ==========================================
// 类型定义
// ==========================================

/**
 * 认证信息
 */
interface ScreenTimeAuth {
    isLoggedIn: boolean;
    isSessionValidated: boolean;
}

/**
 * 挂起操作的回调（Auth gate 逻辑由 AppTabsPage 持有）
 */
interface ScreenTimePendingCallbacks {
    setPendingTask: (task: Task | null) => void;
    setPendingAction: (action: 'add-task' | 'start-ai' | null) => void;
    setPendingActionSource: (source: 'session-validation' | 'auth-required' | null) => void;
    setShowAuthModal: (show: boolean) => void;
}

/**
 * useScreenTimeController 的配置选项
 */
export interface UseScreenTimeControllerOptions {
    /** 认证信息 */
    auth: ScreenTimeAuth;
    /** 当前是否有挂起的任务（用于 intent 恢复时跳过） */
    hasPendingTask: boolean;
    /** 当前是否有挂起的操作（用于 intent 恢复时跳过） */
    hasPendingAction: boolean;
    /** 切换视图的回调 */
    handleChangeView: (view: AppTab, replace?: boolean) => void;
    /** 挂起操作的回调 */
    pendingCallbacks: ScreenTimePendingCallbacks;
}

/**
 * 需要在 hook 初始化后通过 ref 绑定的回调（解决循环依赖）
 *
 * `ensureVoicePromptThenStart` 来自 useCoachController，后者依赖 `unlockScreenTimeIfLocked`。
 * 为打破循环，此 hook 先初始化并提供 `unlockScreenTimeIfLocked`，
 * 然后 AppTabsPage 将 coach 的回调通过 `bindCoachCallbacks` 注入。
 */
export interface ScreenTimeCoachBindings {
    ensureVoicePromptThenStart: (task: Task) => void;
    isSessionOverlayVisible: boolean;
}

// ==========================================
// Hook 实现
// ==========================================

/**
 * Screen Time 控制器 Hook
 *
 * 封装 iOS Screen Time 桥接逻辑，包括：
 * 1. 解锁应用（任务完成后通过 WebView bridge 通知 iOS 解锁）
 * 2. 处理 Shield 页面传来的操作事件（start_task / confirm_consequence）
 * 3. localStorage intent 恢复（WebView reload 后恢复 start_task 意图）
 * 4. 后果确认界面状态管理
 *
 * 注意：此 hook 必须在 useCoachController 之前调用，
 * 因为 useCoachController 需要 unlockScreenTimeIfLocked。
 * coach 的回调通过返回的 coachBindingsRef 延迟绑定。
 */
export function useScreenTimeController(options: UseScreenTimeControllerOptions) {
    const {
        auth,
        hasPendingTask,
        hasPendingAction,
        handleChangeView,
        pendingCallbacks,
    } = options;

    // ==========================================
    // 延迟绑定 coach 回调（解决循环依赖）
    // ==========================================
    const coachBindingsRef = useRef<ScreenTimeCoachBindings>({
        ensureVoicePromptThenStart: () => {
            console.warn('[ScreenTime] ensureVoicePromptThenStart called before coach bindings were set');
        },
        isSessionOverlayVisible: false,
    });

    // ==========================================
    // 解锁状态（refs，不触发重渲染）
    // ==========================================

    /**
     * Screen Time 自动解锁相关状态
     *
     * 原理：
     * - Screen Time 的锁定/解锁是 iOS 本地状态（ManagedSettings）。
     * - 仅仅把 tasks 标记为 completed（写 Supabase）不会影响 iOS 锁定状态。
     * - 因此当用户"完成任务"时，需要通过 WebView bridge 显式调用 `unlockApps`。
     */
    const isScreenTimeLockedRef = useRef(false);
    const shouldUnlockScreenTimeAfterTaskCompleteRef = useRef(false);

    /**
     * 如果当前处于 Screen Time 锁定状态，通过 WebView bridge 解锁应用。
     * 在 AI 会话完成、手动勾选任务完成等场景下调用。
     *
     * @param source - 触发来源标识（用于调试日志）
     */
    const unlockScreenTimeIfLocked = useCallback((source: string) => {
        if (!window.webkit?.messageHandlers?.screenTime) return;

        const shouldUnlock = isScreenTimeLockedRef.current || shouldUnlockScreenTimeAfterTaskCompleteRef.current;
        if (!shouldUnlock) return;

        isScreenTimeLockedRef.current = false;
        shouldUnlockScreenTimeAfterTaskCompleteRef.current = false;

        devLog(`🔓 [ScreenTime] 任务完成触发解锁 (${source})`);
        try {
            window.webkit.messageHandlers.screenTime.postMessage({ action: 'unlockApps' });
        } catch (error) {
            console.error('[ScreenTime] unlockApps 发送失败:', error);
        }
    }, []);

    // ==========================================
    // 后果确认状态
    // ==========================================
    const [showPledgeConfirm, setShowPledgeConfirm] = useState(false);
    const [pledgeConfirmData, setPledgeConfirmData] = useState<{
        taskName: string;
        consequence: string;
        pledge: string;
    } | null>(null);

    // ==========================================
    // Screen Time 事件处理
    // ==========================================

    /**
     * Screen Time 事件处理
     * 当用户从 iOS Shield 界面点击按钮后，iOS 会发送事件到 Web 端
     */
    const handleScreenTimeAction = useCallback((event: ScreenTimeActionEvent) => {
        devLog('🔓 [ScreenTime] 收到操作事件:', event);

        if (event.action === 'start_task') {
            isScreenTimeLockedRef.current = true;
            shouldUnlockScreenTimeAfterTaskCompleteRef.current = true;

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
            handleChangeView('urgency', true);

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
                pendingCallbacks.setPendingTask(task);
                pendingCallbacks.setPendingAction('start-ai');
                pendingCallbacks.setPendingActionSource('session-validation');
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
                pendingCallbacks.setPendingTask(task);
                pendingCallbacks.setPendingAction('start-ai');
                pendingCallbacks.setPendingActionSource('auth-required');
                pendingCallbacks.setShowAuthModal(true);
                return;
            }

            try {
                localStorage.removeItem(SCREEN_TIME_START_TASK_INTENT_KEY);
            } catch {
                // ignore
            }
            coachBindingsRef.current.ensureVoicePromptThenStart(task);
        } else if (event.action === 'confirm_consequence') {
            devLog('📝 [ScreenTime] 显示后果确认界面');
            setPledgeConfirmData({
                taskName: event.taskName || '',
                consequence: event.consequence || '',
                pledge: event.consequencePledge || '',
            });
            setShowPledgeConfirm(true);
        }
    }, [auth.isLoggedIn, auth.isSessionValidated, handleChangeView, pendingCallbacks]);

    // ==========================================
    // 使用 Screen Time Hook 监听 iOS 事件
    // ==========================================
    const screenTime = useScreenTime({
        onAction: handleScreenTimeAction,
    });

    // 同步 Screen Time 锁定状态到 ref
    useEffect(() => {
        isScreenTimeLockedRef.current = screenTime.status.isLocked;
    }, [screenTime.status.isLocked]);

    // ==========================================
    // 副作用：localStorage intent 恢复
    // ==========================================

    /**
     * 兜底：如果 start_task 到达时 WebView 恰好 reload，React state 会丢失。
     * 把意图持久化到 localStorage，并在会话恢复后自动续跑。
     */
    useEffect(() => {
        if (!auth.isSessionValidated || !auth.isLoggedIn) return;
        if (hasPendingTask || hasPendingAction) return;
        if (coachBindingsRef.current.isSessionOverlayVisible) return;

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
        hasPendingTask,
        hasPendingAction,
        handleScreenTimeAction,
    ]);

    // ==========================================
    // 后果确认回调
    // ==========================================

    /** 后果确认完成 */
    const handlePledgeUnlocked = useCallback(() => {
        devLog('✅ [ScreenTime] 后果确认完成，应用已解锁');
        setShowPledgeConfirm(false);
        setPledgeConfirmData(null);
    }, []);

    /** 用户取消后果确认 */
    const handlePledgeCancel = useCallback(() => {
        devLog('❌ [ScreenTime] 用户取消后果确认');
        setShowPledgeConfirm(false);
        setPledgeConfirmData(null);
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

    return {
        /** 如果 Screen Time 锁定中且任务完成，通过 bridge 解锁应用 */
        unlockScreenTimeIfLocked,

        /**
         * Coach 回调 ref，调用方需在 useCoachController 初始化后绑定：
         * ```
         * screenTime.coachBindingsRef.current = {
         *   ensureVoicePromptThenStart: coach.ensureVoicePromptThenStart,
         *   isSessionOverlayVisible: coach.isSessionOverlayVisible,
         * };
         * ```
         */
        coachBindingsRef,

        // 后果确认状态
        showPledgeConfirm,
        pledgeConfirmData,
        handlePledgeUnlocked,
        handlePledgeCancel,
        handleTestPledge,
    };
}
