/**
 * TaskCompletionModal - 任务完成确认弹窗
 *
 * 当用户点击"结束对话"按钮后，弹出询问是否完成了任务
 * 用户必须选择"是"或"否"才能继续
 */

import { useTranslation } from '../../hooks/useTranslation';

interface TaskCompletionModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 用户点击"是，我完成了" */
  onConfirmComplete: () => void;
  /** 用户点击"否，我没完成" */
  onConfirmIncomplete: () => void;
  /** 任务描述（可选） */
  taskDescription?: string;
}

export function TaskCompletionModal({
  isOpen,
  onConfirmComplete,
  onConfirmIncomplete,
  taskDescription,
}: TaskCompletionModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-3xl bg-gradient-to-b from-gray-800 to-gray-900 p-6 shadow-2xl border border-white/10">
        {/* 标题 */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl">🎯</div>
          <h2 className="mb-2 text-2xl font-bold text-white">{t('session.completionModal.title')}</h2>
          {taskDescription && (
            <p className="text-sm text-gray-400">
              {taskDescription}
            </p>
          )}
        </div>

        {/* 说明文字 */}
        <p className="mb-6 text-center text-gray-300">
          {t('session.completionModal.description')}
        </p>

        {/* 按钮组 */}
        <div className="flex flex-col gap-3">
          {/* 是，我完成了 */}
          <button
            onClick={onConfirmComplete}
            className="w-full h-14 bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-2xl flex items-center justify-center gap-2 active:translate-y-[2px] transition-all"
            style={{
              boxShadow: '0 6px 0 0 #D34A22'
            }}
          >
            <span className="text-2xl">✅</span>
            <span
              className="font-bold text-black uppercase tracking-wide"
              style={{
                fontFamily: 'Inter, Noto Sans JP, sans-serif',
                fontSize: '16px',
              }}
            >
              {t('session.completionModal.confirmComplete')}
            </span>
          </button>

          {/* 否，我没完成 */}
          <button
            onClick={onConfirmIncomplete}
            className="w-full h-14 bg-[#2c3039] border border-[#5a5c62] rounded-2xl flex items-center justify-center gap-2 active:translate-y-[2px] transition-all"
            style={{
              boxShadow: '0 4px 0 0 #444A58'
            }}
          >
            <span className="text-2xl">❌</span>
            <span
              className="font-bold text-white uppercase tracking-wide"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '16px',
              }}
            >
              {t('session.completionModal.confirmIncomplete')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
