import { TaskWorkingView } from '../../../components';

interface WorkingStepProps {
  taskDescription: string;
  workingSeconds: number;
  onComplete: () => void;
  onGiveUp: () => void;
}

export function WorkingStep({
  taskDescription,
  workingSeconds,
  onComplete,
  onGiveUp,
}: WorkingStepProps) {
  return (
    <TaskWorkingView
      taskDescription={taskDescription}
      time={workingSeconds}
      timeMode="countup"
      primaryButton={{
        label: 'COMPLETED',
        emoji: '✅',
        onClick: onComplete,
      }}
      secondaryButton={{
        label: 'GIVE UP',
        onClick: onGiveUp,
      }}
    />
  );
}
