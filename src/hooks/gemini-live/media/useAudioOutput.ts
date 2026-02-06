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
import { ensureAudioSessionReady } from '../../../lib/native-audio-session';

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
   * 确保 AudioContext 已准备就绪
   * 必须在用户交互上下文中调用
   *
   * 两层防护：
   * 1. 先等待 iOS 原生音频会话就绪（ensureAudioSessionReady）
   * 2. 为 AudioContext.resume() 加超时，超时后销毁重建
   */
  const ensureReady = useCallback(async (): Promise<AudioContext> => {
    const startTime = performance.now();
    devLog(`🔊 [ensureReady] 开始 | 现有 AudioContext 状态: ${audioContextRef.current?.state ?? 'null'}`);

    // 第 1 层防护：等待 iOS 音频会话就绪
    // 解决密码解锁场景下 CallKit 还占用音频设备的问题
    devLog('🔊 [ensureReady] 等待 iOS 音频会话就绪...');
    await ensureAudioSessionReady();

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

    // 第 2 层防护：resume() 加超时 + 销毁重建
    if (audioContextRef.current!.state === 'suspended') {
      devLog('🔊 [ensureReady] AudioContext.resume() 开始...');
      try {
        await resumeWithTimeout(audioContextRef.current!);
        devLog(`🔊 [ensureReady] AudioContext.resume() 完成, 状态: ${audioContextRef.current!.state}`);
      } catch (resumeErr) {
        // resume() 失败或超时 → 销毁旧的，重建新的
        console.warn('🔊 [ensureReady] ⚠️ AudioContext.resume() 失败/超时，销毁重建...', resumeErr);
        try {
          audioContextRef.current!.close();
        } catch { /* 忽略关闭错误 */ }

        // 再次等待音频会话就绪（可能 iOS 端还在切换中）
        await ensureAudioSessionReady();

        // 重建 AudioContext
        createAudioContext(sampleRate, onPlaybackComplete);
        devLog(`🔊 [ensureReady] 重建 AudioContext, 状态: ${audioContextRef.current!.state}`);

        // 重试 resume
        if (audioContextRef.current!.state === 'suspended') {
          try {
            await resumeWithTimeout(audioContextRef.current!);
            devLog(`🔊 [ensureReady] 重建后 resume() 成功, 状态: ${audioContextRef.current!.state}`);
          } catch (retryErr) {
            console.error('🔊 [ensureReady] ❌ 重建后 resume() 仍然失败:', retryErr);
            throw retryErr;
          }
        }
      }
    }

    const totalElapsed = performance.now() - startTime;
    devLog(`🔊 [ensureReady] 结束 - 总耗时: ${totalElapsed.toFixed(1)}ms, 最终状态: ${audioContextRef.current!.state}`);

    return audioContextRef.current!;
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
