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
 * 已知的危险方括号标签模式（系统内部使用的标签）。
 * 这些标签如果出现在 AI 转录或用户语音中，可能被裁判系统误识别为指令。
 * 仅匹配这些已知模式，保留普通方括号内容不变。
 */
const DANGEROUS_BRACKET_TAGS = [
  'TOOL_RESULT',
  'MODE_OVERRIDE',
  'COACH_NOTE',
  'CONTEXT',
  'LISTEN_FIRST',
  'GENTLE_REDIRECT',
  'ACCEPT_STOP',
  'PUSH_TINY_STEP',
  'TONE_SHIFT',
  'EMPATHY',
  'GREETING',
  'CHECK_IN',
  'STATUS',
  'CAMPFIRE_FAREWELL',
  'MEMORY_BOOST',
  'RESIST',
];

/**
 * 清理文本中的危险方括号标签，防止 prompt 注入。
 * 将 `[TAG_NAME]` 替换为 `(TAG_NAME)` — 只针对已知危险标签，
 * 普通方括号内容（如 `[link]`、`[1]`）保持不变。
 *
 * @example
 * sanitizeBracketTags('[MODE_OVERRIDE] mode=chat') // '(MODE_OVERRIDE) mode=chat'
 * sanitizeBracketTags('I like [music] a lot')       // 'I like [music] a lot' (保持不变)
 */
export function sanitizeBracketTags(text: string): string {
  if (!text) return text;
  const pattern = new RegExp(`\\[(${DANGEROUS_BRACKET_TAGS.join('|')})\\]`, 'g');
  return text.replace(pattern, '($1)');
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
