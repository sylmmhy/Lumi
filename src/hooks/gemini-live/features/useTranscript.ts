/**
 * useTranscript - 转录状态管理
 *
 * 职责：
 * - 管理用户输入和 AI 输出的转录文本
 * - 提供添加转录条目的方法
 * - 支持外部监听转录更新
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TranscriptEntry } from '../types';

interface UseTranscriptOptions {
  onUpdate?: (transcript: TranscriptEntry[]) => void;
}

interface UseTranscriptReturn {
  // State
  transcript: TranscriptEntry[];

  // Actions
  addUserEntry: (text: string) => void;
  addAssistantEntry: (text: string) => void;
  clear: () => void;

  // For external control
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
}

export function useTranscript(
  options: UseTranscriptOptions = {}
): UseTranscriptReturn {
  const { onUpdate } = options;

  // State
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Ref to track onUpdate callback
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  /**
   * 添加用户转录条目
   */
  const addUserEntry = useCallback((text: string) => {
    setTranscript((prev) => {
      const newTranscript = [...prev, { role: 'user' as const, text }];
      onUpdateRef.current?.(newTranscript);
      return newTranscript;
    });
  }, []);

  /**
   * 添加 AI 转录条目
   */
  const addAssistantEntry = useCallback((text: string) => {
    setTranscript((prev) => {
      const newTranscript = [...prev, { role: 'assistant' as const, text }];
      onUpdateRef.current?.(newTranscript);
      return newTranscript;
    });
  }, []);

  /**
   * 清空转录
   */
  const clear = useCallback(() => {
    setTranscript([]);
    onUpdateRef.current?.([]);
  }, []);

  return {
    // State
    transcript,

    // Actions
    addUserEntry,
    addAssistantEntry,
    clear,

    // For external control
    setTranscript,
  };
}
