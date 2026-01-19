/**
 * HeatmapDetailOverlay - 习惯详情弹窗
 * 包含：完整热力图、连续打卡统计、月历视图、编辑功能
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { TimePicker } from '../app-tabs/TimePicker';
import { getFixedHeatmapData, getCalendarData, calculateCurrentStreak } from './heatmapHelpers';
import { getLocalDateString } from '../../utils/timeUtils';
import type { Habit } from './types';

interface HeatmapDetailOverlayProps {
    /** 习惯数据 */
    habit: Habit;
    /** 关闭弹窗回调 */
    onClose: () => void;
    /** 切换指定日期完成状态的回调 */
    onToggleDate: (date: Date) => void;
    /** 更新习惯（名称、时间）的回调 */
    onUpdateHabit?: (newName: string, newTime: string) => void;
    /** 删除习惯的回调 */
    onDeleteHabit?: () => void;
}

/**
 * 习惯详情弹窗
 * 显示完整的热力图、连续打卡天数、月历视图
 * 支持补打卡、编辑和删除功能
 */
export const HeatmapDetailOverlay: React.FC<HeatmapDetailOverlayProps> = ({
    habit,
    onClose,
    onToggleDate,
    onUpdateHabit,
    onDeleteHabit,
}) => {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTime, setEditTime] = useState(habit.time || '09:00');
    const [editDate, setEditDate] = useState(new Date());
    const [editName, setEditName] = useState(habit.title);
    const HEATMAP_COLUMNS = 160; // 显示160周（约3年）
    const { days: heatmapDays, monthLabels } = getFixedHeatmapData(habit.history, HEATMAP_COLUMNS);
    const currentStreak = calculateCurrentStreak(habit.history);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 判断今天是否已完成
    const todayKey = getLocalDateString();
    const isTodayDone = !!habit.history[todayKey];

    // 自动滚动到最右侧（最新日期）
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, []);

    // 当 habit 变化时同步编辑状态
    useEffect(() => {
        setEditTime(habit.time || '09:00');
        setEditName(habit.title);
    }, [habit.time, habit.title]);

    // 主题颜色映射
    const themeColors = {
        gold: 'bg-brand-heatmapGold',
        blue: 'bg-brand-heatmapBlue',
        pink: 'bg-brand-heatmapPink',
    };
    const activeColor = themeColors[habit.theme];

    // 月份名称（国际化）
    const monthNames = [
        t('stats.jan'), t('stats.feb'), t('stats.mar'), t('stats.apr'),
        t('stats.may'), t('stats.jun'), t('stats.jul'), t('stats.aug'),
        t('stats.sep'), t('stats.oct'), t('stats.nov'), t('stats.dec')
    ];
    const weekDays = [
        t('stats.mon'), t('stats.tue'), t('stats.wed'),
        t('stats.thu'), t('stats.fri'), t('stats.sat'), t('stats.sun')
    ];
    const weekDaysShort = [t('stats.mon'), '', t('stats.wed'), '', t('stats.fri'), '', t('stats.sun')]; // 隔行显示

    // 当前显示月份的日历数据
    const calendarDays = getCalendarData(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        habit.history
    );

    // 切换月份
    const goToPrevMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        if (next <= new Date()) {
            setCurrentDate(next);
        }
    };

    // 格式化月份显示
    const formatMonthYear = (date: Date) => {
        return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    // 格子尺寸配置
    const cellSize = 12;
    const gap = 4;

    return (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-start p-6 pb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-800">{habit.title}</h2>
                        <span className="text-sm text-gray-500 bg-brand-cream px-2 py-1 rounded-lg font-serif italic">
                            {habit.timeLabel}
                        </span>
                        {/* 编辑按钮（示例数据不显示） */}
                        {onUpdateHabit && !habit.id.startsWith('example-') && (
                            <button
                                onClick={() => setShowEditModal(true)}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fa-solid fa-pen text-gray-400 text-sm"></i>
                            </button>
                        )}
                    </div>
                    {/* 关闭按钮 */}
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                        <i className="fa-solid fa-xmark text-gray-500"></i>
                    </button>
                </div>

                {/* Mini Heatmap - Scrollable with Fixed Weekday Column */}
                <div className="px-6 pb-4 flex gap-2">
                    {/* Fixed Weekday Labels */}
                    <div className="flex flex-col justify-between pt-5 pb-[2px] h-[128px] text-[9px] text-gray-400 shrink-0">
                        {weekDaysShort.map((day, i) => (
                            <span key={i} className="h-[12px] leading-[12px] flex items-center">{day}</span>
                        ))}
                    </div>

                    {/* Scrollable Grid Container */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-x-auto no-scrollbar"
                    >
                        <div className="min-w-max relative">
                            {/* Month Labels */}
                            <div className="relative h-5 w-full">
                                {monthLabels.map((label, i) => (
                                    <span
                                        key={i}
                                        className="absolute text-[10px] text-gray-400 transform -translate-x-1/2"
                                        style={{
                                            left: `${label.columnIndex * (cellSize + gap) + cellSize / 2}px`
                                        }}
                                    >
                                        {label.month}
                                    </span>
                                ))}
                            </div>

                            {/* Heatmap Grid */}
                            <div
                                className="grid grid-rows-7 grid-flow-col"
                                style={{ gap: `${gap}px` }}
                            >
                                {heatmapDays.map((day, i) => (
                                    <div
                                        key={i}
                                        title={day.date ? `${day.date.toLocaleDateString()}: ${day.level > 0 ? '✓' : '✗'}` : ''}
                                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                        className={`
                                            rounded-[3px] transition-all
                                            ${!day.date ? 'bg-transparent' : (day.level > 0 ? activeColor : 'bg-[#F0F0F0]')}
                                            ${day.isToday ? 'ring-2 ring-brand-goldBorder ring-offset-1 z-10' : ''}
                                        `}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Check-in Button */}
                <div className="flex justify-center py-4">
                    {isTodayDone ? (
                        /* 已完成状态 */
                        <div className="flex items-center gap-2 px-6 py-3 rounded-full text-lg font-semibold text-green-600 bg-green-50">
                            ✅ {t('stats.todayCompleted')}
                        </div>
                    ) : (
                        /* 未完成状态：打卡按钮 */
                        <button
                            onClick={() => onToggleDate(new Date())}
                            className="px-6 py-3 rounded-full text-lg font-semibold text-white transition-all duration-200 hover:scale-105 active:scale-95"
                            style={{
                                background: 'linear-gradient(135deg, #FFD966 0%, #E6A800 100%)',
                                boxShadow: '0 4px 12px rgba(230, 168, 0, 0.3)',
                            }}
                        >
                            {t('stats.startTodayTask')}
                        </button>
                    )}
                </div>

                {/* Calendar View */}
                <div className="px-6 pb-6">
                    {/* Week Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {weekDays.map(day => (
                            <div key={day} className="text-center text-xs text-gray-400 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, i) => (
                            <div
                                key={i}
                                onClick={() => {
                                    if (day.date !== null && !day.isFuture) {
                                        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day.date);
                                        onToggleDate(targetDate);
                                    }
                                }}
                                className={`
                                    aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors
                                    ${day.date === null ? '' : (day.isFuture ? 'cursor-default' : 'cursor-pointer')}
                                    ${day.isToday ? 'bg-brand-cream ring-2 ring-brand-goldBorder' : ''}
                                    ${day.isFuture ? 'text-gray-300' : 'text-gray-700'}
                                    ${!day.isToday && day.date !== null && !day.isFuture ? 'hover:bg-gray-100 active:bg-gray-200' : ''}
                                `}
                            >
                                {day.date !== null && (
                                    <>
                                        <span className={`font-medium ${day.isToday ? 'font-bold' : ''}`}>
                                            {day.date}
                                        </span>
                                        {day.isCompleted && !day.isFuture && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-goldBorder mt-0.5"></span>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Month Navigation */}
                    <div className="flex justify-between items-center mt-6">
                        <button
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                            onClick={() => setCurrentDate(new Date())}
                        >
                            <i className="fa-regular fa-calendar text-gray-500"></i>
                            <span className="text-sm text-gray-600">{formatMonthYear(currentDate)}</span>
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={goToPrevMonth}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fa-solid fa-chevron-left text-gray-500"></i>
                            </button>
                            <button
                                onClick={goToNextMonth}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fa-solid fa-chevron-right text-gray-500"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Task Modal */}
            {showEditModal && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
                    onClick={() => setShowEditModal(false)}
                >
                    {/* Semi-transparent backdrop */}
                    <div className="absolute inset-0 bg-black/50" />

                    {/* Modal content */}
                    <div
                        className="relative bg-white rounded-[32px] shadow-2xl w-[340px] p-6 border border-gray-100/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-gray-900 font-semibold text-lg">{t('home.editTask')}</h3>
                            {onDeleteHabit && (
                                <button
                                    onClick={() => {
                                        if (window.confirm(t('home.confirmDelete'))) {
                                            onDeleteHabit();
                                            setShowEditModal(false);
                                        }
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Task Name Input */}
                        <div className="mb-4">
                            <label className="text-gray-500 text-sm mb-2 block">{t('home.taskName')}</label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white text-gray-800"
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                            />
                        </div>

                        {/* Time Picker */}
                        <div className="mb-6">
                            <label className="text-gray-500 text-sm mb-2 block">{t('home.taskTime')}</label>
                            <TimePicker
                                timeValue={editTime}
                                onTimeChange={setEditTime}
                                dateValue={editDate}
                                onDateChange={setEditDate}
                                onClose={() => {}}
                                embedded
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={() => {
                                if (onUpdateHabit) {
                                    onUpdateHabit(editName, editTime);
                                }
                                setShowEditModal(false);
                            }}
                            className="w-full py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-brand-blue/90 transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeatmapDetailOverlay;
