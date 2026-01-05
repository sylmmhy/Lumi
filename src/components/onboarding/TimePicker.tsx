import { useState, useEffect, useRef, useCallback } from 'react';

interface TimePickerProps {
  value: string; // HH:mm format (24h)
  onChange: (time: string) => void;
}

/**
 * iOS 风格滚轮时间选择器
 */
export function TimePicker({ value, onChange }: TimePickerProps) {
  // 解析初始值
  const [hours24] = value.split(':').map(Number);
  const initialHour = hours24 % 12 || 12;
  const initialMinute = parseInt(value.split(':')[1], 10);
  const initialPeriod = hours24 >= 12 ? 'PM' : 'AM';

  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(initialPeriod);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const periods: ('AM' | 'PM')[] = ['AM', 'PM'];

  // 当选择变化时，通知父组件
  useEffect(() => {
    let hour24 = selectedHour;
    if (selectedPeriod === 'PM' && selectedHour !== 12) {
      hour24 = selectedHour + 12;
    } else if (selectedPeriod === 'AM' && selectedHour === 12) {
      hour24 = 0;
    }
    const timeString = `${String(hour24).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
    onChange(timeString);
  }, [selectedHour, selectedMinute, selectedPeriod, onChange]);

  return (
    <div className="flex justify-center items-center gap-2 py-4">
      {/* 小时 */}
      <WheelColumn
        items={hours}
        selectedValue={selectedHour}
        onChange={setSelectedHour}
        formatItem={(h) => String(h)}
      />

      <span className="text-2xl font-medium text-gray-400">:</span>

      {/* 分钟 */}
      <WheelColumn
        items={minutes}
        selectedValue={selectedMinute}
        onChange={setSelectedMinute}
        formatItem={(m) => String(m).padStart(2, '0')}
      />

      {/* AM/PM */}
      <WheelColumn
        items={periods}
        selectedValue={selectedPeriod}
        onChange={(p) => setSelectedPeriod(p as 'AM' | 'PM')}
        formatItem={(p) => p}
      />
    </div>
  );
}

interface WheelColumnProps<T> {
  items: T[];
  selectedValue: T;
  onChange: (value: T) => void;
  formatItem: (item: T) => string;
}

function WheelColumn<T>({ items, selectedValue, onChange, formatItem }: WheelColumnProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 44;
  const visibleItems = 5;

  const selectedIndex = items.indexOf(selectedValue);

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    if (containerRef.current) {
      const targetScroll = index * itemHeight;
      containerRef.current.scrollTo({
        top: targetScroll,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, [itemHeight]);

  // 初始滚动到选中项
  useEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, []);

  // 处理滚动结束
  const handleScrollEnd = useCallback(() => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const newIndex = Math.round(scrollTop / itemHeight);
      const clampedIndex = Math.max(0, Math.min(newIndex, items.length - 1));

      if (clampedIndex !== selectedIndex) {
        onChange(items[clampedIndex]);
      }

      // 对齐到最近的项
      scrollToIndex(clampedIndex);
    }
  }, [items, selectedIndex, onChange, scrollToIndex, itemHeight]);

  // 使用防抖处理滚动
  const scrollTimeoutRef = useRef<number | undefined>(undefined);
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(handleScrollEnd, 100);
  }, [handleScrollEnd]);

  return (
    <div className="relative">
      {/* 选中指示器 */}
      <div
        className="absolute left-0 right-0 pointer-events-none z-10"
        style={{
          top: itemHeight * Math.floor(visibleItems / 2),
          height: itemHeight,
        }}
      >
        <div className="h-full border-t-2 border-b-2 border-blue-600 bg-blue-50/30" />
      </div>

      {/* 渐变遮罩 */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-20" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20" />

      {/* 滚动容器 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto scrollbar-hide"
        style={{
          height: itemHeight * visibleItems,
          scrollSnapType: 'y mandatory',
        }}
      >
        {/* 顶部填充 */}
        <div style={{ height: itemHeight * Math.floor(visibleItems / 2) }} />

        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <div
              key={index}
              className={`
                flex items-center justify-center cursor-pointer
                transition-all duration-150
                ${isSelected ? 'text-blue-600 font-semibold' : 'text-gray-400'}
              `}
              style={{
                height: itemHeight,
                fontSize: isSelected ? '24px' : '20px',
                scrollSnapAlign: 'center',
              }}
              onClick={() => {
                onChange(item);
                scrollToIndex(index);
              }}
            >
              {formatItem(item)}
            </div>
          );
        })}

        {/* 底部填充 */}
        <div style={{ height: itemHeight * Math.floor(visibleItems / 2) }} />
      </div>
    </div>
  );
}
