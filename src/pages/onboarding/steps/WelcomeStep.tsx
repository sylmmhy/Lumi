import { OnboardingHomeView } from '../OnboardingHomeView';

interface WelcomeStepProps {
  taskInput: string;
  setTaskInput: (value: string) => void;
  isVoiceMode: boolean;
  startVoiceRecording: () => void;
  stopVoiceRecording: () => void;
  voiceWaveformHeights: number[];
  onStartTask: () => void;
}

export function WelcomeStep({
  taskInput,
  setTaskInput,
  isVoiceMode,
  startVoiceRecording,
  stopVoiceRecording,
  voiceWaveformHeights,
  onStartTask,
}: WelcomeStepProps) {
  return (
    <OnboardingHomeView
      taskInput={taskInput}
      setTaskInput={setTaskInput}
      isVoiceMode={isVoiceMode}
      startVoiceRecording={startVoiceRecording}
      stopVoiceRecording={stopVoiceRecording}
      voiceWaveformHeights={voiceWaveformHeights}
      handleStartTask={onStartTask}
    />
  );
}
