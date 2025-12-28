import { useCallback, useState } from 'react';
import { TaskWorkingView } from '../task/TaskWorkingView';
import { StartCelebrationView } from '../celebration/StartCelebrationView';
import { SimpleTaskExecutionView } from '../task/SimpleTaskExecutionView';
import { CelebrationView } from '../celebration/CelebrationView';
import type { CelebrationFlow } from '../celebration/CelebrationView';
import { useAICoachSession } from '../../hooks/useAICoachSession';
import { useCelebrationAnimation } from '../../hooks/useCelebrationAnimation';

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

  const computeCompletionTime = useCallback(
    () => initialCountdown - aiCoach.state.timeRemaining,
    [aiCoach.state.timeRemaining, initialCountdown]
  );

  // 开始任务
  const handleStart = useCallback(async () => {
    setCelebrationFlow('success');
    setCompletionTime(0);
    try {
      await aiCoach.startSession(taskName);
      setStep('working');
    } catch (error) {
      alert('AI 连接失败，请重试：' + (error as Error).message);
    }
  }, [aiCoach, taskName]);

  // 点击 "I'M DOING IT!"
  const handleDoingIt = useCallback(() => {
    setStep('startCelebration');
  }, []);

  // StartCelebrationView: Continue Doing It
  const handleContinue = useCallback(() => {
    const usedSeconds = computeCompletionTime();
    setCompletionTime(usedSeconds);
    aiCoach.endSession();
    setStep('simpleExecution');
  }, [aiCoach, computeCompletionTime]);

  // StartCelebrationView / SimpleTaskExecutionView: Finish this task
  const handleFinish = useCallback(() => {
    const usedSeconds = computeCompletionTime();
    setCompletionTime(usedSeconds);
    aiCoach.endSession();
    setCelebrationFlow('success');
    setStep('finish');
  }, [aiCoach, computeCompletionTime]);

  // StartCelebrationView: 关闭回到工作阶段
  const handleCloseCelebration = useCallback(() => {
    setStep('working');
  }, []);

  // 重置回初始状态
  const handleRestart = useCallback(() => {
    aiCoach.resetSession();
    setStep('idle');
    setCompletionTime(0);
    setCelebrationFlow('success');
  }, [aiCoach]);

  if (step === 'working') {
    const { canvasRef } = aiCoach;
    return (
      <>
        {/* 隐藏画布：Gemini Live 需要 canvas 来推送视频帧 */}
        <canvas ref={canvasRef} className="hidden" />
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
