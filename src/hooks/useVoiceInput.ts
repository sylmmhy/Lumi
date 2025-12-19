import { useState, useRef, useCallback } from 'react';

/**
 * Voice Input Hook - 语音输入功能
 * 
 * 职责：
 * - 录制用户语音
 * - 监控音量生成波形数据
 * - 发送到服务器进行语音转文字
 */

export interface UseVoiceInputOptions {
  /** 转写成功后的回调 */
  onTranscript?: (text: string) => void;
  /** 错误回调 */
  onError?: (error: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { onTranscript, onError } = options;

  // 状态
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [waveformHeights, setWaveformHeights] = useState<number[]>([10, 15, 20, 15]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * 监控音频电平，生成波形数据
   */
  const monitorAudioLevel = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const detectLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // 计算平均音量
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const average = sum / dataArray.length;

        // 归一化到 0-1 范围
        const normalized = Math.min((average / 128) * 1.5, 1);

        // 根据音量更新波形高度
        const baseHeight = 10;
        const maxHeight = 40;
        const newHeights = [0.8, 1.0, 0.9, 0.7].map((variance) => {
          const random = Math.random() * 0.5 + 0.5;
          const intensity = normalized * random * variance;
          return baseHeight + (maxHeight - baseHeight) * intensity;
        });

        setWaveformHeights(newHeights);
        animationFrameRef.current = requestAnimationFrame(detectLevel);
      };

      detectLevel();
    } catch (error) {
      console.warn('无法初始化音频监控:', error);
    }
  }, []);

  /**
   * 停止音频监控
   */
  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setWaveformHeights([10, 15, 20, 15]);
  }, []);

  /**
   * 转写音频
   */
  const transcribeAudio = useCallback(async () => {
    try {
      if (import.meta.env.DEV) {
        console.log('🎤 开始音频转写...');
      }

      setIsTranscribing(true);

      // 从 chunks 创建 audio blob
      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm'
      });

      if (import.meta.env.DEV) {
        console.log('音频 blob 大小:', audioBlob.size, '字节');
      }

      if (audioBlob.size === 0) {
        throw new Error('没有录制到音频');
      }

      // 创建 FormData
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('type', 'final');
      formData.append('timestamp', new Date().toISOString());

      // 发送到 Supabase function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/transcribe-audio`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `转写失败: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        if (import.meta.env.DEV) {
          console.log('✅ 转写成功:', result.transcript);
        }
        onTranscript?.(result.transcript);
      } else {
        throw new Error(result.error || '转写失败');
      }
    } catch (error) {
      console.error('❌ 转写错误:', error);
      const errorMessage = error instanceof Error ? error.message : '转写失败';
      onError?.(errorMessage);
      alert('语音识别失败，请重试。');
    } finally {
      setIsTranscribing(false);
    }
  }, [onTranscript, onError]);

  /**
   * 开始录音
   */
  const startRecording = useCallback(async () => {
    try {
      if (import.meta.env.DEV) {
        console.log('🎤 开始语音录制...');
      }

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 创建 MediaRecorder
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // 收集音频数据
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 开始录制
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsVoiceMode(true);
      setRecordingTime(0);

      // 开始音量监控
      monitorAudioLevel(stream);

      // 开始计时
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      if (import.meta.env.DEV) {
        console.log('✅ 录制已开始');
      }
    } catch (error) {
      console.error('❌ 录制启动错误:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        onError?.('麦克风访问被拒绝，请在设置中允许麦克风访问。');
        alert('无法访问麦克风，请检查权限设置。');
      } else {
        onError?.(errorMessage);
        alert('无法访问麦克风，请检查权限设置。');
      }
    }
  }, [monitorAudioLevel, onError]);

  /**
   * 停止录音
   */
  const stopRecording = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log('🛑 停止语音录制...');
    }

    if (!mediaRecorderRef.current) return;

    // 停止计时
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // 停止音量监控
    stopAudioMonitoring();

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // 停止麦克风流
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        // 转写音频
        await transcribeAudio();

        setIsRecording(false);
        setIsVoiceMode(false);
        setRecordingTime(0);

        resolve();
      };

      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        resolve();
      }
    });
  }, [stopAudioMonitoring, transcribeAudio]);

  /**
   * 取消录音（不转写）
   */
  const cancelRecording = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('❌ 取消语音录制');
    }

    // 停止计时
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // 停止音量监控
    stopAudioMonitoring();

    // 停止录制
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
    }

    // 清除状态
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsVoiceMode(false);
    setRecordingTime(0);
  }, [stopAudioMonitoring]);

  return {
    // 状态
    isVoiceMode,
    isRecording,
    recordingTime,
    waveformHeights,
    isTranscribing,

    // 操作
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

