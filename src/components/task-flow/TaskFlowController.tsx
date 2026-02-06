import { useCallback, useState, useEffect, useRef } from 'react';
import { TaskWorkingView } from '../task/TaskWorkingView';
import { StartCelebrationView } from '../celebration/StartCelebrationView';
import { SimpleTaskExecutionView } from '../task/SimpleTaskExecutionView';
import { CelebrationView } from '../celebration/CelebrationView';
import type { CelebrationFlow } from '../celebration/CelebrationView';
import { useAICoachSession } from '../../hooks/useAICoachSession';
import { useCelebrationAnimation } from '../../hooks/useCelebrationAnimation';
import {
  isLiveKitMode,
  startLiveKitRoom,
  endLiveKitRoom,
  onLiveKitEvent,
} from '../../lib/liveKitSettings';

type FlowStep = 'idle' | 'working' | 'startCelebration' | 'simpleExecution' | 'finish';

export interface TaskFlowControllerProps {
  /** 任务名称，默认 "Focus on my task" */
  taskName?: string;
  /** 工作阶段的倒计时（秒），默认 300 秒 */
  initialCountdown?: number;
}

const DEFAULT_TASK_NAME = 'Focus on my task';
const DEFAULT_COUNTDOWN = 300;

/**
 * TaskFlowController - 串联任务开始、庆祝、执行与完成的流程控制器。
 *
 * 流程：
 * Start（开始按钮）→ TaskWorkingView（点击 I'M DOING IT!）→ StartCelebrationView
 * StartCelebrationView: Continue Doing It → SimpleTaskExecutionView；Finish this task → CelebrationView
 * SimpleTaskExecutionView: Finish this task → CelebrationView
 *
 * @param {TaskFlowControllerProps} props - 控制器配置
 * @returns {JSX.Element} 任务流程视图
 */
