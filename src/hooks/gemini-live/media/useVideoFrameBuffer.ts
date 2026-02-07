/**
 * useVideoFrameBuffer - 视频帧环形缓冲区
 *
 * 保存最近 N 帧的 JPEG base64 数据，用于任务完成时的视觉验证。
 * 环形缓冲区自动丢弃最旧的帧，保持内存占用恒定。
 */

import { useRef, useCallback } from 'react';

interface UseVideoFrameBufferOptions {
  /** 缓冲区最大帧数，默认 10 */
  maxFrames?: number;
}

interface UseVideoFrameBufferReturn {
  /** 添加一帧到缓冲区 */
  addFrame: (base64Jpeg: string) => void;
  /** 获取最近 count 帧（最新的在最后） */
  getRecentFrames: (count?: number) => string[];
  /** 清空缓冲区 */
  clear: () => void;
  /** 当前缓冲区帧数 */
  frameCount: () => number;
}

/**
 * 视频帧环形缓冲区 Hook
 *
 * @example
 * ```ts
 * const frameBuffer = useVideoFrameBuffer({ maxFrames: 10 });
 *
 * // 在 onVideoFrame 回调中添加帧
 * onVideoFrame: (base64) => {
 *   frameBuffer.addFrame(base64);
 *   // 同时发送给 Gemini Live...
 * }
 *
 * // 任务完成时抓取最近 5 帧
 * const frames = frameBuffer.getRecentFrames(5);
 * ```
 */
export function useVideoFrameBuffer(
  options: UseVideoFrameBufferOptions = {}
): UseVideoFrameBufferReturn {
  const { maxFrames = 10 } = options;

  // 使用 ref 存储帧数据，避免频繁状态更新导致重渲染
  const bufferRef = useRef<string[]>([]);
  const writeIndexRef = useRef(0);
  const countRef = useRef(0);

  const addFrame = useCallback((base64Jpeg: string) => {
    const buffer = bufferRef.current;

    // 初始化或扩展缓冲区
    if (buffer.length < maxFrames) {
      buffer.push(base64Jpeg);
      countRef.current = buffer.length;
    } else {
      // 环形写入
      buffer[writeIndexRef.current] = base64Jpeg;
      countRef.current = maxFrames;
    }

    writeIndexRef.current = (writeIndexRef.current + 1) % maxFrames;
  }, [maxFrames]);

  const getRecentFrames = useCallback((count: number = 5): string[] => {
    const buffer = bufferRef.current;
    const totalFrames = countRef.current;

    if (totalFrames === 0) return [];

    const requestCount = Math.min(count, totalFrames);
    const result: string[] = [];

    if (buffer.length < maxFrames) {
      // 缓冲区还没满，直接从尾部取
      const startIdx = Math.max(0, buffer.length - requestCount);
      return buffer.slice(startIdx);
    }

    // 环形缓冲区：从 writeIndex 往前取
    for (let i = 0; i < requestCount; i++) {
      const idx = (writeIndexRef.current - requestCount + i + maxFrames) % maxFrames;
      result.push(buffer[idx]);
    }

    return result;
  }, [maxFrames]);

  const clear = useCallback(() => {
    bufferRef.current = [];
    writeIndexRef.current = 0;
    countRef.current = 0;
  }, []);

  const frameCount = useCallback(() => countRef.current, []);

  return {
    addFrame,
    getRecentFrames,
    clear,
    frameCount,
  };
}
