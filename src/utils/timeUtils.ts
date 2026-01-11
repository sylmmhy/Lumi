export const formatTime12h = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

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
