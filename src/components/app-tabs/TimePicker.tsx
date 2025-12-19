import React, { useState, useEffect, useRef, useMemo } from 'react';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const parseTime = (str: string) => {
    const now = new Date();
    const [rawH, rawM] = str ? str.split(':').map(Number) : [now.getHours(), now.getMinutes()];
    const h = Number.isFinite(rawH) ? rawH : now.getHours();
    const m = Number.isFinite(rawM) ? rawM : now.getMinutes();

    const period = h >= 12 ? 'PM' : 'AM';
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;

    const minuteValue = Math.min(59, Math.max(0, Math.round(m)));
    const mStr = String(minuteValue).padStart(2, '0');
    return { h: String(hour12), m: mStr, p: period };
};

// --- Time Picker Components ---

const ScrollWheel = ({ items, value, onChange }: { items: string[], value: string, onChange: (val: string) => void }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);
    const isDraggingRef = useRef(false);
    const hasMovedRef = useRef(false);
    const startYRef = useRef(0);
    const startXRef = useRef(0);
    const startScrollTopRef = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const ITEM_HEIGHT = 40; // matches h-[40px] in tailwind

    // Initial scroll to selected value
    useEffect(() => {
        if (containerRef.current && !isScrollingRef.current && !isDraggingRef.current) {
            const idx = items.indexOf(value);
            if (idx !== -1) {
                containerRef.current.scrollTop = idx * ITEM_HEIGHT;
            }
        }
    }, [value, items]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isDraggingRef.current) return; // Skip logic if dragging manually

        isScrollingRef.current = true;
        const target = e.currentTarget as HTMLDivElement & { scrollTimeout?: NodeJS.Timeout };
        if (target.scrollTimeout) {
            clearTimeout(target.scrollTimeout);
        }
        const idx = Math.round(target.scrollTop / ITEM_HEIGHT);

        // Debounce the selection slightly or just check bounds
        if (items[idx] && items[idx] !== value) {
            onChange(items[idx]);
        }

        // Reset scrolling flag logic
        clearTimeout(target.scrollTimeout);
        target.scrollTimeout = setTimeout(() => {
            isScrollingRef.current = false;
        }, 150);
    };

    // Unified Drag Logic
    const handleDragStart = (clientY: number, clientX: number) => {
        if (!containerRef.current) return;
        isDraggingRef.current = true;
        hasMovedRef.current = false;
        setIsDragging(true);
        startYRef.current = clientY;
        startXRef.current = clientX;
        startScrollTopRef.current = containerRef.current.scrollTop;
    };

    const handleDragMove = (clientY: number, clientX: number) => {
        if (!isDraggingRef.current || !containerRef.current) return;

        const deltaY = startYRef.current - clientY;
        const deltaX = startXRef.current - clientX;

        // Mark as moved if delta is significant
        if (Math.abs(deltaY) > 2 || Math.abs(deltaX) > 2) {
            hasMovedRef.current = true;
        }

        // Combine vertical and horizontal deltas
        const totalDelta = deltaY + (deltaX * 0.8);
        containerRef.current.scrollTop = startScrollTopRef.current + totalDelta;
    };

    const handleDragEnd = () => {
        isDraggingRef.current = false;
        setIsDragging(false);

        // Snap to nearest item after drag
        if (containerRef.current) {
            const idx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT);
            containerRef.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
            if (items[idx]) {
                onChange(items[idx]);
            }
        }
    };

    // Mouse Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        handleDragStart(e.clientY, e.clientX);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        handleDragMove(e.clientY, e.clientX);
    };

    const handleMouseUp = () => {
        handleDragEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Touch Handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        handleDragStart(touch.clientY, touch.clientX);
        // Prevent default to stop native scrolling/zooming
        // e.preventDefault(); // Note: React's synthetic event might not support this if passive. 
        // We use touch-action: none in CSS instead.
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        handleDragMove(touch.clientY, touch.clientX);
        // e.preventDefault(); // handled by touch-action: none
    };

    const handleTouchEnd = () => {
        handleDragEnd();
    };

    // Cleanup listeners on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`h-[160px] overflow-y-auto overflow-x-hidden no-scrollbar relative w-20 text-center z-10 touch-none ${isDragging ? 'cursor-grabbing snap-none' : 'cursor-grab snap-y snap-mandatory'}`}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="h-[60px]"></div> {/* Padding to center first item */}
            {items.map((item) => (
                <div
                    key={item}
                    className={`h-[40px] flex items-center justify-center snap-center text-lg transition-all select-none ${item === value ? 'text-black font-bold scale-110' : 'text-gray-300 scale-90'}`}
                    onClick={() => {
                        if (isDraggingRef.current || hasMovedRef.current) return;
                        onChange(item);
                        const idx = items.indexOf(item);
                        containerRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
                    }}
                >
                    {item}
                </div>
            ))}
            <div className="h-[60px]"></div>
        </div>
    );
};

