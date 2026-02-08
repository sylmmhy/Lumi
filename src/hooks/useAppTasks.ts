import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '../remindMe/types';
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
import { isNativeApp, syncAllTasksToNative, registerNativeRefreshTasks } from '../utils/nativeTaskEvents';
import { markRoutineComplete, unmarkRoutineComplete } from '../remindMe/services/routineCompletionService';
import { supabase } from '../lib/supabase';
import { devLog } from '../utils/devLog';
import { getLocalDateString } from '../utils/timeUtils';

/**
 * useAppTasks - 任务列表的 CRUD 操作和状态管理
 *
 * 从 AppTabsPage 提取，负责：
 * - 加载任务列表（todo + routine_instance + routine 模板状态同步）
 * - 创建任务（含 routine 实例生成 + 测试版弹窗 + 原生同步）
 * - 切换完成状态（含 routine_completions 热力图记录）
 * - 删除/更新任务
 * - 标记任务已完成（AI 会话结束后调用）
 * - 提供 patchTask/upsertTask/replaceTaskId 供 coach controller 操作
 */
export function useAppTasks(userId: string | null) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoaded, setTasksLoaded] = useState(false);
    const [statsRefreshTrigger, setStatsRefreshTrigger] = useState(0);
    const [showTestVersionModal, setShowTestVersionModal] = useState(false);

    // 防止 addTask 重复执行的标志
    const addTaskInProgressRef = useRef<string | null>(null);
    // 防止 startAICoachForTask 重复创建任务的标志
    const aiCoachTaskCreatedRef = useRef<Set<string>>(new Set());

    // ── 加载任务 ──────────────────────────────────────────────────────

    const loadTasks = useCallback(async () => {
        setTasksLoaded(false);
        if (!userId) {
            setTasksLoaded(true);
            return;
        }

        try {
            // 先生成再查询，避免并发时 fetchReminders 先返回导致拿不到刚生成的今日实例。
            await generateTodayRoutineInstances(userId);

            const [todayTasks, routineTemplates] = await Promise.all([
                fetchReminders(userId),
                fetchRecurringReminders(userId),
            ]);

            const completedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.completed && t.parentRoutineId
            );
            const snoozedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.isSnoozed && t.parentRoutineId && !t.completed
            );
            const skippedInstances = todayTasks.filter(t =>
                t.type === 'routine_instance' && t.isSkip && t.parentRoutineId && !t.completed
            );

            const routineTemplatesWithStatus = routineTemplates.map(routine => {
                let updatedRoutine = routine;

                const hasCompletedInstance = completedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasCompletedInstance) {
                    updatedRoutine = { ...updatedRoutine, completed: true };
                } else {
                    updatedRoutine = { ...updatedRoutine, completed: false };
                }

                const hasSnoozedInstance = snoozedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasSnoozedInstance) {
                    devLog('🏷️ [loadTasks] 同步 snooze 状态到 routine:', routine.text);
                    updatedRoutine = { ...updatedRoutine, isSnoozed: true };
                }

                const hasSkippedInstance = skippedInstances.some(
                    instance => instance.parentRoutineId === routine.id
                );
                if (hasSkippedInstance) {
                    devLog('🏷️ [loadTasks] 同步 skip 状态到 routine:', routine.text);
                    updatedRoutine = { ...updatedRoutine, isSkip: true };
                }

                return updatedRoutine;
            });

            const allTasks = [...todayTasks, ...routineTemplatesWithStatus];
            setTasks(allTasks);

            if (isNativeApp()) {
                const tasksForNative = allTasks
                    .filter(t => t.date && t.time && !t.completed)
                    .map(t => taskToNativeReminder(t, userId!));
                syncAllTasksToNative(tasksForNative);
            }
        } catch (error) {
            console.error('Failed to load reminders:', error);
        } finally {
            setTasksLoaded(true);
        }
    }, [userId]);

    // 初始加载
    useEffect(() => {
        void loadTasks();
    }, [loadTasks]);

    // 原生端刷新任务回调
    useEffect(() => {
        const unregister = registerNativeRefreshTasks(() => {
            devLog('🔄 原生端请求刷新任务列表');
            void loadTasks();
        });
        return unregister;
    }, [loadTasks]);

    // ── 下拉刷新 ──────────────────────────────────────────────────────

    const handleRefresh = useCallback(async () => {
        devLog('🔄 Pull to refresh triggered');
        await loadTasks();
        setStatsRefreshTrigger(prev => prev + 1);
    }, [loadTasks]);

    // ── 创建任务（不含 auth gate，调用方负责） ──────────────────────────

    /**
     * 创建任务并保存到数据库
     * 注意：auth gate 逻辑由调用方（AppTabsPage）处理，此函数假设用户已登录
     * @returns 'created' | 'duplicate' | 'error'
     */
    const addTask = useCallback(async (newTask: Task): Promise<'created' | 'duplicate' | 'error'> => {
        const taskSignature = `${newTask.text}|${newTask.time}|${newTask.date || ''}`;

        if (addTaskInProgressRef.current === taskSignature) {
            console.warn('⚠️ addTask: 检测到重复调用，跳过', { taskSignature, displayTime: newTask.displayTime });
            return 'duplicate';
        }

        devLog('📝 addTask: 开始处理', { taskSignature, displayTime: newTask.displayTime, id: newTask.id });

        if (!supabase) {
            console.error('Supabase client not initialized');
            return 'error';
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (sessionError || !sessionData?.user) {
            console.warn('Supabase 会话缺失，无法创建任务', sessionError);
            return 'error';
        }

        addTaskInProgressRef.current = taskSignature;

        try {
            const created = await createReminder(newTask, sessionData.user.id);
            if (created) {
                aiCoachTaskCreatedRef.current.add(taskSignature);
                setTasks(prev => [...prev, created]);

                if (created.type === 'routine') {
                    const newInstances = await generateTodayRoutineInstances(sessionData.user.id);
                    if (newInstances.length > 0) {
                        setTasks(prev => [...prev, ...newInstances]);
                    }
                    setStatsRefreshTrigger(prev => prev + 1);
                }

                try {
                    if (!isNativeApp() && !localStorage.getItem('hasSeenTestVersionModal')) {
                        setShowTestVersionModal(true);
                        localStorage.setItem('hasSeenTestVersionModal', 'true');
                    }
                } catch (e) {
                    console.error('Failed to check/set test version modal flag', e);
                }
                devLog('✅ addTask: 任务创建成功', { id: created.id, displayTime: created.displayTime });
                return 'created';
            }
            return 'error';
        } catch (error) {
            console.error('Failed to create reminder:', error);
            return 'error';
        } finally {
            addTaskInProgressRef.current = null;
        }
    }, []);

    // ── 切换完成状态 ──────────────────────────────────────────────────

    const toggleComplete = useCallback(async (
        id: string,
        authUserId: string | null,
        unlockScreenTimeIfLocked: (source: string) => void,
    ): Promise<boolean> => {
        const task = tasks.find(t => t.id === id);
        if (!task || !authUserId) return false;

        const newCompletedStatus = !task.completed;
        const today = getLocalDateString();

        let dbIdToUpdate: string | null = null;
        const uiIdsToUpdate: string[] = [id];
        let routineIdForCompletion: string | null = null;
        let recoveredTodayInstance: Task | null = null;

        if (task.type === 'routine_instance' && task.parentRoutineId) {
            dbIdToUpdate = id;
            routineIdForCompletion = task.parentRoutineId;
            const routineTemplate = tasks.find(t => t.id === task.parentRoutineId);
            if (routineTemplate) {
                uiIdsToUpdate.push(routineTemplate.id);
            }
        } else if (task.type === 'routine') {
            routineIdForCompletion = id;
            let todayInstance = tasks.find(t =>
                t.type === 'routine_instance' &&
                t.parentRoutineId === id &&
                t.date === today
            );
            if (!todayInstance) {
                devLog('⚠️ routine 模板缺少今天实例，尝试自动补救', { routineId: id, today });
                try {
                    await generateTodayRoutineInstances(authUserId);
                    const refreshedTodayTasks = await fetchReminders(authUserId, today);
                    todayInstance = refreshedTodayTasks.find(t =>
                        t.type === 'routine_instance' &&
                        t.parentRoutineId === id &&
                        t.date === today
                    );
                    if (todayInstance) {
                        recoveredTodayInstance = todayInstance;
                        devLog('✅ 自动补救成功：已找到今天 routine_instance', {
                            routineId: id,
                            instanceId: todayInstance.id,
                            today,
                        });
                    }
                } catch (recoveryError) {
                    console.error('Failed to recover missing routine_instance before toggle:', recoveryError);
                }
            }
            if (!todayInstance) {
                try {
                    const [year, month, day] = today.split('-').map(Number);
                    const [hours, minutes] = (task.time || '00:00').split(':').map(Number);
                    const reminderTime = new Date(year, month - 1, day, hours || 0, minutes || 0);
                    const shouldAllowFutureReminder = reminderTime.getTime() > Date.now();

                    const createdInstance = await createReminder({
                        text: task.text,
                        time: task.time,
                        displayTime: task.displayTime,
                        date: today,
                        completed: false,
                        type: 'routine_instance',
                        category: task.category,
                        called: !shouldAllowFutureReminder,
                        isRecurring: false,
                        parentRoutineId: id,
                        isSkip: false,
                    }, authUserId);

                    if (createdInstance && createdInstance.type === 'routine_instance') {
                        todayInstance = createdInstance;
                        recoveredTodayInstance = createdInstance;
                        devLog('✅ 兜底补建 routine_instance 成功', {
                            routineId: id,
                            instanceId: createdInstance.id,
                            today,
                        });
                    } else {
                        // 可能是唯一约束冲突导致创建返回空，回查一次数据库拿到已有实例
                        const refreshedTodayTasks = await fetchReminders(authUserId, today);
                        todayInstance = refreshedTodayTasks.find(t =>
                            t.type === 'routine_instance' &&
                            t.parentRoutineId === id &&
                            t.date === today
                        );
                        if (todayInstance) {
                            recoveredTodayInstance = todayInstance;
                        }
                    }
                } catch (createInstanceError) {
                    console.error('Failed to create fallback routine_instance during toggle:', createInstanceError);
                }
            }
            if (todayInstance) {
                dbIdToUpdate = todayInstance.id;
                uiIdsToUpdate.push(todayInstance.id);
            } else {
                console.warn('No routine_instance found for today, cannot toggle completion', {
                    routineId: id,
                    today,
                });
                return false;
            }
        } else {
            dbIdToUpdate = id;
        }

        setTasks(prev => {
            const recoveredInstanceId = recoveredTodayInstance?.id;
            const next = recoveredTodayInstance && recoveredInstanceId && !prev.some(t => t.id === recoveredInstanceId)
                ? [...prev, recoveredTodayInstance]
                : prev;
            return next.map(t =>
                uiIdsToUpdate.includes(t.id) ? { ...t, completed: newCompletedStatus } : t
            );
        });

        if (newCompletedStatus) {
            unlockScreenTimeIfLocked('toggleComplete');
        }

        try {
            if (dbIdToUpdate) {
                await toggleReminderCompletion(dbIdToUpdate, newCompletedStatus);
            }

            if (routineIdForCompletion) {
                if (newCompletedStatus) {
                    await markRoutineComplete(authUserId, routineIdForCompletion, today);
                } else {
                    await unmarkRoutineComplete(authUserId, routineIdForCompletion, today);
                }
            }

            setStatsRefreshTrigger(prev => prev + 1);
            return true;
        } catch (error) {
            console.error('Failed to toggle reminder completion:', error);
            setTasks(prev => prev.map(t =>
                uiIdsToUpdate.includes(t.id) ? { ...t, completed: !newCompletedStatus } : t
            ));
            return false;
        }
    }, [tasks]);

    // ── StatsView 勾选同步 ──────────────────────────────────────────

    const handleStatsToggle = useCallback((
        id: string,
        completed: boolean,
        unlockScreenTimeIfLocked: (source: string) => void,
    ) => {
        setTasks(prev => prev.map(t =>
            t.id === id ? { ...t, completed } : t
        ));
        if (completed) {
            unlockScreenTimeIfLocked('StatsView.toggle');
        }
    }, []);

    // ── 删除任务 ──────────────────────────────────────────────────────

    const handleDeleteTask = useCallback(async (id: string) => {
        const previousTasks = [...tasks];
        setTasks(prev => prev.filter(t => t.id !== id));

        try {
            const success = await deleteReminder(id);
            if (!success) {
                throw new Error('Failed to delete');
            }
        } catch (error) {
            console.error('Failed to delete task:', error);
            setTasks(previousTasks);
            alert('Failed to delete task');
        }
    }, [tasks]);

    // ── 更新任务 ──────────────────────────────────────────────────────

    const handleUpdateTask = useCallback(async (updatedTask: Task) => {
        const previousTasks = [...tasks];
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));

        try {
            const result = await updateReminder(updatedTask.id, {
                text: updatedTask.text,
                time: updatedTask.time,
                displayTime: updatedTask.displayTime,
                date: updatedTask.date,
                category: updatedTask.category,
                called: updatedTask.called,
                isSkip: updatedTask.isSkip,
            });
            if (!result) {
                throw new Error('Failed to update');
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            setTasks(previousTasks);
            alert('Failed to update task');
        }
    }, [tasks]);

    // ── 标记任务完成 ──────────────────────────────────────────────────

    const markTaskAsCompleted = useCallback(async (
        taskId: string | null,
        actualDurationMinutes: number,
        taskType?: 'todo' | 'routine' | 'routine_instance' | null
    ) => {
        if (!taskId) {
            console.warn('⚠️ 无法标记任务完成：缺少 taskId');
            return;
        }

        const isTemporaryId = /^\d+$/.test(taskId) || taskId.startsWith('temp-');
        if (isTemporaryId) {
            devLog('⚠️ 临时任务 ID，跳过数据库更新');
            return;
        }

        try {
            const todayKey = getLocalDateString();
            const taskFromState = tasks.find(t => t.id === taskId);
            const effectiveTaskType = taskType ?? taskFromState?.type ?? null;

            devLog('✅ 标记任务完成:', { taskId, actualDurationMinutes, taskType: effectiveTaskType });

            // routine 模板必须通过“今天的 routine_instance”来记录完成，不能把模板本身写成 completed。
            if (effectiveTaskType === 'routine') {
                if (!userId) {
                    console.warn('⚠️ 无法标记 routine 完成：缺少 userId', { routineId: taskId });
                    return;
                }

                let routineTemplate = taskFromState?.type === 'routine' ? taskFromState : undefined;
                if (!routineTemplate) {
                    const routines = await fetchRecurringReminders(userId);
                    routineTemplate = routines.find(t => t.id === taskId && t.type === 'routine');
                }

                let todayInstance = tasks.find(t =>
                    t.type === 'routine_instance' &&
                    t.parentRoutineId === taskId &&
                    t.date === todayKey
                );

                if (!todayInstance) {
                    await generateTodayRoutineInstances(userId);
                    const refreshedTodayTasks = await fetchReminders(userId, todayKey);
                    todayInstance = refreshedTodayTasks.find(t =>
                        t.type === 'routine_instance' &&
                        t.parentRoutineId === taskId &&
                        t.date === todayKey
                    );
                }

                if (!todayInstance && routineTemplate) {
                    const [year, month, day] = todayKey.split('-').map(Number);
                    const [hours, minutes] = (routineTemplate.time || '00:00').split(':').map(Number);
                    const reminderTime = new Date(year, month - 1, day, hours || 0, minutes || 0);
                    const shouldAllowFutureReminder = reminderTime.getTime() > Date.now();

                    const createdInstance = await createReminder({
                        text: routineTemplate.text,
                        time: routineTemplate.time,
                        displayTime: routineTemplate.displayTime,
                        date: todayKey,
                        completed: false,
                        type: 'routine_instance',
                        category: routineTemplate.category,
                        called: !shouldAllowFutureReminder,
                        isRecurring: false,
                        timezone: routineTemplate.timezone,
                        parentRoutineId: taskId,
                        isSkip: false,
                    }, userId);

                    if (createdInstance?.type === 'routine_instance') {
                        todayInstance = createdInstance;
                        devLog('✅ markTaskAsCompleted 兜底补建 routine_instance 成功', {
                            routineId: taskId,
                            instanceId: createdInstance.id,
                            today: todayKey,
                        });
                    }
                }

                if (!todayInstance) {
                    console.warn('⚠️ 标记 routine 完成失败：缺少今天 routine_instance', {
                        routineId: taskId,
                        today: todayKey,
                    });
                    return;
                }

                const updatedInstance = await updateReminder(todayInstance.id, {
                    completed: true,
                    actualDurationMinutes,
                });
                if (!updatedInstance) {
                    throw new Error(`Failed to update routine_instance completion: ${todayInstance.id}`);
                }

                await markRoutineComplete(userId, taskId, todayKey);

                setTasks(prev => {
                    const withRecovered = prev.some(t => t.id === todayInstance.id)
                        ? prev
                        : [...prev, todayInstance];
                    return withRecovered.map(t => {
                        if (t.id === taskId || t.id === todayInstance.id) {
                            return { ...t, completed: true };
                        }
                        return t;
                    });
                });

                devLog('✅ routine 已标记为完成（通过 today instance）', {
                    routineId: taskId,
                    instanceId: todayInstance.id,
                    date: todayKey,
                });
                return;
            }

            const updatedTask = await updateReminder(taskId, {
                completed: true,
                actualDurationMinutes,
            });
            if (!updatedTask) {
                throw new Error(`Failed to update task completion: ${taskId}`);
            }

            if (effectiveTaskType === 'routine_instance' && userId && taskFromState?.parentRoutineId) {
                await markRoutineComplete(userId, taskFromState.parentRoutineId, todayKey);
            }

            setTasks(prev => prev.map(t => {
                if (t.id === taskId) {
                    return { ...t, completed: true };
                }
                if (effectiveTaskType === 'routine_instance' && taskFromState?.parentRoutineId && t.id === taskFromState.parentRoutineId) {
                    return { ...t, completed: true };
                }
                return t;
            }));

            devLog('✅ 任务已标记为完成');
        } catch (error) {
            console.error('❌ 标记任务完成失败:', error);
        }
    }, [userId, tasks]);

    // ── 底层操作（供 coach controller 使用） ────────────────────────────

    /** 直接更新 tasks 中某个 task 的部分字段 */
    const patchTask = useCallback((id: string, patch: Partial<Task>) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    }, []);

    /** 追加 task（如果已存在则替换） */
    const upsertTask = useCallback((task: Task) => {
        setTasks(prev => {
            const existingIndex = prev.findIndex(t => t.id === task.id);
            if (existingIndex >= 0) {
                const newTasks = [...prev];
                newTasks[existingIndex] = task;
                return newTasks;
            }
            return [...prev, task];
        });
    }, []);

    /** 用真实 ID 替换临时 ID 的任务 */
    const replaceTaskId = useCallback((oldId: string, newTask: Task) => {
        setTasks(prev => {
            const existingIndex = prev.findIndex(t => t.id === oldId);
            if (existingIndex >= 0) {
                const newTasks = [...prev];
                newTasks[existingIndex] = newTask;
                return newTasks;
            }
            return [...prev, newTask];
        });
    }, []);

    /** 检查某个任务签名是否已创建 */
    const isTaskSignatureCreated = useCallback((sig: string) => {
        return aiCoachTaskCreatedRef.current.has(sig);
    }, []);

    /** 标记某个任务签名为已创建 */
    const markTaskSignatureCreated = useCallback((sig: string) => {
        aiCoachTaskCreatedRef.current.add(sig);
    }, []);

    return {
        tasks,
        tasksLoaded,
        statsRefreshTrigger,
        showTestVersionModal,
        setShowTestVersionModal,
        addTask,
        toggleComplete,
        handleStatsToggle,
        handleDeleteTask,
        handleUpdateTask,
        handleRefresh,
        markTaskAsCompleted,
        patchTask,
        upsertTask,
        replaceTaskId,
        isTaskSignatureCreated,
        markTaskSignatureCreated,
    };
}
