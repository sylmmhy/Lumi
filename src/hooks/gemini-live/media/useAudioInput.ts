/**
 * useAudioInput - 麦克风录制管理
 *
 * 职责：
 * - 管理麦克风权限和设备
 * - 录制音频并转换为 base64 PCM
 * - 通过回调将音频数据发送出去
 *
 * 设计决策：
 * - 不直接依赖 session，通过 onAudioData 回调解耦
 * - 可以在连接建立前启用（用户手势上下文）
 */

import { useState, useRef, useCallback } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { devLog } from '../utils';

interface UseAudioInputOptions {
  sampleRate?: number;
  onAudioData?: (base64Audio: string) => void;
  onError?: (error: string) => void;
  onVolumeChange?: (volume: number) => void;
}

interface UseAudioInputReturn {
  // State
  isRecording: boolean;
  audioStream: MediaStream | null;
  error: string | null;

  // Actions
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;

  // Refs
  recorderRef: React.MutableRefObject<AudioRecorder | null>;
}

export function useAudioInput(
  options: UseAudioInputOptions = {}
): UseAudioInputReturn {
  const {
    sampleRate = 16000,
    onAudioData,
    onError,
    onVolumeChange
  } = options;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const recorderRef = useRef<AudioRecorder | null>(null);

  /**
   * 启动麦克风录制
   */
  const start = useCallback(async () => {
    try {
      if (!recorderRef.current) {
        recorderRef.current = new AudioRecorder(sampleRate);
      }

      // 设置音频数据回调
      recorderRef.current.on('data', (base64Audio: string) => {
        onAudioData?.(base64Audio);
      });

      // 设置音量回调（可选）
      if (onVolumeChange) {
        recorderRef.current.on('volume', onVolumeChange);
      }

      await recorderRef.current.start();
      setAudioStream(recorderRef.current.stream || null);
      setIsRecording(true);
      setError(null);

      devLog('🎤 Microphone started');
    } catch (err) {
      console.error('Microphone error:', err);
      recorderRef.current = null;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      let userFriendlyError: string;

      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        userFriendlyError = 'Microphone access denied. Please allow microphone access in Settings.';
      } else {
        userFriendlyError = `Microphone error: ${errorMessage}`;
      }

      setError(userFriendlyError);
      onError?.(userFriendlyError);
    }
  }, [sampleRate, onAudioData, onVolumeChange, onError]);

  /**
   * 停止麦克风录制
   */
  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setAudioStream(null);

    devLog('🎤 Microphone stopped');
  }, []);

  /**
   * 切换麦克风状态
   */
  const toggle = useCallback(async () => {
    if (isRecording) {
      stop();
    } else {
      await start();
    }
  }, [isRecording, start, stop]);

  return {
    // State
    isRecording,
    audioStream,
    error,

    // Actions
    start,
    stop,
    toggle,

    // Refs
    recorderRef,
  };
}
