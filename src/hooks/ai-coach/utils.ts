/**
 * AI Coach Session - 工具函数
 *
 * 从 useAICoachSession.ts 提取的纯工具函数
 */

/**
 * 为 Promise 添加超时保护
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param errorMessage 超时错误信息
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * 过滤用户语音中的噪音
 * 检查文本是否包含有效的语音内容（至少包含一个字母或中文字符）
 */
export const isValidUserSpeech = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[^\w\u4e00-\u9fa5]+$/.test(trimmed)) return false;
  return true;
};
