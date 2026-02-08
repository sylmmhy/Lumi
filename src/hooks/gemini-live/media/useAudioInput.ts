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
  const isStartingRef = useRef(false); // 防止并发启动

  /**
   * 启动麦克风录制
   * 添加幂等守卫：如果已在录制或正在启动中，直接返回
   */
  const start = useCallback(async () => {
    // 幂等守卫：已经在录制中
    if (isRecording) {
      devLog('🎤 Microphone already recording, skipping start');
      return;
    }

    // 幂等守卫：正在启动中（防止并发调用）
    if (isStartingRef.current) {
      devLog('🎤 Microphone start already in progress, skipping');
      return;
    }

    isStartingRef.current = true;

    let recorder: AudioRecorder | null = null;

    try {
      // 如果已有 recorder 实例，先清理旧的监听器；否则创建新实例。
      recorder = recorderRef.current;
      if (recorder) {
        recorder.removeAllListeners('data');
        recorder.removeAllListeners('volume');
      } else {
        recorder = new AudioRecorder(sampleRate);
        recorderRef.current = recorder;
      }

      // 设置音频数据回调
      recorder.on('data', (base64Audio: string) => {
        onAudioData?.(base64Audio);
      });

      // 设置音量回调（可选）
      if (onVolumeChange) {
        recorder.on('volume', onVolumeChange);
      }

      await recorder.start();

      // 并发保护：start 期间若被 stop/replace，这里不要再访问旧引用，避免空指针。
      if (recorderRef.current !== recorder) {
        recorder.stop();
        return;
      }

      setAudioStream(recorder.stream || null);
      setIsRecording(true);
      setError(null);

      devLog('🎤 Microphone started');
    } catch (err) {
      console.error('Microphone error:', err);
      if (recorderRef.current === recorder) {
        recorderRef.current = null;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      let userFriendlyError: string;

      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        userFriendlyError = 'Microphone access denied. Please allow microphone access in Settings.';
      } else {
        userFriendlyError = `Microphone error: ${errorMessage}`;
      }

      setError(userFriendlyError);
      onError?.(userFriendlyError);
    } finally {
      isStartingRef.current = false;
    }
  }, [isRecording, sampleRate, onAudioData, onVolumeChange, onError]);

  /**
   * 停止麦克风录制
   * 清理监听器防止内存泄漏
   */
  const stop = useCallback(() => {
    if (recorderRef.current) {
      // 先移除所有监听器，防止内存泄漏
      recorderRef.current.removeAllListeners('data');
      recorderRef.current.removeAllListeners('volume');
      recorderRef.current.stop();
      recorderRef.current = null;
    }
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
