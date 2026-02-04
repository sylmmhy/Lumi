/**
 * 语音识别 Hook
 *
 * 使用 Azure Speech Service 进行语音识别
 * 支持录音、识别、承诺验证
 */

import { useState, useCallback, useRef } from 'react';

export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  duration: number;
  validation?: {
    matched: boolean;
    similarity: number;
    reason?: string;
    normalizedSpoken?: string;
    normalizedExpected?: string;
  };
}

export interface UseSpeechRecognitionOptions {
  /** 识别语言，默认 zh-CN */
  language?: string;
  /** 预期的承诺内容，用于验证 */
  expectedPledge?: string;
  /** Supabase URL */
  supabaseUrl?: string;
  /** Supabase Anon Key */
  supabaseAnonKey?: string;
}

export interface UseSpeechRecognitionReturn {
  /** 是否正在录音 */
  isRecording: boolean;
  /** 是否正在识别 */
  isProcessing: boolean;
  /** 识别结果 */
  result: SpeechRecognitionResult | null;
  /** 错误信息 */
  error: string | null;
  /** 音频级别 0-1，用于显示音波动画 */
  audioLevel: number;
  /** 开始录音 */
  startRecording: () => Promise<void>;
  /** 停止录音并识别 */
  stopRecording: () => Promise<SpeechRecognitionResult | null>;
  /** 取消录音 */
  cancelRecording: () => void;
  /** 重置状态 */
  reset: () => void;
  /** 直接识别音频文件 */
  recognizeAudio: (audioBlob: Blob) => Promise<SpeechRecognitionResult | null>;
  /** 验证文本输入 */
  validateTextInput: (text: string) => { matched: boolean; similarity: number };
}

/**
 * 计算两个字符串的相似度（基于最长公共子序列）
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const len1 = str1.length;
  const len2 = str2.length;

  // 使用 LCS（最长公共子序列）计算相似度
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcsLength = dp[len1][len2];
  return (2 * lcsLength) / (len1 + len2);
}

/**
 * 规范化文本（去除标点、空格等）
 */
function normalizeText(text: string): string {
  return text
    .replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()[\]<>]/g, '')
    .toLowerCase();
}

/**
 * 语音识别 Hook
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    language = 'zh-CN',
    expectedPledge = '',
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SpeechRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * 开始录音
   */
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setResult(null);

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      setIsRecording(true);

      // 设置音频分析器来检测音量
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // 持续检测音量
      const checkAudioLevel = () => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // 计算平均音量（使用 RMS 更准确）
        const sum = dataArray.reduce((a, b) => a + b * b, 0);
        const rms = Math.sqrt(sum / dataArray.length);
        // 降低除数让灵敏度更高，并用指数放大小音量
        const normalizedLevel = Math.min(Math.pow(rms / 50, 0.7), 1);

        setAudioLevel(normalizedLevel);
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
      console.log('[SpeechRecognition] Recording started with audio level detection');
    } catch (err) {
      console.error('[SpeechRecognition] Failed to start recording:', err);
      setError(err instanceof Error ? err.message : '无法启动录音');
    }
  }, []);

  /**
   * 停止录音并识别
   */
  const stopRecording = useCallback(async (): Promise<SpeechRecognitionResult | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        // 停止音频分析
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(0);

        // 停止所有音轨
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        setIsProcessing(true);

        // 合并音频数据
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('[SpeechRecognition] Recording stopped, audio size:', audioBlob.size);

        // 识别音频
        const recognitionResult = await recognizeAudio(audioBlob);
        resolve(recognitionResult);
      };

      mediaRecorder.stop();
    });
  }, [isRecording]);

  /**
   * 取消录音
   */
  const cancelRecording = useCallback(() => {
    // 停止音频分析
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsProcessing(false);
    audioChunksRef.current = [];
    console.log('[SpeechRecognition] Recording cancelled');
  }, [isRecording]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    cancelRecording();
    setResult(null);
    setError(null);
  }, [cancelRecording]);

  /**
   * 识别音频文件
   */
  const recognizeAudio = useCallback(
    async (audioBlob: Blob): Promise<SpeechRecognitionResult | null> => {
      try {
        setIsProcessing(true);
        setError(null);

        // 构建 URL
        const params = new URLSearchParams({ language });
        if (expectedPledge) {
          params.set('expectedPledge', expectedPledge);
        }

        const url = `${supabaseUrl}/functions/v1/speech-to-text?${params.toString()}`;

        console.log('[SpeechRecognition] Calling API:', url);

        // 调用 Edge Function
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'audio/webm',
          },
          body: audioBlob,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data: SpeechRecognitionResult = await response.json();
        console.log('[SpeechRecognition] Result:', data);

        setResult(data);
        setIsProcessing(false);
        return data;
      } catch (err) {
        console.error('[SpeechRecognition] Recognition failed:', err);
        const errorMessage = err instanceof Error ? err.message : '语音识别失败';
        setError(errorMessage);
        setIsProcessing(false);
        return null;
      }
    },
    [language, expectedPledge, supabaseUrl, supabaseAnonKey]
  );

  /**
   * 验证文本输入（不需要语音）
   */
  const validateTextInput = useCallback(
    (text: string): { matched: boolean; similarity: number } => {
      if (!expectedPledge) {
        return { matched: false, similarity: 0 };
      }

      const normalizedInput = normalizeText(text);
      const normalizedExpected = normalizeText(expectedPledge);
      const similarity = calculateSimilarity(normalizedInput, normalizedExpected);
      const matched = similarity >= 0.7; // 70% 阈值

      console.log('[SpeechRecognition] Text validation:', {
        input: normalizedInput,
        expected: normalizedExpected,
        similarity,
        matched,
      });

      return { matched, similarity };
    },
    [expectedPledge]
  );

  return {
    isRecording,
    isProcessing,
    result,
    error,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
    recognizeAudio,
    validateTextInput,
  };
}

export default useSpeechRecognition;
