import { useEffect, useRef, useState } from 'react';

interface UseVoiceActivityDetectionOptions {
  enabled?: boolean;
  /** 上升阈值（0-255），超过才认为可能在说话，默认 30 */
  threshold?: number;
  smoothingTimeConstant?: number; // 0-1, default 0.8
  fftSize?: number; // Must be power of 2, default 2048
  /** 最短持续时间（ms），持续超过此时间才认定为"说话"，默认 250ms。
   * 篝火模式等需要快速响应的场景可设为更低值（如 100ms） */
  minSpeechDuration?: number;
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
    minSpeechDuration = 250,
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

    // 🔧 修复：移动端浏览器 AudioContext 可能处于 suspended 状态
    // 必须 resume() 才能处理音频数据，否则 getByteFrequencyData 全是 0
    if (audioContext.state === 'suspended') {
      console.log('🔊 [VAD] AudioContext is suspended, resuming...');
      audioContext.resume().then(() => {
        console.log('🔊 [VAD] AudioContext resumed:', audioContext.state);
      }).catch((err) => {
        console.error('🔊 [VAD] AudioContext resume failed:', err);
      });
    }
    console.log('🔊 [VAD] AudioContext state:', audioContext.state, '| MediaStream active:', mediaStream.active,
      '| Tracks:', mediaStream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`).join(','));

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

    // 🔧 修复：只计算带通范围（300-4000Hz）内的频率 bin 的平均值
    // 之前的 bug：除以全部 1024 个 bin，但带通滤波器让 ~866 个 bin 为 0，
    // 导致真实音量被稀释 ~6.5 倍（用户说话音量 20 → 平均后只有 3）
    const sampleRate = audioContext.sampleRate;
    const freqPerBin = sampleRate / fftSize;
    const lowBin = Math.ceil(300 / freqPerBin);   // 300Hz 对应的 bin
    const highBin = Math.floor(4000 / freqPerBin); // 4000Hz 对应的 bin
    const passbandBinCount = highBin - lowBin + 1;

    console.log('🔊 [VAD] 频率分析参数:', {
      sampleRate,
      freqPerBin: freqPerBin.toFixed(1),
      totalBins: bufferLength,
      passbandBins: `${lowBin}-${highBin} (${passbandBinCount} bins)`,
    });

    const minSpeechDurationMs = minSpeechDuration; // 最短持续时间：过滤短促噪音
    const risingThreshold = threshold; // 上升阈值：进入说话状态
    const fallingThreshold = Math.max(5, threshold - 12); // 下降阈值：退出说话状态，避免抖动

    // Voice activity detection loop
    let frameCount = 0;
    const detectVoiceActivity = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // 只计算带通范围内 bin 的平均值（300-4000Hz）
      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) {
        sum += dataArray[i];
      }
      const average = sum / passbandBinCount;

      // 诊断日志：每 60 帧（约 1 秒）输出一次 VAD 状态
      frameCount++;
      if (frameCount % 60 === 1) {
        console.log('🔊 [VAD Loop]', {
          frame: frameCount,
          volume: Math.round(average),
          audioCtxState: audioContext.state,
          threshold: risingThreshold,
          isSpeaking: speakingRef.current,
        });
      }

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
  }, [enabled, mediaStream, threshold, smoothingTimeConstant, fftSize, minSpeechDuration]);

  return {
    isSpeaking,
    currentVolume,
    lastSpeakingTime: lastSpeakingTime > 0 ? new Date(lastSpeakingTime) : null,
  };
}
