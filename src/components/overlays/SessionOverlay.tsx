import { TaskWorkingView } from '../task/TaskWorkingView';
import type { useCoachController } from '../../hooks/useCoachController';
import { designSystem, getButtonStyle, getPanelStyle } from '../../styles/designSystem';

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
        | 'showVerificationChoice'
        | 'isSessionFinalizing'
        | 'sessionFinalizingMessage'
        | 'currentTaskDescription'
        | 'liveKitTimeRemaining'
        | 'liveKitConnected'
        | 'liveKitError'
        | 'handleLiveKitPrimaryClick'
        | 'handleLiveKitSecondaryClick'
        | 'aiCoach'
        | 'handleRequestSessionCompletion'
        | 'handleCancelSessionCompletion'
        | 'handleCompleteWithVerification'
        | 'handleCompleteWithoutVerification'
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
            {coach.isSessionFinalizing && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6">
                    <div className={`relative w-full max-w-sm ${getPanelStyle('2xl', true)} p-6 text-center`}>
                        <div className={designSystem.patterns.innerGlowTinted}></div>
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            <div className="h-12 w-12 rounded-full border-4 border-white/25 border-t-[#E6FB47] animate-spin" />
                            <p className="text-white text-lg font-semibold">Wrapping up your session</p>
                            <p className="text-white/80 text-sm">{coach.sessionFinalizingMessage}</p>
                        </div>
                    </div>
                </div>
            )}

            {coach.showVerificationChoice && !coach.isSessionFinalizing && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
                    onClick={coach.handleCancelSessionCompletion}
                >
                    <div
                        className={`relative w-full max-w-sm ${getPanelStyle('2xl', true)} p-6`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={designSystem.patterns.innerGlowTinted}></div>
                        <div className="relative z-10">
                            <h3 className="text-white text-xl font-semibold text-center mb-2">Finish this session?</h3>
                            <p className="text-white/80 text-sm text-center mb-5">
                                You can verify now for reward eligibility, or skip verification and finish directly.
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={coach.handleCompleteWithVerification}
                                    className={`w-full ${getButtonStyle('accent', 'md')}`}
                                >
                                    Verify and Finish
                                </button>
                                <button
                                    onClick={coach.handleCompleteWithoutVerification}
                                    className={`w-full ${getButtonStyle('glassTinted', 'md')} text-white`}
                                >
                                    Finish Without Verification
                                </button>
                                <button
                                    onClick={coach.handleCancelSessionCompletion}
                                    className="w-full py-2 text-white/70 text-sm"
                                >
                                    Continue Session
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                            onClick: coach.handleRequestSessionCompletion,
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
