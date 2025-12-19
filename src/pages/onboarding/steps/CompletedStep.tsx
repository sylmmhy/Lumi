import { CelebrationView } from '../../../components';
import type { SuccessScene } from '../../../components/celebration/CelebrationView';

interface CompletedStepProps {
  flow: 'confirm' | 'success' | 'failure';
  completionTime: number;
  taskDescription: string;
  celebrationScene: SuccessScene;
  coins: number;
  progressPercent: number;
  showConfetti: boolean;
  onFlowChange: (flow: 'confirm' | 'success' | 'failure') => void;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
  onSaveAndChallenge: () => void;
  onTakeMoreChallenge: () => void;
}

export function CompletedStep({
  flow,
  completionTime,
  taskDescription,
  celebrationScene,
  coins,
  progressPercent,
  showConfetti,
  onFlowChange,
  onConfirmYes,
  onConfirmNo,
  onSaveAndChallenge,
  onTakeMoreChallenge,
}: CompletedStepProps) {
  return (
    <CelebrationView
      flow={flow}
      onFlowChange={onFlowChange}
      confirm={{
        title: "Time's Up!",
        subtitle: 'Did you start your task?',
        yesButton: {
          label: '✅ YES, I STARTED!!',
          onClick: onConfirmYes,
        },
        noButton: {
          label: "✕ NO I DIDN'T",
          onClick: onConfirmNo,
        },
      }}
      success={{
        scene: celebrationScene,
        coins,
        progressPercent,
        showConfetti,
        completionTime,
        taskDescription,
        levelText: 'LEVEL:1',
        ctaButton: {
          label: 'SAVE & TAKE MORE CHALLENGE',
          onClick: onSaveAndChallenge,
        },
      }}
      failure={{
        title: 'You Can Make It',
        subtitle: 'Next Time!',
        button: {
          label: 'TAKE MORE CHALLENGE',
          onClick: onTakeMoreChallenge,
        },
      }}
    />
  );
}
