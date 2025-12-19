import { TaskWorkingView } from '../../../components';
import type { RefObject } from 'react';

interface RunningStepProps {
  taskDescription: string;
  timeRemaining: number;
  cameraEnabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  aiConnected: boolean;
  aiError?: string | null;
  isSpeaking: boolean;
  waveformHeights: number[];
  onToggleCamera: () => void;
  onComplete: () => void;
  onRestart: () => void;
  hasBottomNav: boolean;
}

/**
 * RunningStep - Onboarding 运行阶段视图
 *
 * 展示实时任务倒计时、AI 连接状态，并允许用户在会话中切换摄像头。
 *
 * @param {RunningStepProps} props - 运行阶段所需的状态与回调
 * @returns {JSX.Element} 运行阶段界面
 */
export function RunningStep({
  taskDescription,
  timeRemaining,
  cameraEnabled,
  videoRef,
  aiConnected,
  aiError,
  isSpeaking,
  waveformHeights,
  onToggleCamera,
  onComplete,
  onRestart,
  hasBottomNav,
}: RunningStepProps) {
  return (
    <TaskWorkingView
      taskDescription={taskDescription}
      time={timeRemaining}
      timeMode="countdown"
      camera={{
        enabled: cameraEnabled,
        videoRef,
      }}
      aiStatus={{
        isConnected: aiConnected,
        error: aiError,
        waveformHeights,
        isSpeaking,
      }}
      onToggleCamera={onToggleCamera}
      primaryButton={{
        label: "I'M DOING IT!",
        emoji: '✅',
        onClick: onComplete,
      }}
      secondaryButton={{
        label: 'RESTART',
        emoji: '❌',
        onClick: onRestart,
      }}
      hasBottomNav={hasBottomNav}
    />
  );
}
