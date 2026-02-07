/**
 * 任务完成确认弹窗
 *
 * 当用户点击 Banner 中的「Complete Task」时弹出，
 * 提供「已完成」和「让 Lumi 帮忙启动」两个选项。
 */

interface TaskCompletionModalProps {
    /** 是否显示弹窗 */
    isOpen: boolean;
    /** 点击「Already completed」 */
    onAlreadyCompleted: () => void;
    /** 点击「Let Lumi help me start」 */
    onLetLumiHelp: () => void;
    /** 关闭弹窗 */
    onClose: () => void;
}

/**
 * 半透明遮罩 + 居中卡片弹窗
 */
export function TaskCompletionModal({
    isOpen,
    onAlreadyCompleted,
    onLetLumiHelp,
    onClose,
}: TaskCompletionModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50"
            onClick={onClose}
        >
            <div
                className="mx-6 w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-center text-lg font-bold text-gray-900 mb-2">
                    Task Completion
                </h2>
                <p className="text-center text-sm text-gray-500 mb-6">
                    Already completed or want Lumi to help you?
                </p>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={onAlreadyCompleted}
                        className="w-full rounded-2xl bg-green-500 py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.97] transition-transform"
                    >
                        Already Completed
                    </button>
                    <button
                        onClick={onLetLumiHelp}
                        className="w-full rounded-2xl bg-[#0B1220] py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.97] transition-transform"
                    >
                        Let Lumi Help Me Start
                    </button>
                </div>
            </div>
        </div>
    );
}