/**
 * TimePicker 组件的入参，负责绑定时间/日期的受控状态以及关闭行为。
 *
 * @property {string} timeValue - 当前的 24 小时制时间字符串，例如 "18:30"
 * @property {(val: string) => void} onTimeChange - 变更时间时的回调，向上层同步新时间
 * @property {Date} dateValue - 当前选中的日期对象
 * @property {(val: Date) => void} onDateChange - 变更日期时的回调，向上层同步新日期
 * @property {() => void} onClose - 关闭选择面板的回调
 */
export interface TimePickerProps {
    timeValue: string;
    onTimeChange: (val: string) => void;
    dateValue: Date;
    onDateChange: (val: Date) => void;
    onClose: () => void;
}

/**
 * 可滚动的时间/日期选择面板。
 * - 通过更高的 z-index 保证浮层位于底部导航之上。
 * - 以受控方式向上同步时间与日期，便于复用在 HomeView 等入口。
 *
 * @param {TimePickerProps} props - 组件的受控参数与关闭行为
 */
export const TimePicker = ({ timeValue, onTimeChange, dateValue, onDateChange, onClose }: TimePickerProps) => {
    const [mode, setMode] = useState<'time' | 'date'>('time');

    // --- Time Logic ---
    const hours = HOURS;
    const minutes = MINUTES;
    const periods = PERIODS;

    const [timeState, setTimeState] = useState(parseTime(timeValue));

    useEffect(() => {
        const parsed = parseTime(timeValue);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTimeState((prev) => (prev.h === parsed.h && prev.m === parsed.m && prev.p === parsed.p ? prev : parsed));
    }, [timeValue]);

    useEffect(() => {
        let h24 = parseInt(timeState.h);
        if (timeState.p === 'PM' && h24 !== 12) h24 += 12;
        if (timeState.p === 'AM' && h24 === 12) h24 = 0;

        const timeStr = `${String(h24).padStart(2, '0')}:${timeState.m}`;
        if (timeStr !== timeValue) {
            onTimeChange(timeStr);
        }
    }, [timeState, timeValue, onTimeChange]);

    // --- Date Logic ---
    const months = MONTHS;
    const days = DAYS;
    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 10 }, (_, i) => String(currentYear + i));
    }, []);

    const [dateState, setDateState] = useState({
        month: months[dateValue.getMonth()],
        day: String(dateValue.getDate()),
        year: String(dateValue.getFullYear())
    });

    useEffect(() => {
        const next = {
            month: months[dateValue.getMonth()],
            day: String(dateValue.getDate()),
            year: String(dateValue.getFullYear())
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDateState((prev) => (prev.month === next.month && prev.day === next.day && prev.year === next.year ? prev : next));
    }, [dateValue, months]);

    useEffect(() => {
        const mIdx = months.indexOf(dateState.month);
        const y = parseInt(dateState.year);
        // Handle days in month
        const maxDays = new Date(y, mIdx + 1, 0).getDate();
        let d = parseInt(dateState.day);
        if (d > maxDays) d = maxDays;

        const newDate = new Date(y, mIdx, d);
        if (newDate.getTime() !== dateValue.getTime()) {
            onDateChange(newDate);
        }
    }, [dateState, dateValue, onDateChange, months]);


    // Formatted strings for pills
    const formattedDate = dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = `${timeState.h}:${timeState.m} ${timeState.p}`;

    return (
        <div className="absolute top-full left-0 mt-4 bg-white rounded-[32px] shadow-2xl z-[160] w-[320px] p-6 animate-fade-in border border-gray-100/50">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
                <span className="text-gray-900 font-semibold text-lg">Starts</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMode('date')}
                        className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${mode === 'date' ? 'bg-brand-blue/10 text-brand-blue' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                        {formattedDate}
                    </button>
                    <button
                        onClick={() => setMode('time')}
                        className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${mode === 'time' ? 'bg-brand-blue/10 text-brand-blue' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                        {formattedTime}
                    </button>
                </div>
            </div>

            {/* Wheels Container */}
            <div className="relative flex justify-center gap-2 mask-gradient h-[160px]">
                {/* Center Highlight Bar */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-[36px] bg-gray-100/40 rounded-lg pointer-events-none z-0"></div>

                {mode === 'time' ? (
                    <div className="flex gap-4 z-10 w-full justify-center">
                        <ScrollWheel items={hours} value={timeState.h} onChange={(val) => setTimeState(s => ({ ...s, h: val }))} />
                        <ScrollWheel items={minutes} value={timeState.m} onChange={(val) => setTimeState(s => ({ ...s, m: val }))} />
                        <ScrollWheel items={periods} value={timeState.p} onChange={(val) => setTimeState(s => ({ ...s, p: val }))} />
                    </div>
                ) : (
                    <div className="flex gap-4 z-10 w-full justify-center">
                        <ScrollWheel items={months} value={dateState.month} onChange={(val) => setDateState(s => ({ ...s, month: val }))} />
                        <ScrollWheel items={days} value={dateState.day} onChange={(val) => setDateState(s => ({ ...s, day: val }))} />
                        <ScrollWheel items={years} value={dateState.year} onChange={(val) => setDateState(s => ({ ...s, year: val }))} />
                    </div>
                )}
            </div>

            <div className="mt-4 text-center">
                <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-sm">
                    <i className="fa-solid fa-chevron-up"></i>
                </button>
            </div>
        </div>
    );
};
