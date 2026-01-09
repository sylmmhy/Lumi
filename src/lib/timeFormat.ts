/**
 * Time format utilities for Lumi
 *
 * Manages user preference for 12-hour or 24-hour time display format.
 */

const TIME_FORMAT_STORAGE_KEY = 'lumi_time_format';

export type TimeFormat = '12h' | '24h';

/**
 * Get the user's preferred time format
 * Default is '24h' (24-hour format)
 */
export function getTimeFormat(): TimeFormat {
  try {
    const stored = localStorage.getItem(TIME_FORMAT_STORAGE_KEY);
    if (stored === '12h' || stored === '24h') {
      return stored;
    }
    return '24h'; // Default to 24-hour format
  } catch {
    return '24h';
  }
}

/**
 * Check if user prefers 24-hour format
 */
export function is24HourFormat(): boolean {
  return getTimeFormat() === '24h';
}

/**
 * Set the user's preferred time format
 */
export function setTimeFormat(format: TimeFormat): void {
  try {
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, format);
  } catch (error) {
    console.error('Failed to save time format preference:', error);
  }
}

/**
 * Format a time string for display based on user preference
 * @param time24h - Time in 24-hour format (e.g., "14:30")
 * @param use24Hour - Override user preference (optional)
 * @returns Formatted time string (e.g., "14:30" or "2:30 PM")
 */
export function formatTimeDisplay(time24h: string, use24Hour?: boolean): string {
  const shouldUse24h = use24Hour ?? is24HourFormat();

  if (shouldUse24h) {
    return time24h;
  }

  // Convert to 12-hour format
  const [hourStr, minuteStr] = time24h.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr || '00';

  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return `${hour}:${minute} ${period}`;
}
