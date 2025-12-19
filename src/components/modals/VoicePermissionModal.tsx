import React from 'react';

interface VoicePermissionModalProps {
    /** 是否显示模态框 */
    isOpen: boolean;
    /** 点击「OK」后的回调，用于继续后续的权限申请或启动流程 */
    onConfirm: () => void;
    /** 点击关闭或取消时的回调，终止当前启动操作 */
    onCancel: () => void;
}

/**
 * 首次启动时提醒用户开启语音权限的模态框（无需摄像头）。
 *
 * @param {VoicePermissionModalProps} props - 控制打开状态与确认/取消回调
 * @returns {JSX.Element | null} 提示用户授权语音的模态框
 */
export const VoicePermissionModal: React.FC<VoicePermissionModalProps> = ({ isOpen, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative">
                <button
                    type="button"
                    aria-label="Close"
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors"
                    onClick={onCancel}
                >
                    ×
                </button>

                <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-yellow-100 text-yellow-700 flex items-center justify-center text-xl">
                            🔔
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">Enable voice</h2>
                    </div>
                    <p className="text-gray-600 leading-relaxed">
                        Turn on microphone so AI can assist you.
                    </p>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 font-medium hover:bg-gray-50 transition-colors"
                            onClick={onCancel}
                        >
                            Not now
                        </button>
                        <button
                            type="button"
                            className="flex-1 bg-brand-yellow text-brand-darkOrange rounded-xl py-3 font-semibold shadow hover:brightness-110 transition-transform active:scale-95"
                            onClick={onConfirm}
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
