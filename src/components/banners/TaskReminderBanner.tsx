/**
 * 任务提醒横幅
 *
 * 当 app 被 Screen Time 锁定时，显示在 navbar 上方，
 * 提供「完成任务」和「接受后果」两个选项。
 */

interface TaskReminderBannerProps {
    /** 被锁定时关联的任务名称 */
    taskName: string;
    /** 点击「Complete Task」 */
    onCompleteTask: () => void;
    /** 点击「Accept Consequences」 */
    onAcceptConsequences: () => void;
}

/**
 * 暖色调提醒横幅，显示在底部导航栏上方
 */
export function TaskReminderBanner({
    taskName,
    onCompleteTask,
    onAcceptConsequences,
}: TaskReminderBannerProps) {
    return (
        <div
            className="absolute left-0 right-0 mx-3 rounded-2xl bg-[#FFE5D9] px-4 py-3 z-[101]"
            style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
        >
            <p className="text-sm font-medium text-gray-800 mb-3">
                <span className="mr-1">🔥</span>
                It&apos;s time for <span className="font-bold">{taskName}</span>!
                Complete your task to unlock. Or accept the consequences.
            </p>
            <div className="flex gap-2">
                <button
                    onClick={onCompleteTask}
                    className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-gray-800 shadow-sm active:scale-[0.97] transition-transform"
                >
                    Complete Task
                </button>
                <button
                    onClick={onAcceptConsequences}
                    className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-gray-800 shadow-sm active:scale-[0.97] transition-transform"
                >
                    Accept Consequences
                </button>
            </div>
        </div>
    );
}
