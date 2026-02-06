import { TaskWorkingView } from '../task/TaskWorkingView';
import type { useCoachController } from '../../hooks/useCoachController';

/**
 * SessionOverlay 的 props
 *
 * coach 为 useCoachController 返回值的子集，仅取 Session Overlay 需要的字段。
 */
interface SessionOverlayProps {
    coach: Pick<
        ReturnType<typeof useCoachController>,
        | 'usingLiveKit'
        | 'showCelebration'
        | 'currentTaskDescription'
        | 'liveKitTimeRemaining'
        | 'liveKitConnected'
        | 'liveKitError'
        | 'handleLiveKitPrimaryClick'
        | 'handleLiveKitSecondaryClick'
        | 'aiCoach'
        | 'handleEndAICoachSession'
        | 'handleEndCall'
    >;
}

/**
 * 会话全屏遮罩：包含 LiveKit 模式和 Gemini Live 模式两套 TaskWorkingView。
 *
 * 当 AI 教练会话活跃时显示，覆盖主 App Shell。
 */
export function SessionOverlay({ coach }: SessionOverlayProps) {
    return (
        <>
            {/* LiveKit 模式：使用原生音频，不显示摄像头 */}
            {coach.usingLiveKit && !coach.showCelebration && (
                <TaskWorkingView
                    taskDescription={coach.currentTaskDescription}
                    time={coach.liveKitTimeRemaining}
                    timeMode="countdown"
                    aiStatus={{
                        isConnected: coach.liveKitConnected,
                        error: coach.liveKitError,
                        waveformHeights: coach.liveKitConnected ? [0.5, 0.7, 0.6, 0.8, 0.5] : undefined,
                        isSpeaking: coach.liveKitConnected,
                        isObserving: false,
                    }}
                    primaryButton={{
                        label: "I'M DOING IT!",
                        emoji: '✅',
                        onClick: coach.handleLiveKitPrimaryClick,
                    }}
                    secondaryButton={{
                        label: 'END CALL',
                        emoji: '🛑',
                        onClick: coach.handleLiveKitSecondaryClick,
                    }}
                    hasBottomNav={false}
                />
            )}

            {/* WebView 模式（Gemini Live）：显示摄像头和 AI 状态 */}
            {(coach.aiCoach.isSessionActive || coach.aiCoach.isConnecting) && !coach.showCelebration && !coach.usingLiveKit && (
                <>
                    <canvas ref={coach.aiCoach.canvasRef} className="hidden" />
                    <TaskWorkingView
                        taskDescription={coach.aiCoach.state.taskDescription}
                        time={coach.aiCoach.state.timeRemaining}
                        timeMode="countdown"
                        camera={{
                            enabled: coach.aiCoach.cameraEnabled,
                            videoRef: coach.aiCoach.videoRef,
                        }}
                        onToggleCamera={coach.aiCoach.toggleCamera}
                        aiStatus={{
                            isConnected: coach.aiCoach.isConnected || coach.aiCoach.isCampfireMode,
                            error: coach.aiCoach.error,
                            waveformHeights: coach.aiCoach.waveformHeights,
                            isSpeaking: coach.aiCoach.isSpeaking,
                            isObserving: coach.aiCoach.isObserving,
                        }}
                        primaryButton={{
                            label: "I'M DOING IT!",
                            emoji: '✅',
                            onClick: coach.handleEndAICoachSession,
                        }}
                        secondaryButton={{
                            label: 'END CALL',
                            emoji: '🛑',
                            onClick: coach.handleEndCall,
                        }}
                        hasBottomNav={false}
                    />
                </>
            )}
        </>
    );
}
