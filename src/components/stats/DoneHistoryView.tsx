/**
 * DoneHistoryView - 已完成任务历史列表
 * 按日期分组展示用户完成的一次性任务
 */

import React, { useState, useEffect } from 'react';
import { getLocalDateString } from '../../utils/timeUtils';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { fetchCompletedTodoTasks } from '../../remindMe/services/reminderService';
import type { Task } from '../../remindMe/types';

interface DoneHistoryViewProps {
    /** 变化时触发重新加载 */
    refreshTrigger?: number;
}

/**
 * 已完成任务的历史列表
 * 按日期分组显示，每组包含当天完成的所有任务
 */
export const DoneHistoryView: React.FC<DoneHistoryViewProps> = ({ refreshTrigger }) => {
    const auth = useAuth();
    const { t } = useTranslation();
    const [historyGroups, setHistoryGroups] = useState<{ dateLabel: string; tasks: Task[] }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadHistory = async () => {
            if (!auth.userId) return;
            setIsLoading(true);
            try {
                const tasks = await fetchCompletedTodoTasks(auth.userId);

                // Group by date
                const groups: { [key: string]: Task[] } = {};
                tasks.forEach(task => {
                    // Use reminder_date if available, otherwise fallback to today (using local date)
                    const dateStr = task.date || getLocalDateString();
                    if (!groups[dateStr]) {
                        groups[dateStr] = [];
                    }
                    groups[dateStr].push(task);
                });

                // Sort dates descending and format
                const sortedGroups = Object.keys(groups)
                    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                    .map(dateStr => {
                        const date = new Date(dateStr);
                        // Format: "Apr 12 . Wed"
                        const month = date.toLocaleDateString('en-US', { month: 'short' });
                        const day = date.getDate();
                        const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
                        return {
                            dateLabel: `${month} ${day} . ${weekday}`,
                            tasks: groups[dateStr]
                        };
                    });

                setHistoryGroups(sortedGroups);
            } catch (error) {
                console.error('Failed to load done history:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void loadHistory();
    }, [auth.userId, refreshTrigger]);

    if (isLoading) {
        return (
            <div className="text-center py-10 text-gray-400">
                <p className="font-serif italic text-lg">{t('stats.loadingHistory')}</p>
            </div>
        );
    }

    if (historyGroups.length === 0) {
        return (
            <div className="text-center py-10 text-gray-400">
                <p className="font-serif italic text-lg">{t('stats.noCompletedTasks')}</p>
                <p className="text-sm mt-2">{t('stats.completeTasksHint')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {historyGroups.map((group, idx) => (
                <div key={idx}>
                    {/* 日期标签 */}
                    <div className="bg-brand-cream inline-block px-4 py-2 rounded-lg mb-4 mx-2">
                        <h3 className="font-serif text-2xl text-[#3A3A3A] italic font-bold">
                            {group.dateLabel}
                        </h3>
                    </div>
                    {/* 任务列表 */}
                    <div className="space-y-3">
                        {group.tasks.map(task => (
                            <div
                                key={task.id}
                                className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between opacity-80 border border-gray-100"
                            >
                                <div className="flex items-center gap-4">
                                    {/* 完成勾选框 */}
                                    <div className="w-6 h-6 rounded border-[2px] border-brand-goldBorder bg-brand-goldBorder flex items-center justify-center">
                                        <i className="fa-solid fa-check text-white text-xs"></i>
                                    </div>
                                    {/* 任务文本（带删除线） */}
                                    <span className="text-lg text-gray-700 font-medium line-through decoration-brand-blue/50">
                                        {task.text}
                                    </span>
                                </div>
                                {/* 时间标签 */}
                                <div className="bg-brand-cream px-3 py-1 rounded-md">
                                    <span className="text-sm font-bold text-gray-800 italic font-serif flex items-center gap-1">
                                        {task.displayTime} <span className="text-brand-goldBorder">☀️</span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default DoneHistoryView;
