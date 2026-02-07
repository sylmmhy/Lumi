import { CelebrationView } from '../celebration/CelebrationView';
import type { useCoachController } from '../../hooks/useCoachController';

/**
 * CelebrationOverlay 的 props
 *
 * coach 为 useCoachController 返回值的子集，仅取庆祝流程需要的字段。
 */
interface CelebrationOverlayProps {
    coach: Pick<
        ReturnType<typeof useCoachController>,
        | 'celebrationFlow'
        | 'setCelebrationFlow'
        | 'celebrationAnimation'
        | 'completionTime'
        | 'currentTaskDescription'
        | 'handleCloseCelebration'
        | 'handleConfirmTaskComplete'
        | 'handleConfirmTaskIncomplete'
        | 'isVerifyingTask'
        | 'sessionVerificationResult'
    >;
}

/**
 * 庆祝全屏遮罩：任务完成确认 + 庆祝动画。
 *
 * 当用户完成任务（或倒计时归零）时显示，包含确认、成功、失败三种 flow。
 */
export function CelebrationOverlay({ coach }: CelebrationOverlayProps) {
    return (
        <div className="fixed inset-0 z-[200]">
            <CelebrationView
                flow={coach.celebrationFlow}
                onFlowChange={coach.setCelebrationFlow}
                success={{
                    scene: coach.celebrationAnimation.scene,
                    coins: coach.celebrationAnimation.coins,
                    progressPercent: coach.celebrationAnimation.progressPercent,
                    showConfetti: coach.celebrationAnimation.showConfetti,
                    completionTime: coach.completionTime,
                    taskDescription: coach.currentTaskDescription,
                    ctaButton: {
                        label: 'TAKE MORE CHALLENGE',
                        onClick: coach.handleCloseCelebration,
                    },
                }}
                verification={{
                    isVerifying: coach.isVerifyingTask,
                    result: coach.sessionVerificationResult
                        ? {
                            verified: coach.sessionVerificationResult.verified,
                            confidence: coach.sessionVerificationResult.confidence,
                            coins_awarded: coach.sessionVerificationResult.coins_awarded,
                            not_visually_verifiable: coach.sessionVerificationResult.not_visually_verifiable,
                        }
                        : null,
                }}
                failure={{
                    button: {
                        label: 'TRY AGAIN',
                        onClick: coach.handleCloseCelebration,
                    },
                }}
                confirm={{
                    title: "Time's Up!",
                    subtitle: 'Did you complete your task?',
                    yesButton: {
                        label: '✅ YES, I DID IT!',
                        onClick: coach.handleConfirmTaskComplete,
                    },
                    noButton: {
                        label: "✕ NO, NOT YET",
                        onClick: coach.handleConfirmTaskIncomplete,
                    },
                }}
            />
        </div>
    );
}
