import { useEffect, useRef, useState } from 'react';

interface UseVoiceActivityDetectionOptions {
  enabled?: boolean;
  /** 上升阈值（0-255），超过才认为可能在说话，默认 30 */
  threshold?: number;
  smoothingTimeConstant?: number; // 0-1, default 0.8
  fftSize?: number; // Must be power of 2, default 2048
}

/**
 * Voice Activity Detection (VAD) hook
 *
 * - 使用带通滤波（300-4000Hz）过滤环境底噪/水流等低频与超高频杂音
 * - 双阈值（上升/下降）避免键盘等短脉冲把状态卡在“正在说话”
 * - 最短持续时间门槛（默认 250ms）过滤短促噪声
 *
 * @param {MediaStream | null} mediaStream - 麦克风流
 * @param {UseVoiceActivityDetectionOptions} options - VAD 配置
 * @returns {{ isSpeaking: boolean; currentVolume: number; lastSpeakingTime: Date | null }} VAD 状态
 */
export function useVoiceActivityDetection(
  mediaStream: MediaStream | null,
  options: UseVoiceActivityDetectionOptions = {}
) {
  const {
    enabled = true,
    threshold = 30,
    smoothingTimeConstant = 0.8,
    fftSize = 2048,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [lastSpeakingTime, setLastSpeakingTime] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const highpassRef = useRef<BiquadFilterNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speakingRef = useRef(false); // avoid effect churn on speaking toggles
  const speechStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !mediaStream) {
      return;
    }

    // Create AudioContext and AnalyserNode
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;

    // 带通滤波：过滤 <300Hz 的低频嗡鸣和 >4kHz 的尖锐噪声
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 300;
    highpass.Q.value = 0.707;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4000;
    lowpass.Q.value = 0.707;

    // Connect microphone stream -> highpass -> lowpass -> analyser
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceNodeRef.current = sourceNode;
    highpassRef.current = highpass;
    lowpassRef.current = lowpass;

    // Buffer to hold frequency data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const minSpeechDurationMs = 250; // 最短持续时间：过滤短促噪音
    const risingThreshold = threshold; // 上升阈值：进入说话状态
    const fallingThreshold = Math.max(5, threshold - 12); // 下降阈值：退出说话状态，避免抖动

    // Voice activity detection loop
    const detectVoiceActivity = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate average volume
      const sum = dataArray.reduce((acc, val) => acc + val, 0);
      const average = sum / bufferLength;

      // Update current volume for UI display
      setCurrentVolume(Math.round(average));

      const now = Date.now();

      // 上升沿：超过上升阈值后开始计时，超过最短持续时间才认定为“说话”
      if (average > risingThreshold) {
        if (speechStartRef.current === null) {
          speechStartRef.current = now;
        }

        const duration = now - speechStartRef.current;
        if (!speakingRef.current && duration >= minSpeechDurationMs) {
          setIsSpeaking(true);
          speakingRef.current = true;
          setLastSpeakingTime(now);
        }
      } else if (average < fallingThreshold) {
        // 下降沿：低于下降阈值立即释放说话状态，避免状态粘滞
        speechStartRef.current = null;
        if (speakingRef.current) {
          setIsSpeaking(false);
          speakingRef.current = false;
        }
      }

      // Continue monitoring
      animationFrameRef.current = requestAnimationFrame(detectVoiceActivity);
    };

    // Start monitoring
    detectVoiceActivity();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (highpassRef.current) {
        highpassRef.current.disconnect();
      }
      if (lowpassRef.current) {
        lowpassRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      speakingRef.current = false;
      speechStartRef.current = null;
    };
  }, [enabled, mediaStream, threshold, smoothingTimeConstant, fftSize]);

  return {
    isSpeaking,
    currentVolume,
    lastSpeakingTime: lastSpeakingTime > 0 ? new Date(lastSpeakingTime) : null,
  };
}
