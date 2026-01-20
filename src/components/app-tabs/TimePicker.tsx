import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const parseTime12 = (str: string) => {
    const now = new Date();
    // 当没有传入时间时，默认使用当前时间 +1 分钟（便于调试）
    if (!str) {
        now.setMinutes(now.getMinutes() + 1);
    }
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
    // 当没有传入时间时，默认使用当前时间 +1 分钟（便于调试）
    if (!str) {
        now.setMinutes(now.getMinutes() + 1);
    }
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
    const isAnimatingRef = useRef(false); // 统一的动画/交互状态标记
    const isDraggingRef = useRef(false);
    const hasMovedRef = useRef(false);
    const startYRef = useRef(0);
    const startScrollTopRef = useRef(0);
    const isRepositioningRef = useRef(false);
    const animationRef = useRef<number | null>(null);
    const lastYRef = useRef(0);
    const lastTimeRef = useRef(0);
    const velocityRef = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const isInitializedRef = useRef(false); // 追踪是否已完成首次初始化
    // 初始化时直接计算正确的索引，避免首次渲染时的 fallback 逻辑
    const [currentIndex, setCurrentIndex] = useState(() => {
        const idx = items.indexOf(value);
        return idx !== -1 ? idx : 0;
    });
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

    /**
     * 计算给定 scrollTop 对应的原始数组索引
     * 处理循环模式下的索引映射
     */
    const getIndexFromScrollTop = useCallback((scrollTop: number) => {
        const rawIndex = Math.round(scrollTop / ITEM_HEIGHT);
        if (!loop) {
            return Math.max(0, Math.min(rawIndex, items.length - 1));
        }
        // 在循环模式下，将索引映射回原始数组范围
        let idx = rawIndex % items.length;
        if (idx < 0) idx += items.length;
        return idx;
    }, [items.length, loop]);

    /**
     * 更新当前索引状态（用于视觉高亮）
     * 内部做去重检查，避免不必要的重渲染
     */
    const updateCurrentIndex = useCallback(() => {
        if (!containerRef.current) return;
        const newIndex = getIndexFromScrollTop(containerRef.current.scrollTop);
        // 只有当索引变化时才更新状态，避免不必要的重渲染
        setCurrentIndex(prev => prev === newIndex ? prev : newIndex);
    }, [getIndexFromScrollTop]);

    // 首次挂载时使用 useLayoutEffect 确保 DOM 就绪后立即设置滚动位置
    // 这比 useEffect 更早执行，避免视觉闪烁
    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const idx = items.indexOf(value);
        if (idx !== -1) {
            const targetIdx = loop ? middleOffset + idx : idx;
            const targetScrollTop = targetIdx * ITEM_HEIGHT;

            // 首次初始化：强制设置位置，不受任何条件限制
            if (!isInitializedRef.current) {
                // 使用 requestAnimationFrame 确保 DOM 完全就绪
                requestAnimationFrame(() => {
                    if (containerRef.current) {
                        containerRef.current.scrollTop = targetScrollTop;
                        setCurrentIndex(idx);
                        isInitializedRef.current = true;
                    }
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 只在首次挂载时执行，后续 value 变化由下面的 useEffect 处理

    // 后续 value 变化时同步滚动位置（非首次挂载）
    useEffect(() => {
        // 跳过首次挂载（由 useLayoutEffect 处理）
        if (!isInitializedRef.current) return;

        if (containerRef.current && !isAnimatingRef.current && !isDraggingRef.current) {
            const idx = items.indexOf(value);
            if (idx !== -1) {
                const targetIdx = loop ? middleOffset + idx : idx;
                const targetScrollTop = targetIdx * ITEM_HEIGHT;
                // 只有当位置差异较大时才设置（避免用户滚动时的跳动）
                if (Math.abs(containerRef.current.scrollTop - targetScrollTop) > ITEM_HEIGHT / 2) {
                    containerRef.current.scrollTop = targetScrollTop;
                    setCurrentIndex(idx);
                }
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
     * 平滑滚动到目标位置并在结束时调用 onChange
     */
    const smoothScrollTo = useCallback((targetScrollTop: number, duration: number = 200, onComplete?: () => void) => {
        if (!containerRef.current) return;

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        const startScrollTop = containerRef.current.scrollTop;
        const distance = targetScrollTop - startScrollTop;

        // 如果距离很小，直接设置
        if (Math.abs(distance) < 1) {
            containerRef.current.scrollTop = targetScrollTop;
            isAnimatingRef.current = false;
            onComplete?.();
            return;
        }

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
                checkAndReposition();
                // 先调用 onComplete（设置 currentIndex 和 onChange），
                // 然后再设置 isAnimatingRef = false，避免后续 scroll 事件覆盖 currentIndex
                onComplete?.();
                // 使用 requestAnimationFrame 延迟重置，确保状态更新完成后再允许 scroll 更新
                requestAnimationFrame(() => {
                    isAnimatingRef.current = false;
                });
            }
        };

        isAnimatingRef.current = true;
        animationRef.current = requestAnimationFrame(animate);
    }, [checkAndReposition]);

    /**
     * 带惯性滚动并最终吸附到最近的选项
     */
    const animateWithMomentumAndSnap = useCallback((initialVelocity: number) => {
        if (!containerRef.current) return;

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        isAnimatingRef.current = true;

        // Physics constants
        const FRICTION = 0.92; // 摩擦系数
        const MIN_VELOCITY = 0.8; // 停止动画的速度阈值

        let velocity = initialVelocity;
        let lastFrameTime = performance.now();

        const animate = () => {
            if (!containerRef.current) {
                isAnimatingRef.current = false;
                return;
            }

            const currentTime = performance.now();
            const deltaTime = (currentTime - lastFrameTime) / 16.67; // Normalize to 60fps
            lastFrameTime = currentTime;

            // Apply friction to velocity
            velocity *= Math.pow(FRICTION, deltaTime);

            // Update scroll position
            containerRef.current.scrollTop += velocity * deltaTime;

            // Check for loop repositioning
            checkAndReposition();

            // Check if velocity is low enough to snap
            if (Math.abs(velocity) < MIN_VELOCITY) {
                // 计算最终目标位置并吸附
                const currentScrollTop = containerRef.current.scrollTop;
                const targetIdx = Math.round(currentScrollTop / ITEM_HEIGHT);
                const targetScrollTop = targetIdx * ITEM_HEIGHT;

                // 计算最终的值并调用 onChange
                let finalIdx = targetIdx;
                if (loop) {
                    finalIdx = finalIdx % items.length;
                    if (finalIdx < 0) finalIdx += items.length;
                }
                finalIdx = Math.max(0, Math.min(finalIdx, items.length - 1));

                // 平滑吸附到目标位置
                const distance = Math.abs(targetScrollTop - currentScrollTop);
                const snapDuration = Math.min(Math.max(distance * 2, 80), 150);

                smoothScrollTo(targetScrollTop, snapDuration, () => {
                    // 动画完成后更新 currentIndex 并调用 onChange
                    setCurrentIndex(finalIdx);
                    if (items[finalIdx] && items[finalIdx] !== value) {
                        onChange(items[finalIdx]);
                    }
                });
                return;
            }

            // 动画过程中实时更新 currentIndex
            updateCurrentIndex();

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
    }, [checkAndReposition, items, loop, onChange, smoothScrollTo, value, updateCurrentIndex]);

    /**
     * 直接吸附到最近的项目（无动量时使用）
     */
    const snapToNearest = useCallback(() => {
        if (!containerRef.current) return;

        const currentScrollTop = containerRef.current.scrollTop;
        const targetIdx = Math.round(currentScrollTop / ITEM_HEIGHT);
        const targetScrollTop = targetIdx * ITEM_HEIGHT;

        // 计算最终的值
        let idx = targetIdx;
        if (loop) {
            idx = idx % items.length;
            if (idx < 0) idx += items.length;
        }
        idx = Math.max(0, Math.min(idx, items.length - 1));

        // Calculate duration based on distance
        const distance = Math.abs(targetScrollTop - currentScrollTop);
        const duration = Math.min(Math.max(distance * 2, 80), 180);

        smoothScrollTo(targetScrollTop, duration, () => {
            // 动画完成后更新 currentIndex 并调用 onChange
            setCurrentIndex(idx);
            if (items[idx] && items[idx] !== value) {
                onChange(items[idx]);
            }
        });
    }, [items, loop, onChange, smoothScrollTo, value]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        // 在动画、拖拽或重定位期间，不要更新 currentIndex，避免覆盖已设置的值
        if (isDraggingRef.current || isRepositioningRef.current || isAnimatingRef.current) {
            return;
        }

        // 实时更新当前索引，确保视觉高亮与滚动位置同步
        updateCurrentIndex();

        const target = e.currentTarget as HTMLDivElement & { scrollTimeout?: NodeJS.Timeout };
        if (target.scrollTimeout) {
            clearTimeout(target.scrollTimeout);
        }

        // Reset scrolling flag and snap after scroll ends
        target.scrollTimeout = setTimeout(() => {
            snapToNearest();
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
        isAnimatingRef.current = false;

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

        // Calculate velocity with smoothing
        if (deltaTime > 0) {
            const instantVelocity = deltaY / deltaTime * 16; // Normalize to ~60fps
            // 平滑速度计算
            velocityRef.current = velocityRef.current * 0.7 + instantVelocity * 0.3;
        }

        lastYRef.current = clientY;
        lastTimeRef.current = currentTime;

        // Mark as moved if delta is significant
        const totalDelta = startYRef.current - clientY;
        if (Math.abs(totalDelta) > 3) {
            hasMovedRef.current = true;
        }

        containerRef.current.scrollTop = startScrollTopRef.current + totalDelta;

        // Check for loop repositioning during drag
        checkAndReposition();

        // 实时更新当前索引，确保拖拽时视觉高亮与滚动位置同步
        updateCurrentIndex();
    }, [checkAndReposition, updateCurrentIndex]);

    const handleDragEnd = useCallback(() => {
        if (!containerRef.current) return;

        isDraggingRef.current = false;
        setIsDragging(false);

        const velocity = velocityRef.current;

        // Apply momentum if velocity is significant
        if (Math.abs(velocity) > 3) {
            animateWithMomentumAndSnap(velocity);
        } else {
            // No significant velocity, just snap to nearest
            snapToNearest();
        }
    }, [animateWithMomentumAndSnap, snapToNearest]);

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
                // 计算当前元素对应的原始数组索引
                const originalIndex = loop ? index % items.length : index;
                // 基于滚动位置的 currentIndex 来判断是否选中
                // currentIndex 在初始化时就已计算好，确保视觉高亮与滚轮位置始终同步
                const isSelected = originalIndex === currentIndex;
                return (
                    <div
                        key={`${item}-${index}`}
                        className={`h-[40px] flex items-center justify-center text-lg transition-all duration-150 select-none ${isSelected ? 'text-black font-bold scale-110' : 'text-gray-300 scale-90'}`}
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
    /** 点击 OK 按钮时的确认回调（可选），如果提供则在点击 OK 时调用 */
    onConfirm?: () => void;
    /** 是否为重复提醒（routine）任务 */
    isRoutine?: boolean;
    /** 切换重复提醒选项的回调 */
    onRoutineChange?: (val: boolean) => void;
    /** 重复提醒复选框的标签文字 */
    routineLabel?: string;
    /** 设定重复提醒按钮文字 */
    confirmRoutineLabel?: string;
    /** 设定单次提醒按钮文字 */
    confirmOnceLabel?: string;
}

/**
 * 可滚动的时间/日期选择面板。
 * - 通过更高的 z-index 保证浮层位于底部导航之上。
 * - 以受控方式向上同步时间与日期，便于复用在 HomeView 等入口。
 *
 * @param {TimePickerProps} props - 组件的受控参数与关闭行为
 */
export const TimePicker = ({ timeValue, onTimeChange, dateValue, onDateChange, onClose, embedded = false, use24Hour = true, onConfirm, isRoutine, onRoutineChange, routineLabel, confirmRoutineLabel, confirmOnceLabel }: TimePickerProps) => {
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
                {/* Title */}
                <h2
                    className="text-brand-blue text-center text-lg mb-4"
                    style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 700 }}
                >
                    When should Lumi call?
                </h2>

                {pickerContent}

                {/* Routine Toggle Switch */}
                {onRoutineChange && (
                    <div
                        className="flex items-center justify-between mt-4 cursor-pointer select-none active:opacity-70 transition-opacity"
                        onClick={() => onRoutineChange(!isRoutine)}
                    >
                        <span className="text-gray-700 text-sm font-medium">{routineLabel || 'Routine task'}</span>
                        <div className="relative">
                            {/* Toggle track */}
                            <div className={`w-[52px] h-[32px] rounded-full transition-colors duration-200 ${isRoutine ? 'bg-brand-blue' : 'bg-gray-200'}`}></div>
                            {/* Toggle knob */}
                            <div className={`absolute top-[2px] left-[2px] w-[28px] h-[28px] bg-white rounded-full shadow-md transition-transform duration-200 ${isRoutine ? 'translate-x-[20px]' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <button
                        onClick={() => {
                            if (onConfirm) {
                                onConfirm();
                            }
                            onClose();
                        }}
                        className="w-full py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-brand-blue/90 transition-colors"
                    >
                        {isRoutine ? (confirmRoutineLabel || 'Set Recurring Reminder') : (confirmOnceLabel || 'Set One-time Reminder')}
                    </button>
                </div>
            </div>
        </div>
    );
};
