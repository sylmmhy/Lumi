import React from 'react';
import { getLocalDateString } from '../../utils/timeUtils';

/**
 * RoutineHeatmap 组件
 * 显示 Routine 任务的完成历史，类似 GitHub 贡献日历
 * 
 * @param taskId - 任务 ID
 * @param completedDates - 已完成的日期集合 (Set<'YYYY-MM-DD'>)
 * @param startDate - 任务创建日期
 */
export interface RoutineHeatmapProps {
  taskId: string;
  completedDates: Set<string>;
  startDate: Date; // 任务创建日期
}

/**
 * 获取日期对应的颜色（循环：黄→蓝→红）
 * 颜色与任务无关，只与日期的序号有关
 */
function getColorForDayIndex(dayIndex: number): string {
  const colors = [
    'bg-[#D4AF37]', // 金黄色
    'bg-[#A3C4D9]', // 淡蓝色
    'bg-[#E89B9B]', // 淡红色
  ];
  return colors[dayIndex % 3];
}

/**
 * 生成从开始日期到今天的所有日期
 */
function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 按月份分组日期
 */
function groupDatesByMonth(dates: Date[]): Map<string, Date[]> {
  const grouped = new Map<string, Date[]>();

  for (const date of dates) {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, []);
    }
    grouped.get(monthKey)!.push(date);
  }

  return grouped;
}

/**
 * 获取月份的英文缩写
 */
function getMonthAbbr(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month];
}

/**
 * 按星期几分组日期（用于显示成 7 行）
 */
function groupDatesByWeekday(dates: Date[]): Date[][] {
  const rows: Date[][] = [[], [], [], [], [], [], []]; // Mon-Sun

  for (const date of dates) {
    const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
    // 转换为 Monday = 0, Sunday = 6
    const rowIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    rows[rowIndex].push(date);
  }

  return rows;
}

/**
 * 例行打卡热力图组件，按周排列任务完成记录。
 *
 * @param {RoutineHeatmapProps} props - 包含完成日期集合与起始日期
 * @returns {JSX.Element} 渲染后的热力图
 */
export const RoutineHeatmap: React.FC<RoutineHeatmapProps> = ({
  completedDates,
  startDate,
}) => {
  // 生成从开始日期到今天的所有日期
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allDates = generateDateRange(startDate, today);

  // 按月份分组
  const datesByMonth = groupDatesByMonth(allDates);

  // 计算总天数（用于颜色循环）
  let totalDayIndex = 0;

  return (
    <div className="bg-white rounded-2xl p-4 mt-3">
      {/* 月份标题行 */}
      <div className="flex gap-1 mb-2">
        {Array.from(datesByMonth.keys()).map((monthKey) => {
          const month = monthKey.split('-')[1];
          const monthDates = datesByMonth.get(monthKey)!;
          const weeksInMonth = Math.ceil(monthDates.length / 7);
          
          return (
            <div 
              key={monthKey} 
              className="flex flex-col items-center"
              style={{ width: `${weeksInMonth * 12}px` }}
            >
              <span className="text-[10px] text-gray-500 font-medium mb-1">
                {getMonthAbbr(parseInt(month) - 1)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 日期格子 - 7 行（Mon-Sun）*/}
      <div className="relative">
        {/* 星期标签 */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-1 text-[9px] text-gray-400">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>

        {/* 格子区域 */}
        <div className="ml-8">
          <div className="flex gap-1">
            {Array.from(datesByMonth.keys()).map((monthKey) => {
              const monthDates = datesByMonth.get(monthKey)!;
              const rows = groupDatesByWeekday(monthDates);

              return (
                <div key={monthKey} className="flex flex-col gap-1">
                  {rows.map((rowDates, rowIndex) => (
                    <div key={rowIndex} className="flex gap-1">
                      {rowDates.map((date) => {
                        const dateStr = getLocalDateString(date);
                        const isCompleted = completedDates.has(dateStr);
                        const colorClass = getColorForDayIndex(totalDayIndex++);

                        return (
                          <div
                            key={dateStr}
                            className={`
                              w-2 h-2 rounded-[2px] transition-all duration-200
                              ${isCompleted ? colorClass : 'bg-gray-200'}
                            `}
                            title={`${dateStr}${isCompleted ? ' ✓' : ''}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