export function TaskFlowController({
  taskName = DEFAULT_TASK_NAME,
  initialCountdown = DEFAULT_COUNTDOWN,
}: TaskFlowControllerProps) {
  const [step, setStep] = useState<FlowStep>('idle');
  const [completionTime, setCompletionTime] = useState(0);
  const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('success');

  // LiveKit 模式状态
  const [usingLiveKit, setUsingLiveKit] = useState(false);
  const [liveKitConnected, setLiveKitConnected] = useState(false);
  const [liveKitError, setLiveKitError] = useState<string | null>(null);
  const [liveKitTimeRemaining, setLiveKitTimeRemaining] = useState(initialCountdown);
  const liveKitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 监听 LiveKit 事件
  useEffect(() => {
    if (!usingLiveKit) return;

    const cleanupConnected = onLiveKitEvent('connected', () => {
      console.log('🎙️ LiveKit connected');
      setLiveKitConnected(true);
      setLiveKitError(null);
    });

    const cleanupDisconnected = onLiveKitEvent('disconnected', () => {
      console.log('🎙️ LiveKit disconnected');
      setLiveKitConnected(false);
    });

    const cleanupError = onLiveKitEvent('error', (detail) => {
      console.error('🎙️ LiveKit error:', detail);
      const errorDetail = detail as { message?: string } | undefined;
      setLiveKitError(errorDetail?.message || 'LiveKit 连接失败');
      setLiveKitConnected(false);
    });

    return () => {
      cleanupConnected();
      cleanupDisconnected();
      cleanupError();
    };
  }, [usingLiveKit]);

  // LiveKit 模式倒计时
  useEffect(() => {
    if (!usingLiveKit || step !== 'working') return;

    liveKitTimerRef.current = setInterval(() => {
      setLiveKitTimeRemaining((prev) => {
        if (prev <= 1) {
          // 倒计时结束
          if (liveKitTimerRef.current) {
            clearInterval(liveKitTimerRef.current);
            liveKitTimerRef.current = null;
          }
          endLiveKitRoom();
          setCompletionTime(initialCountdown);
          setCelebrationFlow('confirm');
          setStep('finish');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (liveKitTimerRef.current) {
        clearInterval(liveKitTimerRef.current);
        liveKitTimerRef.current = null;
      }
    };
  }, [usingLiveKit, step, initialCountdown]);

  const aiCoach = useAICoachSession({
    initialTime: initialCountdown,
    onCountdownComplete: () => {
      aiCoach.endSession();
      setCompletionTime(initialCountdown);
      setCelebrationFlow('confirm');
      setStep('finish');
    },
  });

  // 庆祝动画控制
  const celebrationAnimation = useCelebrationAnimation({
    enabled: step === 'finish' && celebrationFlow === 'success',
    remainingTime: aiCoach.state.timeRemaining,
  });

  /** Gemini Live 使用的隐藏画布 ref，确保渲染层能拿到对应节点 */
  const canvasRef = aiCoach.canvasRef;

  /**
   * 同步隐藏画布节点到 Gemini Live，避免在 render 阶段读取 ref 值。
   * @param {HTMLCanvasElement | null} node - 当前渲染的画布节点
   */
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
  }, [canvasRef]);

  const computeCompletionTime = useCallback(
    () => initialCountdown - aiCoach.state.timeRemaining,
    [aiCoach.state.timeRemaining, initialCountdown]
  );

  // 开始任务
  const handleStart = useCallback(async () => {
    setCelebrationFlow('success');
    setCompletionTime(0);

    // 调试日志：检测 LiveKit 状态
    console.log('🎙️ LiveKit 检测:', {
      isNativeLiveKitAvailable: typeof window !== 'undefined' && !!(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkit?.messageHandlers?.startNativeLiveKitCall
      ),
      isLiveKitMode: isLiveKitMode(),
      voiceMode: localStorage.getItem('lumi_voice_mode') || 'livekit (default)',
    });

    // 检测是否使用 LiveKit 模式
    if (isLiveKitMode()) {
      console.log('🎙️ 使用 LiveKit 原生模式');
      setUsingLiveKit(true);
      setLiveKitTimeRemaining(initialCountdown);
      setLiveKitError(null);

      // 调用 iOS 原生 LiveKit
      startLiveKitRoom();
      setStep('working');
      return;
    }

    // WebView 模式：使用 Gemini Live
    try {
      const started = await aiCoach.startSession(taskName);
      if (!started) return;
      setStep('working');
    } catch (error) {
      alert('AI 连接失败，请重试：' + (error as Error).message);
    }
  }, [aiCoach, taskName, initialCountdown]);

  // 点击 "I'M DOING IT!"
  const handleDoingIt = useCallback(() => {
    setStep('startCelebration');
  }, []);

  // StartCelebrationView: Continue Doing It
  const handleContinue = useCallback(() => {
    const usedSeconds = usingLiveKit
      ? initialCountdown - liveKitTimeRemaining
      : computeCompletionTime();
    setCompletionTime(usedSeconds);

    if (usingLiveKit) {
      endLiveKitRoom();
      if (liveKitTimerRef.current) {
        clearInterval(liveKitTimerRef.current);
        liveKitTimerRef.current = null;
      }
    } else {
      // 立即停止音频播放，让 AI 马上静音
      aiCoach.stopAudioImmediately();
      aiCoach.endSession();
    }
    setStep('simpleExecution');
  }, [aiCoach, computeCompletionTime, usingLiveKit, initialCountdown, liveKitTimeRemaining]);

  // StartCelebrationView / SimpleTaskExecutionView: Finish this task
  const handleFinish = useCallback(() => {
    const usedSeconds = usingLiveKit
      ? initialCountdown - liveKitTimeRemaining
      : computeCompletionTime();
    setCompletionTime(usedSeconds);

    if (usingLiveKit) {
      endLiveKitRoom();
      if (liveKitTimerRef.current) {
        clearInterval(liveKitTimerRef.current);
        liveKitTimerRef.current = null;
      }
    } else {
      // 立即停止音频播放，让 AI 马上静音
      aiCoach.stopAudioImmediately();
      aiCoach.endSession();
    }
    setCelebrationFlow('success');
    setStep('finish');
  }, [aiCoach, computeCompletionTime, usingLiveKit, initialCountdown, liveKitTimeRemaining]);

  // StartCelebrationView: 关闭回到工作阶段
  const handleCloseCelebration = useCallback(() => {
    setStep('working');
  }, []);

  // 重置回初始状态
  const handleRestart = useCallback(() => {
    if (usingLiveKit) {
      endLiveKitRoom();
      if (liveKitTimerRef.current) {
        clearInterval(liveKitTimerRef.current);
        liveKitTimerRef.current = null;
      }
      setUsingLiveKit(false);
      setLiveKitConnected(false);
      setLiveKitError(null);
      setLiveKitTimeRemaining(initialCountdown);
    } else {
      aiCoach.resetSession();
    }
    setStep('idle');
    setCompletionTime(0);
    setCelebrationFlow('success');
  }, [aiCoach, usingLiveKit, initialCountdown]);

  if (step === 'working') {
    // LiveKit 模式：使用原生音频，不需要摄像头和 canvas
    if (usingLiveKit) {
      return (
        <TaskWorkingView
          taskDescription={taskName}
          time={liveKitTimeRemaining}
          timeMode="countdown"
          aiStatus={{
            isConnected: liveKitConnected,
            error: liveKitError,
            // LiveKit 模式不显示波形动画（音频在原生端处理）
            waveformHeights: liveKitConnected ? [0.5, 0.7, 0.6, 0.8, 0.5] : undefined,
            isSpeaking: liveKitConnected,
            isObserving: false,
          }}
          primaryButton={{
            label: "I'M DOING IT!",
            emoji: '✅',
            onClick: handleDoingIt,
          }}
          secondaryButton={{
            label: 'RESTART',
            emoji: '🔁',
            onClick: handleRestart,
          }}
        />
      );
    }

    // WebView 模式：使用 Gemini Live
    return (
      <>
        {/* 隐藏画布：Gemini Live 需要 canvas 来推送视频帧 */}
        <canvas ref={handleCanvasRef} className="hidden" />
        <TaskWorkingView
          taskDescription={taskName}
          time={aiCoach.state.timeRemaining}
          timeMode="countdown"
          camera={{
            enabled: aiCoach.cameraEnabled,
            videoRef: aiCoach.videoRef,
          }}
          onToggleCamera={aiCoach.toggleCamera}
          aiStatus={{
            isConnected: aiCoach.isConnected,
            error: aiCoach.error,
            waveformHeights: aiCoach.waveformHeights,
            isSpeaking: aiCoach.isSpeaking,
            isObserving: aiCoach.isObserving,
          }}
          primaryButton={{
            label: "I'M DOING IT!",
            emoji: '✅',
            onClick: handleDoingIt,
          }}
          secondaryButton={{
            label: 'RESTART',
            emoji: '🔁',
            onClick: handleRestart,
          }}
        />
      </>
    );
  }

  if (step === 'startCelebration') {
    return (
      <StartCelebrationView
        onClose={handleCloseCelebration}
        onContinue={handleContinue}
        onFinish={handleFinish}
      />
    );
  }

  if (step === 'simpleExecution') {
    return (
      <SimpleTaskExecutionView
        taskName={taskName}
        initialSeconds={completionTime || computeCompletionTime()}
        onClose={handleRestart}
        onFinish={() => {
          setCompletionTime(prev => (prev > 0 ? prev : computeCompletionTime()));
          setCelebrationFlow('success');
          setStep('finish');
        }}
        onRest={() => {
          // 保留扩展点，后续可以在此写入休息逻辑
        }}
      />
    );
  }

  if (step === 'finish') {
    return (
      <CelebrationView
        flow={celebrationFlow}
        onFlowChange={setCelebrationFlow}
        success={{
          scene: celebrationAnimation.scene,
          coins: celebrationAnimation.coins,
          progressPercent: celebrationAnimation.progressPercent,
          showConfetti: celebrationAnimation.showConfetti,
          completionTime: completionTime || computeCompletionTime(),
          taskDescription: taskName,
          ctaButton: {
            label: 'TAKE MORE CHALLENGE',
            onClick: handleRestart,
          },
        }}
        failure={{
          button: {
            label: 'TRY AGAIN',
            onClick: handleRestart,
          },
        }}
        confirm={{
          yesButton: {
            label: '✅ YES, I STARTED!!',
            onClick: () => setCelebrationFlow('success'),
          },
          noButton: {
            label: "✕ NO I DIDN'T",
            onClick: () => setCelebrationFlow('failure'),
          },
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-amber-50 to-orange-100 text-center">
      <h1 className="text-3xl font-bold text-orange-600">Start Your Task</h1>
      <p className="text-sm text-orange-700 max-w-sm">
        按照「开始 → 我在做 → 继续执行/直接完成」的顺序，带你快速体验完整任务流。
      </p>
      <button
        onClick={handleStart}
        disabled={aiCoach.isConnecting}
        className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl shadow-lg hover:bg-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {aiCoach.isConnecting ? '连接中…' : 'Start'}
      </button>
    </div>
  );
}
