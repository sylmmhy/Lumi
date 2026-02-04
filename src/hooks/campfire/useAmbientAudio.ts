/**
 * useAmbientAudio - 环境音控制 Hook
 * 
 * 功能：
 * - 播放/暂停白噪音（篝火声）
 * - 音量淡入淡出
 * - AI 说话时自动降低音量
 */

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseAmbientAudioOptions {
  /** 音频文件路径 */
  audioSrc?: string;
  /** 正常音量 (0-1) */
  normalVolume?: number;
  /** AI 说话时的音量 (0-1) */
  duckedVolume?: number;
  /** 淡入淡出时长 (ms) */
  fadeDuration?: number;
  /** 是否循环播放 */
  loop?: boolean;
}

interface UseAmbientAudioReturn {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 当前音量 */
  currentVolume: number;
  /** 开始播放 */
  play: () => void;
  /** 停止播放 */
  stop: () => void;
  /** 切换播放状态 */
  toggle: () => void;
  /** 设置是否 duck（AI 说话时降低音量） */
  setDucked: (ducked: boolean) => void;
}

export function useAmbientAudio(options: UseAmbientAudioOptions = {}): UseAmbientAudioReturn {
  const {
    audioSrc = '/campfire-sound.mp3',
    normalVolume = 0.6,
    duckedVolume = 0.15,
    fadeDuration = 500,
    loop = true,
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isDucked, setIsDucked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const targetVolumeRef = useRef(normalVolume);

  // 清除淡入淡出定时器
  const clearFadeInterval = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  // 淡入淡出到目标音量
  const fadeToVolume = useCallback((targetVolume: number, duration: number = fadeDuration) => {
    if (!audioRef.current) return;

    clearFadeInterval();

    const audio = audioRef.current;
    const startVolume = audio.volume;
    const volumeDiff = targetVolume - startVolume;
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = volumeDiff / steps;
    let currentStep = 0;

    targetVolumeRef.current = targetVolume;

    fadeIntervalRef.current = window.setInterval(() => {
      currentStep++;
      const newVolume = Math.max(0, Math.min(1, startVolume + volumeStep * currentStep));
      
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
        setCurrentVolume(newVolume);
      }

      if (currentStep >= steps) {
        clearFadeInterval();
        if (audioRef.current) {
          audioRef.current.volume = targetVolume;
          setCurrentVolume(targetVolume);
        }
      }
    }, stepDuration);
  }, [fadeDuration, clearFadeInterval]);

  // 播放
  const play = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioSrc);
      audioRef.current.loop = loop;
      audioRef.current.volume = 0;
    }

    const audio = audioRef.current;
    
    audio.play().then(() => {
      setIsPlaying(true);
      fadeToVolume(isDucked ? duckedVolume : normalVolume);
    }).catch(err => {
      console.error('Failed to play ambient audio:', err);
    });
  }, [audioSrc, loop, isDucked, normalVolume, duckedVolume, fadeToVolume]);

  // 停止
  const stop = useCallback(() => {
    if (!audioRef.current) return;

    fadeToVolume(0, fadeDuration);

    // 淡出完成后暂停
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }, fadeDuration);
  }, [fadeDuration, fadeToVolume]);

  // 切换
  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  // 设置 duck 状态（AI 说话时降低音量）
  const setDucked = useCallback((ducked: boolean) => {
    setIsDucked(ducked);
    
    if (isPlaying && audioRef.current) {
      fadeToVolume(ducked ? duckedVolume : normalVolume, 300); // 快速切换
    }
  }, [isPlaying, normalVolume, duckedVolume, fadeToVolume]);

  // 监听 isDucked 变化
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      fadeToVolume(isDucked ? duckedVolume : normalVolume, 300);
    }
  }, [isDucked, isPlaying, normalVolume, duckedVolume, fadeToVolume]);

  // 清理
  useEffect(() => {
    return () => {
      clearFadeInterval();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [clearFadeInterval]);

  return {
    isPlaying,
    currentVolume,
    play,
    stop,
    toggle,
    setDucked,
  };
}

export default useAmbientAudio;
