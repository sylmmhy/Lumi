import React, { useState, useRef } from 'react';
import type { Task } from '../../remindMe/types';
import { ConfettiEffect } from '../effects';

interface TaskItemProps {
    task: Task;
    icon?: string;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    /** 点击任务编辑的回调 */
    onEdit?: (task: Task) => void;
    /** 模式：home 显示时间，urgency 显示 Start 按钮 */
    mode?: 'home' | 'urgency';
    /** urgency 模式下点击 Start 的回调 */
    onStart?: () => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle, onDelete, onEdit, mode = 'home', onStart }) => {
    const [translateX, setTranslateX] = useState(0);
    const [confettiTrigger, setConfettiTrigger] = useState(0);

    // 调试日志：检查 isSnoozed 值
    if (task.isSnoozed && !task.completed) {
        console.log('🏷️ [TaskItem DEBUG] 发现 snoozed 任务:', {
            id: task.id,
            title: task.text,
            isSnoozed: task.isSnoozed,
            completed: task.completed,
            shouldShowTag: task.isSnoozed && !task.completed,
        });
    }

    const startX = useRef<number | null>(null);
    const currentTranslateX = useRef(0);
    const itemRef = useRef<HTMLDivElement>(null);

    // 处理勾选切换：完成时播放彩带，取消完成时直接切换
    const handleToggle = () => {
        if (task.completed) {
            // 取消完成：直接切换状态，无彩带
            onToggle(task.id);
        } else {
            // 完成任务：触发彩带效果
            setConfettiTrigger(Date.now());
            setTimeout(() => {
                onToggle(task.id);
            }, 300);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startX.current === null) return;
        const diff = e.touches[0].clientX - startX.current;
        // Limit swipe to left (negative) and max -80px
        const newTranslate = Math.min(0, Math.max(-80, currentTranslateX.current + diff));
        setTranslateX(newTranslate);
    };

    const handleTouchEnd = () => {
        if (translateX < -40) {
            setTranslateX(-80); // Snap to open
            currentTranslateX.current = -80;
        } else {
            setTranslateX(0); // Snap back to closed
            currentTranslateX.current = 0;
        }
        startX.current = null;
    };

    return (
        <>
            {/* 彩带效果 - 放在最外层，使用 fixed 定位覆盖全屏 */}
            <ConfettiEffect
                trigger={confettiTrigger}
                duration={800}
                numberOfPieces={2000}
                gravity={0.25}
                recycle={false}
            />

            <div className="relative pt-4">
                {/* Snoozed 标签 - 卡在任务条右上角边缘，仅未完成任务显示 */}
                {task.isSnoozed && !task.completed && (
                    <span
                        className="absolute -top-0 right-3 z-20 px-3 py-1.5 bg-[#FDDEBD] text-[#1a1a1a] text-[12px] rounded-full"
                        style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}
                    >
                        +15 mins · later
                    </span>
                )}

            <div className="relative overflow-hidden rounded-2xl">

            {/* Delete Button Background */}
            <div
                className="absolute inset-0 bg-red-500 flex items-center justify-end"
                style={{
                    opacity: translateX === 0 ? 0 : 1,
                    transition: `opacity 0s ${translateX === 0 ? '0.2s' : '0s'}`
                }}
            >
                <div className="w-20 h-full flex items-center justify-center">
                    <button
                        onClick={() => onDelete(task.id)}
                        className="w-full h-full flex items-center justify-center text-white"
                    >
                        <i className="fa-solid fa-trash-can text-xl"></i>
                    </button>
                </div>
            </div>

            {/* Task Content */}
            <div
                ref={itemRef}
                className={`bg-gray-50 p-4 flex items-center justify-between transition-transform duration-200 ease-out relative z-10 ${task.completed ? '' : 'hover:bg-gray-100 cursor-pointer'}`}
                style={{ transform: `translateX(${translateX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={() => {
                    // 只有在没有滑动且未完成时才触发编辑
                    if (translateX === 0 && !task.completed && onEdit) {
                        onEdit(task);
                    }
                }}
            >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggle();
                        }}
                        className={`w-6 h-6 rounded border-[2px] flex items-center justify-center transition-all flex-shrink-0 ${task.completed ? 'bg-brand-goldBorder border-brand-goldBorder' : 'border-brand-goldBorder bg-transparent'}`}
                    >
                        {task.completed && <i className="fa-solid fa-check text-white text-xs"></i>}
                    </button>
                    {/* Task Title - Quicksand SemiBold 17px Black */}
                    <span className={`text-[17px] transition-all duration-300 truncate ${task.completed ? 'line-through decoration-brand-blue/50 decoration-2 text-gray-400' : 'text-[#111827]'}`} style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}>
                        {task.text}
                    </span>
                    {/* Habit - Quicksand Medium 12px Grey */}
                    {(task.isRecurring || task.type === 'routine') && (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-[#F3F4F6] text-[#6B7280] text-[12px] rounded" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 500 }}>
                            Habit
                        </span>
                    )}
                </div>
                {/* Time - Quicksand Bold 14px Brand Blue */}
                {mode === 'home' ? (
                    <div className="px-2.5 py-1 min-w-[70px] text-right">
                        <span className="text-[14px] text-[#4361EE]" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700 }}>
                            {task.displayTime}
                        </span>
                    </div>
                ) : (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onStart?.();
                        }}
                        className="bg-brand-cream border border-brand-orange/20 px-6 py-2 rounded-lg font-serif italic font-bold text-brand-text text-sm hover:bg-brand-yellow transition-colors shadow-sm"
                    >
                        Start
                    </button>
                )}
            </div>
            </div>
            </div>
        </>
    );
};
