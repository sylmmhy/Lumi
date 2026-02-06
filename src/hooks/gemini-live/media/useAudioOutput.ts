/**
 * useAudioOutput - 音频输出播放管理
 *
 * 职责：
 * - 管理 AudioContext 生命周期
 * - 播放来自 Gemini 的 PCM 音频
 * - 处理打断（停止播放）
 *
 * 设计决策：
 * - AudioContext 必须在用户交互上下文中创建
 * - 提供 ensureReady 方法用于预初始化
 */

import { useState, useRef, useCallback } from 'react';
import { AudioStreamer } from '../../../lib/audio-streamer';
import { base64ToArrayBuffer, devLog } from '../utils';

interface UseAudioOutputOptions {
  sampleRate?: number;
  onPlaybackComplete?: () => void;
}

interface UseAudioOutputReturn {
  // State
  isSpeaking: boolean;

  // Actions
  ensureReady: () => Promise<AudioContext>;
  playAudio: (base64Data: string) => void;
  stop: () => void;
  markTurnComplete: () => void;  // 标记轮次完成（只设置状态，不停止播放）
  cleanup: () => void;

  // Refs
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  streamerRef: React.MutableRefObject<AudioStreamer | null>;
}

export function useAudioOutput(
  options: UseAudioOutputOptions = {}
): UseAudioOutputReturn {
  const { sampleRate = 24000, onPlaybackComplete } = options;

  // State
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);

  /**
   * 确保 AudioContext 已准备就绪
   * 必须在用户交互上下文中调用
   */
  const ensureReady = useCallback(async (): Promise<AudioContext> => {
    const startTime = performance.now();
    console.log(`🔊 [ensureReady] 开始 | 现有 AudioContext 状态: ${audioContextRef.current?.state ?? 'null'}`);

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        const createStart = performance.now();
        audioContextRef.current = new AudioContext({ sampleRate });
        console.log(`🔊 [ensureReady] AudioContext 创建完成 - 耗时: ${(performance.now() - createStart).toFixed(1)}ms, 状态: ${audioContextRef.current.state}`);
      } catch (createErr) {
        console.error('🔊 [ensureReady] ❌ AudioContext 创建失败:', createErr);
        throw createErr;
      }
      streamerRef.current = new AudioStreamer(audioContextRef.current);

      if (onPlaybackComplete) {
        streamerRef.current.onComplete = onPlaybackComplete;
      }
    }

    if (audioContextRef.current.state === 'suspended') {
      const resumeStart = performance.now();
      console.log('🔊 [ensureReady] AudioContext.resume() 开始...');
      try {
        await audioContextRef.current.resume();
        console.log(`🔊 [ensureReady] AudioContext.resume() 完成 - 耗时: ${(performance.now() - resumeStart).toFixed(1)}ms, 状态: ${audioContextRef.current.state}`);
      } catch (resumeErr) {
        console.error(`🔊 [ensureReady] ❌ AudioContext.resume() 失败 - 耗时: ${(performance.now() - resumeStart).toFixed(1)}ms, 错误:`, resumeErr);
        throw resumeErr;
      }
    }

    const totalElapsed = performance.now() - startTime;
    console.log(`🔊 [ensureReady] 结束 - 总耗时: ${totalElapsed.toFixed(1)}ms, 最终状态: ${audioContextRef.current.state}`);

    return audioContextRef.current;
  }, [sampleRate, onPlaybackComplete]);

  /**
   * 播放 base64 编码的 PCM 音频
   */
  const playAudio = useCallback((base64Data: string) => {
    if (!streamerRef.current || !audioContextRef.current) {
      devLog('⚠️ AudioContext not ready, cannot play audio');
      return;
    }

    if (audioContextRef.current.state === 'closed') {
      devLog('⚠️ AudioContext is closed, cannot play audio');
      return;
    }

    setIsSpeaking(true);
    const arrayBuffer = base64ToArrayBuffer(base64Data);
    streamerRef.current.addPCM16(new Uint8Array(arrayBuffer));
  }, []);

  /**
   * 停止播放（用于打断）
   */
  const stop = useCallback(() => {
    streamerRef.current?.stop();
    setIsSpeaking(false);
  }, []);

  /**
   * 标记轮次完成（只设置状态，不停止播放）
   * 当 Gemini 发送 turnComplete 时调用
   */
  const markTurnComplete = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  /**
   * 清理资源
   */
  const cleanup = useCallback(() => {
    // 停止播放
    streamerRef.current?.stop();
    streamerRef.current = null;

    // 关闭 AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      devLog('🔊 AudioContext closed');
    }
    audioContextRef.current = null;

    setIsSpeaking(false);
  }, []);

  return {
    // State
    isSpeaking,

    // Actions
    ensureReady,
    playAudio,
    stop,
    markTurnComplete,
    cleanup,

    // Refs
    audioContextRef,
    streamerRef,
  };
}
