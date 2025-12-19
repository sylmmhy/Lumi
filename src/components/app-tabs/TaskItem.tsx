import React, { useState, useRef } from 'react';
import type { Task } from '../../remindMe/types';
import { ConfettiEffect } from '../effects';

interface TaskItemProps {
    task: Task;
    icon?: string;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    /** 模式：home 显示时间，urgency 显示 Start 按钮 */
    mode?: 'home' | 'urgency';
    /** urgency 模式下点击 Start 的回调 */
    onStart?: () => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, icon, onToggle, onDelete, mode = 'home', onStart }) => {
    const [translateX, setTranslateX] = useState(0);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const [confettiTrigger, setConfettiTrigger] = useState(0);
    // 本地完成状态，用于控制动画显示，延迟通知父组件
    const [localCompleted, setLocalCompleted] = useState(task.completed);

    const startX = useRef<number | null>(null);
    const currentTranslateX = useRef(0);
    const itemRef = useRef<HTMLDivElement>(null);

    // 处理勾选：先播放动画，动画完成后再通知父组件
    const handleComplete = () => {
        if (localCompleted || task.completed) return;

        // 1. 立即更新本地状态（显示勾选样式）
        setLocalCompleted(true);

        // 2. 触发彩带
        setConfettiTrigger(Date.now());

        // 3. 500ms 后开始淡出动画
        setTimeout(() => {
            setIsAnimatingOut(true);

            // 4. 淡出动画完成后（1000ms），通知父组件
            setTimeout(() => {
                onToggle(task.id);
            }, 1000);
        }, 500);
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

            <div
                className={`
                    relative overflow-hidden rounded-2xl
                    transition-all duration-1000 ease-out
                    ${isAnimatingOut ? 'opacity-0 scale-95 -translate-y-2 max-h-0 mb-0 mt-0 py-0' : 'opacity-100 scale-100 translate-y-0 max-h-32'}
                `}
                style={{
                    transitionProperty: 'opacity, transform, max-height, margin, padding',
                }}
            >

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
                className={`bg-gray-50 p-4 flex items-center justify-between transition-transform duration-200 ease-out relative z-10 ${localCompleted ? '' : 'hover:bg-gray-100'}`}
                style={{ transform: `translateX(${translateX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleComplete}
                        disabled={localCompleted}
                        className={`w-6 h-6 rounded border-[2px] flex items-center justify-center transition-all ${localCompleted ? 'bg-brand-goldBorder border-brand-goldBorder' : 'border-brand-goldBorder bg-transparent'}`}
                    >
                        {localCompleted && <i className="fa-solid fa-check text-white text-xs"></i>}
                    </button>
                    <span className={`text-lg text-gray-700 font-medium transition-all duration-300 ${localCompleted ? 'line-through decoration-brand-blue/50' : ''}`}>
                        {task.text}
                    </span>
                </div>
                {mode === 'home' ? (
                    <div className="bg-brand-cream px-3 py-1 rounded-md min-w-[80px] text-right">
                        <span className="text-sm font-bold text-gray-800 italic font-serif flex items-center justify-end gap-1">
                            {task.displayTime}
                            {icon && <span className="text-brand-goldBorder">{icon}</span>}
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
        </>
    );
};
