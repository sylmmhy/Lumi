import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const parseTime12 = (str: string) => {
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

const parseTime24 = (str: string) => {
    const now = new Date();
    const [rawH, rawM] = str ? str.split(':').map(Number) : [now.getHours(), now.getMinutes()];
    const h = Number.isFinite(rawH) ? rawH : now.getHours();
    const m = Number.isFinite(rawM) ? rawM : now.getMinutes();

    const hourValue = Math.min(23, Math.max(0, h));
    const minuteValue = Math.min(59, Math.max(0, Math.round(m)));

    const hStr = String(hourValue).padStart(2, '0');
    const mStr = String(minuteValue).padStart(2, '0');
    return { h: hStr, m: mStr };
};

// --- Time Picker Components ---

interface ScrollWheelProps {
    items: string[];
    value: string;
    onChange: (val: string) => void;
    loop?: boolean; // Whether to enable infinite loop scrolling
}

const ScrollWheel = ({ items, value, onChange, loop = false }: ScrollWheelProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);
    const isDraggingRef = useRef(false);
    const hasMovedRef = useRef(false);
    const startYRef = useRef(0);
    const startScrollTopRef = useRef(0);
    const isRepositioningRef = useRef(false);
    const animationRef = useRef<number | null>(null);
    const velocityRef = useRef(0);
    const lastYRef = useRef(0);
    const lastTimeRef = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const ITEM_HEIGHT = 40; // matches h-[40px] in tailwind

    // For loop mode, we create 3 copies of items (before, original, after)
    const LOOP_COPIES = 3;
    const displayItems = useMemo(() => {
        if (!loop) return items;
        const result: string[] = [];
        for (let i = 0; i < LOOP_COPIES; i++) {
            result.push(...items);
        }
        return result;
    }, [items, loop]);

    // Get the starting offset for the middle copy
    const middleOffset = loop ? items.length : 0;
    const itemCount = items.length;

    // Initial scroll to selected value (in the middle copy for loop mode)
    useEffect(() => {
        if (containerRef.current && !isScrollingRef.current && !isDraggingRef.current) {
            const idx = items.indexOf(value);
            if (idx !== -1) {
                const targetIdx = loop ? middleOffset + idx : idx;
                containerRef.current.scrollTop = targetIdx * ITEM_HEIGHT;
            }
        }
    }, [value, items, loop, middleOffset]);

    /**
     * 循环滚动时校正滚动位置，避免滚动到头后出现跳动。
     */
    const checkAndReposition = useCallback(() => {
        if (!loop || !containerRef.current || isRepositioningRef.current) return;

        const scrollTop = containerRef.current.scrollTop;
        const totalHeight = itemCount * ITEM_HEIGHT;
        const middleStart = middleOffset * ITEM_HEIGHT;
        const middleEnd = middleStart + totalHeight;

        // If scrolled into first copy, jump to middle copy
        if (scrollTop < middleStart - ITEM_HEIGHT) {
            isRepositioningRef.current = true;
            containerRef.current.scrollTop = scrollTop + totalHeight;
            requestAnimationFrame(() => {
                isRepositioningRef.current = false;
            });
        }
        // If scrolled into last copy, jump to middle copy
        else if (scrollTop >= middleEnd) {
            isRepositioningRef.current = true;
            containerRef.current.scrollTop = scrollTop - totalHeight;
            requestAnimationFrame(() => {
                isRepositioningRef.current = false;
            });
        }
    }, [itemCount, loop, middleOffset]);

    /**
     * 平滑滚动动画到目标位置
     */
    const smoothScrollTo = useCallback((targetScrollTop: number, duration: number = 300) => {
        if (!containerRef.current) return;

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        const startScrollTop = containerRef.current.scrollTop;
        const distance = targetScrollTop - startScrollTop;
        const startTime = performance.now();

        // Easing function: easeOutCubic for smooth deceleration
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const animate = (currentTime: number) => {
            if (!containerRef.current) return;

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);

            containerRef.current.scrollTop = startScrollTop + distance * easedProgress;

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                animationRef.current = null;
                isScrollingRef.current = false;
                checkAndReposition();
            }
        };

        isScrollingRef.current = true;
        animationRef.current = requestAnimationFrame(animate);
    }, [checkAndReposition]);

    /**
     * 精确对齐到最近的项目
     */
    const snapToNearest = useCallback((withMomentum: boolean = false) => {
        if (!containerRef.current) return;

        let targetScrollTop: number;
        const currentScrollTop = containerRef.current.scrollTop;

        if (withMomentum && Math.abs(velocityRef.current) > 0.5) {
            // Apply momentum: project where we'll end up based on velocity
            const momentumDistance = velocityRef.current * 8; // Momentum multiplier
            const projectedScrollTop = currentScrollTop + momentumDistance;
            const targetIdx = Math.round(projectedScrollTop / ITEM_HEIGHT);
            targetScrollTop = targetIdx * ITEM_HEIGHT;
        } else {
            // Simple snap to nearest
            const targetIdx = Math.round(currentScrollTop / ITEM_HEIGHT);
            targetScrollTop = targetIdx * ITEM_HEIGHT;
        }

        // Calculate duration based on distance
        const distance = Math.abs(targetScrollTop - currentScrollTop);
        const duration = Math.min(Math.max(distance * 2, 150), 400);

        smoothScrollTo(targetScrollTop, duration);

        // Update value
        let idx = Math.round(targetScrollTop / ITEM_HEIGHT);
        if (loop) {
            idx = idx % items.length;
            if (idx < 0) idx += items.length;
        }

        if (items[idx] && items[idx] !== value) {
            onChange(items[idx]);
        }
    }, [items, loop, onChange, smoothScrollTo, value]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isDraggingRef.current || isRepositioningRef.current || animationRef.current) return;

        isScrollingRef.current = true;
        const target = e.currentTarget as HTMLDivElement & { scrollTimeout?: NodeJS.Timeout };
        if (target.scrollTimeout) {
            clearTimeout(target.scrollTimeout);
        }

        const scrollTop = target.scrollTop;
        let idx = Math.round(scrollTop / ITEM_HEIGHT);

        // For loop mode, map back to original items
        if (loop) {
            idx = idx % items.length;
            if (idx < 0) idx += items.length;
        }

        if (items[idx] && items[idx] !== value) {
            onChange(items[idx]);
        }

        // Reset scrolling flag and snap after scroll ends
        target.scrollTimeout = setTimeout(() => {
            isScrollingRef.current = false;
            snapToNearest(false);
        }, 100);
    };

    // Unified Drag Logic
    const handleDragStart = useCallback((clientY: number) => {
        if (!containerRef.current) return;

        // Cancel any ongoing animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        isDraggingRef.current = true;
        hasMovedRef.current = false;
        setIsDragging(true);
        startYRef.current = clientY;
        lastYRef.current = clientY;
        lastTimeRef.current = performance.now();
        velocityRef.current = 0;
        startScrollTopRef.current = containerRef.current.scrollTop;
    }, []);

    const handleDragMove = useCallback((clientY: number) => {
        if (!isDraggingRef.current || !containerRef.current) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - lastTimeRef.current;
        const deltaY = lastYRef.current - clientY;

        // Calculate velocity (pixels per millisecond)
        if (deltaTime > 0) {
            velocityRef.current = deltaY / deltaTime * 16; // Normalize to ~60fps
        }

        lastYRef.current = clientY;
        lastTimeRef.current = currentTime;

        // Mark as moved if delta is significant
        const totalDelta = startYRef.current - clientY;
        if (Math.abs(totalDelta) > 3) {
            hasMovedRef.current = true;
        }

        containerRef.current.scrollTop = startScrollTopRef.current + totalDelta;
    }, []);

    const handleDragEnd = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);

        // Snap to nearest item with momentum
        snapToNearest(true);
    }, [snapToNearest]);

    // Mouse Handlers
    const handleMouseMove = useCallback((e: MouseEvent) => {
        handleDragMove(e.clientY);
    }, [handleDragMove]);

    const handleMouseUp = useCallback(() => {
        handleDragEnd();
        document.removeEventListener('mousemove', handleMouseMove);
    }, [handleDragEnd, handleMouseMove]);

    const handleMouseDown = (e: React.MouseEvent) => {
        handleDragStart(e.clientY);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp, { once: true });
        e.preventDefault();
    };

    // Touch Handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        handleDragStart(touch.clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        handleDragMove(touch.clientY);
    };

    const handleTouchEnd = () => {
        handleDragEnd();
    };

    // Cleanup listeners on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div
            ref={containerRef}
            className={`h-[160px] overflow-y-auto overflow-x-hidden no-scrollbar relative w-20 text-center z-10 touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="h-[60px]"></div> {/* Padding to center first item */}
            {displayItems.map((item, index) => {
                const isSelected = item === value;
                return (
                    <div
                        key={`${item}-${index}`}
                        className={`h-[40px] flex items-center justify-center text-lg transition-all duration-150 select-none ${isSelected ? 'text-black font-bold scale-110' : 'text-gray-300 scale-90'}`}
                        onClick={() => {
                            if (isDraggingRef.current || hasMovedRef.current) return;
                            onChange(item);
                            // Smooth scroll to this item
                            smoothScrollTo(index * ITEM_HEIGHT, 250);
                        }}
                    >
                        {item}
                    </div>
                );
            })}
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
 * @property {boolean} embedded - 是否为嵌入模式（不显示遮罩层和关闭按钮）
 * @property {boolean} use24Hour - 是否使用24小时制显示（默认 true）
 */
export interface TimePickerProps {
    timeValue: string;
    onTimeChange: (val: string) => void;
    dateValue: Date;
    onDateChange: (val: Date) => void;
    onClose: () => void;
    embedded?: boolean;
    use24Hour?: boolean;
}

/**
 * 可滚动的时间/日期选择面板。
 * - 通过更高的 z-index 保证浮层位于底部导航之上。
 * - 以受控方式向上同步时间与日期，便于复用在 HomeView 等入口。
 *
 * @param {TimePickerProps} props - 组件的受控参数与关闭行为
 */
export const TimePicker = ({ timeValue, onTimeChange, dateValue, onDateChange, onClose, embedded = false, use24Hour = true }: TimePickerProps) => {
    const [mode, setMode] = useState<'time' | 'date'>('time');

    // --- Time Logic ---
    const hours = use24Hour ? HOURS_24 : HOURS_12;
    const minutes = MINUTES;
    const periods = PERIODS;

    // State for 12-hour mode: { h, m, p }
    // State for 24-hour mode: { h, m }
    const [timeState12, setTimeState12] = useState(parseTime12(timeValue));
    const [timeState24, setTimeState24] = useState(parseTime24(timeValue));

    // Sync from parent timeValue (12-hour mode)
    useEffect(() => {
        if (!use24Hour) {
            const parsed = parseTime12(timeValue);
            setTimeState12((prev) => (prev.h === parsed.h && prev.m === parsed.m && prev.p === parsed.p ? prev : parsed));
        }
    }, [timeValue, use24Hour]);

    // Sync from parent timeValue (24-hour mode)
    useEffect(() => {
        if (use24Hour) {
            const parsed = parseTime24(timeValue);
            setTimeState24((prev) => (prev.h === parsed.h && prev.m === parsed.m ? prev : parsed));
        }
    }, [timeValue, use24Hour]);

    // Sync to parent (12-hour mode)
    useEffect(() => {
        if (!use24Hour) {
            let h24 = parseInt(timeState12.h);
            if (timeState12.p === 'PM' && h24 !== 12) h24 += 12;
            if (timeState12.p === 'AM' && h24 === 12) h24 = 0;

            const timeStr = `${String(h24).padStart(2, '0')}:${timeState12.m}`;
            if (timeStr !== timeValue) {
                onTimeChange(timeStr);
            }
        }
    }, [timeState12, timeValue, onTimeChange, use24Hour]);

    // Sync to parent (24-hour mode)
    useEffect(() => {
        if (use24Hour) {
            const timeStr = `${timeState24.h}:${timeState24.m}`;
            if (timeStr !== timeValue) {
                onTimeChange(timeStr);
            }
        }
    }, [timeState24, timeValue, onTimeChange, use24Hour]);

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
    const formattedTime = use24Hour
        ? `${timeState24.h}:${timeState24.m}`
        : `${timeState12.h}:${timeState12.m} ${timeState12.p}`;

    // Content that's shared between embedded and modal modes
    const pickerContent = (
        <>
            {/* Header */}
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
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
                    use24Hour ? (
                        <div className="flex gap-4 z-10 w-full justify-center">
                            <ScrollWheel items={hours} value={timeState24.h} onChange={(val) => setTimeState24(s => ({ ...s, h: val }))} loop />
                            <ScrollWheel items={minutes} value={timeState24.m} onChange={(val) => setTimeState24(s => ({ ...s, m: val }))} loop />
                        </div>
                    ) : (
                        <div className="flex gap-4 z-10 w-full justify-center">
                            <ScrollWheel items={hours} value={timeState12.h} onChange={(val) => setTimeState12(s => ({ ...s, h: val }))} loop />
                            <ScrollWheel items={minutes} value={timeState12.m} onChange={(val) => setTimeState12(s => ({ ...s, m: val }))} loop />
                            <ScrollWheel items={periods} value={timeState12.p} onChange={(val) => setTimeState12(s => ({ ...s, p: val }))} />
                        </div>
                    )
                ) : (
                    <div className="flex gap-4 z-10 w-full justify-center">
                        <ScrollWheel items={months} value={dateState.month} onChange={(val) => setDateState(s => ({ ...s, month: val }))} loop />
                        <ScrollWheel items={days} value={dateState.day} onChange={(val) => setDateState(s => ({ ...s, day: val }))} loop />
                        <ScrollWheel items={years} value={dateState.year} onChange={(val) => setDateState(s => ({ ...s, year: val }))} />
                    </div>
                )}
            </div>
        </>
    );

    // Embedded mode: just return the content without modal wrapper
    if (embedded) {
        return <div className="w-full">{pickerContent}</div>;
    }

    // Modal mode: wrap in modal
    return (
        <div
            className="fixed inset-0 z-[160] flex items-center justify-center animate-fade-in"
            onClick={onClose}
        >
            {/* Semi-transparent backdrop */}
            <div className="absolute inset-0 bg-gray-500/40" />

            {/* Modal content */}
            <div
                className="relative bg-white rounded-[32px] shadow-2xl w-[320px] p-6 border border-gray-100/50"
                onClick={(e) => e.stopPropagation()}
            >
                {pickerContent}

                <div className="mt-6">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-brand-blue/90 transition-colors"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};
