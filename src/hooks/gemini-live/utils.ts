/**
 * Gemini Live Utility Functions
 */

/**
 * Convert base64 string to ArrayBuffer
 * Used for processing audio data from Gemini API
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if text content appears to be "thinking" output from Gemini 2.5
 * These are internal model reasoning that shouldn't be shown to users in production
 */
export function isThinkingContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('**')) return false;

  const thinkingKeywords = [
    // Chinese
    '查看', '分析', '考虑', '思考', '理解', '精炼', '编写', '构思', '方法',
    // English
    'Thinking', 'Analyzing', 'Considering', 'Processing', 'Evaluating'
  ];

  return thinkingKeywords.some(keyword => trimmed.includes(keyword));
}

/**
 * Create a deferred promise for async coordination
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Logging utilities - re-exported from shared devLog module
 */
export { devLog, devWarn, devError } from '../../utils/devLog';
