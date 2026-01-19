export const formatTime12h = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

/**
 * 任务时间段分类类型
 * - morning: 早上 (5:00-11:59)
 * - noon: 中午 (12:00-13:59)
 * - afternoon: 下午 (14:00-17:59)
 * - evening: 晚上 (18:00-22:59)
 * - latenight: 深夜 (23:00-4:59)
 */
export type TimeCategory = 'morning' | 'noon' | 'afternoon' | 'evening' | 'latenight';

/**
 * 根据小时数获取任务时间段分类
 *
 * 时间段划分规则：
 * - 0:00 - 4:59 → latenight (深夜)
 * - 5:00 - 11:59 → morning (早上)
 * - 12:00 - 13:59 → noon (中午)
 * - 14:00 - 17:59 → afternoon (下午)
 * - 18:00 - 22:59 → evening (晚上)
 * - 23:00 - 23:59 → latenight (深夜)
 *
 * @param hour - 24 小时制的小时数 (0-23)
 * @returns 对应的时间段分类
 *
 * @example
 * getCategoryFromHour(8)  // → 'morning'
 * getCategoryFromHour(13) // → 'noon'
 * getCategoryFromHour(16) // → 'afternoon'
 * getCategoryFromHour(20) // → 'evening'
 * getCategoryFromHour(2)  // → 'latenight'
 */
export function getCategoryFromHour(hour: number): TimeCategory {
    if (hour >= 0 && hour < 5) return 'latenight';
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'latenight';
}

/**
 * 根据时间字符串获取任务时间段分类
 *
 * @param timeStr - 24 小时制时间字符串，格式 "HH:mm" 或 "H:mm"
 * @returns 对应的时间段分类
 *
 * @example
 * getCategoryFromTimeString('08:30') // → 'morning'
 * getCategoryFromTimeString('13:00') // → 'noon'
 */
export function getCategoryFromTimeString(timeStr: string): TimeCategory {
    const [h] = timeStr.split(':').map(Number);
    return getCategoryFromHour(h);
}

/**
 * 获取时间段分类对应的 emoji 图标
 *
 * @param category - 时间段分类
 * @returns 对应的 emoji 图标
 *
 * @example
 * getTimeIcon('morning')   // → '☀️'
 * getTimeIcon('evening')   // → '🌙'
 */
export function getTimeIcon(category: TimeCategory): string {
    switch (category) {
        case 'morning': return '☀️';
        case 'noon': return '🌞';
        case 'afternoon': return '🌤️';
        case 'evening': return '🌙';
        case 'latenight': return '🌃';
        default: return '☀️';
    }
}

export const parseTimeToString = (timeStr: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h);
  date.setMinutes(m);
  return formatTime12h(date).toLowerCase();
};

/**
 * @deprecated 使用 getLocalDateString 代替，避免 UTC 时区问题
 */
export const formatDateKey = (date: Date) => {
    return date.toISOString().split('T')[0];
};

/**
 * 获取用户本地日期（YYYY-MM-DD 格式）
 * 使用本地时间而非 UTC，避免跨时区时日期不匹配的问题
 *
 * @param date - 要格式化的日期，默认为当前时间
 * @returns 格式为 YYYY-MM-DD 的本地日期字符串
 */
export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format a date string (YYYY-MM-DD) to display format like "Aug 11/2025"
 * Used for date separators in task lists
 * Returns "Tomorrow" if the date is tomorrow
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @returns Formatted date string like "Tomorrow" or "Aug 11/2025"
 */
export function formatDateForSeparator(dateStr: string): string {
    // Check if the date is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    if (dateStr === tomorrowStr) {
        return 'Tomorrow';
    }

    const date = new Date(dateStr + 'T00:00:00'); // Ensure local timezone parsing
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month} ${day}/${year}`;
}
