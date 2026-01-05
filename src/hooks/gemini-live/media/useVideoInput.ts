/**
 * useVideoInput - 摄像头捕获和视频帧发送
 *
 * 职责：
 * - 管理摄像头权限和设备
 * - 捕获视频帧并转换为 JPEG base64
 * - 按指定帧率发送视频帧
 *
 * 设计决策：
 * - 视频预览独立于连接状态（可以先预览再连接）
 * - 视频帧发送依赖于连接状态
 * - 通过 onVideoFrame 回调解耦
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_CAMERA_FRAME_RATE, DEFAULT_CAMERA_RESOLUTION } from '../../../constants/media';
import { devLog, devWarn } from '../utils';

interface UseVideoInputOptions {
  frameRate?: number;
  resolution?: { width: number; height: number };
  onVideoFrame?: (base64Jpeg: string) => void;
  onError?: (error: string) => void;
}

interface UseVideoInputReturn {
  // State
  isEnabled: boolean;
  videoStream: MediaStream | null;
  error: string | null;

  // Actions
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;

  // Refs for UI (MutableRefObject to allow external assignment)
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;

  // Control
  startFrameCapture: () => void;
  stopFrameCapture: () => void;
}

export function useVideoInput(
  options: UseVideoInputOptions = {}
): UseVideoInputReturn {
  const {
    frameRate = DEFAULT_CAMERA_FRAME_RATE,
    resolution = DEFAULT_CAMERA_RESOLUTION,
    onVideoFrame,
    onError
  } = options;

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureTimeoutRef = useRef<number>(-1);
  const isCapturingRef = useRef(false);

  /**
   * 启动摄像头
   */
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: resolution.width },
          height: { ideal: resolution.height },
        },
      });

      setVideoStream(stream);
      setIsEnabled(true);
      setError(null);

      devLog('📹 Camera started');
    } catch (err) {
      console.error('Camera error:', err);
      const errorMessage = 'Camera access denied. Please allow camera access in Settings.';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [resolution, onError]);

  /**
   * 停止摄像头
   */
  const stop = useCallback(() => {
    videoStream?.getTracks().forEach((track) => track.stop());
    setVideoStream(null);
    setIsEnabled(false);

    // 停止帧捕获
    if (captureTimeoutRef.current !== -1) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = -1;
    }
    isCapturingRef.current = false;

    devLog('📹 Camera stopped');
  }, [videoStream]);

  /**
   * 切换摄像头状态
   */
  const toggle = useCallback(async () => {
    if (isEnabled) {
      stop();
    } else {
      await start();
    }
  }, [isEnabled, start, stop]);

  /**
   * 尝试播放视频预览
   */
  const ensureVideoPlayback = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      const playPromise = videoElement.play();
      if (playPromise) {
        await playPromise;
      }
    } catch (err) {
      devWarn('Camera preview playback failed:', err);
      setError('Camera preview blocked. Please tap the camera button to start playback.');
    }
  }, []);

  /**
   * 设置视频预览（独立于连接状态）
   */
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      void ensureVideoPlayback(videoRef.current);
    }
  }, [videoStream, ensureVideoPlayback]);

  /**
   * 发送单个视频帧
   */
  const sendVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !onVideoFrame) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 缩小尺寸以减少带宽
    canvas.width = video.videoWidth * 0.25;
    canvas.height = video.videoHeight * 0.25;

    if (canvas.width + canvas.height > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 1.0);
      const data = base64.slice(base64.indexOf(',') + 1);
      onVideoFrame(data);
    }

    // 继续捕获
    if (isCapturingRef.current && isEnabled) {
      captureTimeoutRef.current = window.setTimeout(
        sendVideoFrame,
        1000 / frameRate
      );
    }
  }, [frameRate, isEnabled, onVideoFrame]);

  /**
   * 开始视频帧捕获
   */
  const startFrameCapture = useCallback(() => {
    if (!isEnabled || !videoStream || isCapturingRef.current) return;

    isCapturingRef.current = true;
    requestAnimationFrame(sendVideoFrame);

    devLog('📹 Frame capture started');
  }, [isEnabled, videoStream, sendVideoFrame]);

  /**
   * 停止视频帧捕获
   */
  const stopFrameCapture = useCallback(() => {
    isCapturingRef.current = false;
    if (captureTimeoutRef.current !== -1) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = -1;
    }

    devLog('📹 Frame capture stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current !== -1) {
        clearTimeout(captureTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    isEnabled,
    videoStream,
    error,

    // Actions
    start,
    stop,
    toggle,

    // Refs
    videoRef,
    canvasRef,

    // Control
    startFrameCapture,
    stopFrameCapture,
  };
}
