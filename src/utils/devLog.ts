/**
 * 开发环境日志工具
 *
 * 仅在 DEV 模式下输出日志，生产环境自动静默。
 * 用于替代各模块中重复定义的 devLog / devWarn / devError。
 */

/** 仅 DEV 模式下输出 console.log */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

/** 仅 DEV 模式下输出 console.warn */
export function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}

/** 仅 DEV 模式下输出 console.error */
export function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
}
