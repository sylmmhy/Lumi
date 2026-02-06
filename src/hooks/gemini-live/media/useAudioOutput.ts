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
import {
  ensureAudioSessionReady,
  resetAudioSessionReady,
  waitForAudioSessionReady,
} from '../../../lib/native-audio-session';

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
  /** 并发锁：防止 camera/mic 的 toggle 并行调用 ensureReady 导致竞态 */
  const ensureReadyPromiseRef = useRef<Promise<AudioContext> | null>(null);

  /**
   * 带超时的 AudioContext.resume()
   * 防止 iOS WebKit 中 resume() 永远不返回的 bug
   * @param ctx - 要 resume 的 AudioContext
   * @param timeoutMs - 超时时间（毫秒）
   */
  const resumeWithTimeout = async (ctx: AudioContext, timeoutMs = 3000): Promise<void> => {
    return Promise.race([
      ctx.resume(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`AudioContext.resume() 超时 (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
  };

  /**
   * 创建新的 AudioContext 并绑定 AudioStreamer
   */
  const createAudioContext = (rate: number, completeCb?: () => void): AudioContext => {
    const ctx = new AudioContext({ sampleRate: rate });
    audioContextRef.current = ctx;
    streamerRef.current = new AudioStreamer(ctx);
    if (completeCb) {
      streamerRef.current.onComplete = completeCb;
    }
    return ctx;
  };

  /**
   * 确保 AudioContext 已准备就绪（内部实现，不含并发锁）。
   *
   * 三层防护 + 重试循环（最多 3 次）：
   * 1. 先等待 iOS 原生音频会话就绪（ensureAudioSessionReady）
   * 2. 创建 AudioContext 并 resume
   * 3. 失败时重置 stale flag → 实际等待 iOS 事件 → 重试
   */
  const ensureReadyInternal = async (): Promise<AudioContext> => {
    const startTime = performance.now();
    const MAX_ATTEMPTS = 3;
    devLog(`🔊 [ensureReady] 开始 | 现有 AudioContext 状态: ${audioContextRef.current?.state ?? 'null'}`);

    // 第 1 层防护：等待 iOS 音频会话就绪
    devLog('🔊 [ensureReady] 等待 iOS 音频会话就绪...');
    await ensureAudioSessionReady();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      devLog(`🔊 [ensureReady] 尝试 ${attempt}/${MAX_ATTEMPTS}`);

      // 创建 AudioContext（如果需要）
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        try {
          createAudioContext(sampleRate, onPlaybackComplete);
          devLog(`🔊 [ensureReady] AudioContext 创建完成, 状态: ${audioContextRef.current!.state}`);
        } catch (createErr) {
          console.error('🔊 [ensureReady] ❌ AudioContext 创建失败:', createErr);
          throw createErr;
        }
      }

      // 已经在运行，直接返回
      if (audioContextRef.current!.state === 'running') {
        const elapsed = performance.now() - startTime;
        devLog(`🔊 [ensureReady] 已在运行 - 耗时: ${elapsed.toFixed(1)}ms`);
        return audioContextRef.current!;
      }

      // 尝试 resume
      if (audioContextRef.current!.state === 'suspended') {
        devLog('🔊 [ensureReady] AudioContext.resume() 开始...');
        try {
          await resumeWithTimeout(audioContextRef.current!);
          devLog(`🔊 [ensureReady] AudioContext.resume() 完成, 状态: ${audioContextRef.current!.state}`);
          const elapsed = performance.now() - startTime;
          devLog(`🔊 [ensureReady] 结束 - 总耗时: ${elapsed.toFixed(1)}ms, 最终状态: ${audioContextRef.current!.state}`);
          return audioContextRef.current!;
        } catch (resumeErr) {
          console.warn(`🔊 [ensureReady] ⚠️ 尝试 ${attempt} resume() 失败:`, resumeErr);

          // 销毁破损的 AudioContext
          try {
            audioContextRef.current!.close();
          } catch { /* 忽略关闭错误 */ }
          audioContextRef.current = null;
          streamerRef.current = null;

          if (attempt < MAX_ATTEMPTS) {
            // 重置 stale flag，强制下次实际等待 iOS 事件
            resetAudioSessionReady();
            devLog(`🔊 [ensureReady] 已重置 audio session flag，等待 iOS 重新发送就绪事件...`);
            await waitForAudioSessionReady(3000);
          } else {
            const elapsed = performance.now() - startTime;
            console.error(`🔊 [ensureReady] ❌ ${MAX_ATTEMPTS} 次尝试均失败 - 总耗时: ${elapsed.toFixed(1)}ms`);
            throw resumeErr;
          }
        }
      }
    }

    // 理论上不会到这里，但 TypeScript 需要
    throw new Error('🔊 [ensureReady] 意外退出重试循环');
  };

  /**
   * 确保 AudioContext 已准备就绪（带并发锁）。
   * 必须在用户交互上下文中调用。
   *
   * camera 和 mic 的 toggleCamera/toggleMicrophone 可能并行调用此方法，
   * 使用共享 Promise ref 防止重入，第二个调用复用第一个的结果。
   */
  const ensureReady = useCallback(async (): Promise<AudioContext> => {
    // 并发锁：如果已有调用在进行中，复用其结果
    if (ensureReadyPromiseRef.current) {
      devLog('🔊 [ensureReady] 已有并发调用，复用其结果');
      return ensureReadyPromiseRef.current;
    }

    const promise = ensureReadyInternal().finally(() => {
      ensureReadyPromiseRef.current = null;
    });
    ensureReadyPromiseRef.current = promise;
    return promise;
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
