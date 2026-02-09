import { TaskWorkingView } from '../task/TaskWorkingView';
import { TaskCompletionModal } from './TaskCompletionModal';
import type { useCoachController } from '../../hooks/useCoachController';
import '../effects/effects.css';

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
        | 'canVerifyCurrentSession'
        | 'verificationWaitSecondsRemaining'
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
        | 'showTaskCompletionModal'
        | 'handleConfirmTaskCompleteFromModal'
        | 'handleConfirmTaskIncompleteFromModal'
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
            {/* Session Finalizing 等待页面 */}
            {coach.isSessionFinalizing && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-md px-6">
                    <div
                        className="flex flex-col items-center gap-6 w-full max-w-xs"
                        style={{ animation: 'slideUpFadeIn 0.5s ease-out forwards' }}
                    >
                        {/* 旋转的加载环 + 中心 emoji */}
                        <div className="relative w-20 h-20 flex items-center justify-center">
                            <div
                                className="absolute inset-0 rounded-full animate-spin"
                                style={{
                                    border: '4px solid rgba(255,201,42,0.15)',
                                    borderTopColor: '#FFC92A',
                                }}
                            />
                            <span className="text-3xl" style={{ animation: 'pulse 2s ease-in-out infinite' }}>
                                ✨
                            </span>
                        </div>

                        {/* 标题 */}
                        <h2
                            className="text-center"
                            style={{
                                fontFamily: 'Sansita, sans-serif',
                                fontSize: '26px',
                                fontWeight: 400,
                                lineHeight: '1.3',
                                color: '#FFC92A',
                            }}
                        >
                            Wrapping Up
                        </h2>

                        {/* 动态消息 */}
                        <p
                            className="text-center"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '15px',
                                fontWeight: 500,
                                lineHeight: '1.5',
                                color: 'rgba(255,255,255,0.75)',
                            }}
                        >
                            {coach.sessionFinalizingMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* Verification Choice 确认页面 */}
            {coach.showVerificationChoice && !coach.isSessionFinalizing && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-md px-6"
                    onClick={coach.handleCancelSessionCompletion}
                >
                    <div
                        className="relative w-full max-w-sm rounded-[24px] overflow-hidden"
                        style={{
                            backgroundColor: '#1e1e1e',
                            animation: 'slideUpFadeIn 0.4s ease-out forwards',
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* 顶部装饰渐变条 */}
                        <div
                            className="h-1 w-full"
                            style={{
                                background: 'linear-gradient(to right, #FFC92A, #FF9600, #FFC92A)',
                            }}
                        />

                        <div className="flex flex-col items-center px-6 pt-8 pb-6">
                            {/* 顶部图标 */}
                            <div className="text-5xl mb-4">
                                {coach.canVerifyCurrentSession ? '🏆' : '⏳'}
                            </div>

                            {/* 标题 */}
                            <h2
                                className="text-center mb-2"
                                style={{
                                    fontFamily: 'Sansita, sans-serif',
                                    fontSize: '28px',
                                    fontWeight: 400,
                                    lineHeight: '1.2',
                                    color: '#FFC92A',
                                }}
                            >
                                {coach.canVerifyCurrentSession ? 'Well Done!' : 'Almost There!'}
                            </h2>

                            {/* 描述文字 */}
                            <p
                                className="text-center mb-6"
                                style={{
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '15px',
                                    fontWeight: 500,
                                    lineHeight: '1.5',
                                    color: 'rgba(255,255,255,0.75)',
                                }}
                            >
                                {coach.canVerifyCurrentSession
                                    ? 'Verify your task to earn bonus coins!'
                                    : `${coach.verificationWaitSecondsRemaining}s more to unlock verification`}
                            </p>

                            {/* 倒计时进度条（未解锁时显示） */}
                            {!coach.canVerifyCurrentSession && (
                                <div className="w-full mb-6">
                                    <div
                                        className="w-full h-2 rounded-full overflow-hidden"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                                    >
                                        <div
                                            className="h-full rounded-full transition-all duration-1000 ease-linear"
                                            style={{
                                                width: `${Math.max(0, ((5 - coach.verificationWaitSecondsRemaining) / 5) * 100)}%`,
                                                background: 'linear-gradient(to right, #FFC92A, #FF9600)',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 按钮区域 */}
                            <div className="flex flex-col gap-3 w-full">
                                {/* 主按钮：Verify and Finish（橙色渐变游戏风按钮） */}
                                {coach.canVerifyCurrentSession && (
                                    <button
                                        onClick={coach.handleCompleteWithVerification}
                                        className="w-full h-[52px] rounded-[14px] flex items-center justify-center active:translate-y-[2px] transition-transform"
                                        style={{
                                            background: 'linear-gradient(to top, #ffd039, #feb827)',
                                            border: '1px solid #ffe28a',
                                            boxShadow: '0 5px 0 0 #D34A22',
                                        }}
                                    >
                                        <span
                                            className="font-bold uppercase"
                                            style={{
                                                fontFamily: 'Inter, sans-serif',
                                                fontSize: '14px',
                                                letterSpacing: '0.8px',
                                                color: '#000000',
                                            }}
                                        >
                                            ✅ Verify and Finish
                                        </span>
                                    </button>
                                )}

                                {/* 次要按钮：Finish Without Verification（深色按钮） */}
                                <button
                                    onClick={coach.handleCompleteWithoutVerification}
                                    className="w-full h-[52px] rounded-[14px] flex items-center justify-center active:translate-y-[2px] transition-transform"
                                    style={{
                                        backgroundColor: '#2c3039',
                                        border: '1px solid #5a5c62',
                                        boxShadow: '0 4px 0 0 #444A58',
                                    }}
                                >
                                    <span
                                        className="font-bold uppercase"
                                        style={{
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: '14px',
                                            letterSpacing: '0.8px',
                                            color: '#ffffff',
                                        }}
                                    >
                                        {coach.canVerifyCurrentSession ? 'Skip Verification' : 'Finish Session'}
                                    </span>
                                </button>

                                {/* 文字链接：Continue Session */}
                                <button
                                    onClick={coach.handleCancelSessionCompletion}
                                    className="w-full py-3 transition-opacity active:opacity-60"
                                >
                                    <span
                                        style={{
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: 'rgba(255,255,255,0.5)',
                                            textDecoration: 'underline',
                                            textDecorationColor: 'rgba(255,255,255,0.25)',
                                            textUnderlineOffset: '3px',
                                        }}
                                    >
                                        Continue Session
                                    </span>
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
                        onWakeUpLumi={coach.aiCoach.isCampfireMode && !coach.aiCoach.isConnected ? coach.aiCoach.wakeUpLumi : undefined}
                    />
                </>
            )}

            {/* 任务完成确认弹窗 */}
            <TaskCompletionModal
                isOpen={coach.showTaskCompletionModal}
                onConfirmComplete={coach.handleConfirmTaskCompleteFromModal}
                onConfirmIncomplete={coach.handleConfirmTaskIncompleteFromModal}
                taskDescription={coach.aiCoach.state.taskDescription}
            />
        </>
    );
}
