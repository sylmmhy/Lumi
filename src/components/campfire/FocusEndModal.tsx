/**
 * FocusEndModal - 专注结束弹窗
 * 
 * 显示专注统计信息
 */

interface SessionStats {
  sessionId: string;
  taskDescription: string | null;
  durationSeconds: number;
  chatCount: number;
  distractionCount: number;
}

interface FocusEndModalProps {
  stats: SessionStats | null;
  onClose: () => void;
}

export function FocusEndModal({ stats, onClose }: FocusEndModalProps) {
  if (!stats) return null;

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    return `${minutes} 分钟`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="bg-gradient-to-b from-[#1a0f0a] to-[#0a0a0a] rounded-2xl p-8 max-w-md w-full border border-orange-900/50 shadow-2xl">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-yellow-400 mb-2" style={{ fontFamily: 'Sansita, sans-serif' }}>
            专注完成！
          </h2>
          <p className="text-gray-400 text-sm">
            做得很好，继续保持～
          </p>
        </div>

        {/* 统计信息 */}
        <div className="space-y-4 mb-6">
          {/* 专注时长 */}
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">专注时长</div>
            <div className="text-2xl font-bold text-yellow-400">
              {formatDuration(stats.durationSeconds)}
            </div>
          </div>

          {/* 任务描述 */}
          {stats.taskDescription && (
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">专注任务</div>
              <div className="text-white">
                {stats.taskDescription}
              </div>
            </div>
          )}

          {/* 对话统计 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">对话次数</div>
              <div className="text-xl font-bold text-white">
                {stats.chatCount}
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">分心提醒</div>
              <div className="text-xl font-bold text-white">
                {stats.distractionCount}
              </div>
            </div>
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold rounded-xl transition-all"
        >
          完成
        </button>
      </div>
    </div>
  );
}
