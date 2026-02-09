/**
 * CampfireFocusView - 篝火专注模式核心 UI
 * 
 * 功能：
 * - 显示火焰动画（TalkingFire）
 * - 显示专注计时
 * - 显示状态指示器
 * - 控制白噪音
 * - 结束按钮
 */

import { TalkingFire } from '../ai/TalkingFire';
import { useCampfireSession } from '../../hooks/campfire';
import { useAuth } from '../../hooks/useAuth';

interface SessionStats {
  sessionId: string;
  taskDescription: string | null;
  durationSeconds: number;
  chatCount: number;
}

interface CampfireFocusViewProps {
  onEnd?: (stats: SessionStats | null) => void;
}

export function CampfireFocusView({ onEnd }: CampfireFocusViewProps) {
  const { userId } = useAuth();
  
  // 开发模式下如果没有登录，使用测试 ID
  const effectiveUserId = userId || (import.meta.env.DEV ? 'dev-test-user' : '');
  
  const session = useCampfireSession({
    userId: effectiveUserId,
    aiTone: 'gentle',
    language: 'zh',
    idleTimeout: 30,
    onSessionEnd: (stats) => {
      console.log('Session ended:', stats);
      onEnd?.(stats);
    },
  });

  // 状态指示器文本
  const getStatusText = () => {
    switch (session.status) {
      case 'idle':
        return '';
      case 'starting':
        return '🔌 连接中...';
      case 'focusing':
        return '🔥 专注中';
      case 'connecting':
        return '🎤 正在听...';
      case 'active':
        return '💬 对话中';
      case 'ending':
        return '✨ 结束中...';
      case 'ended':
        return '✅ 已结束';
      default:
        return '';
    }
  };

  // 开始会话
  const handleStart = async () => {
    try {
      await session.startSession();
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  // 结束会话
  const handleEnd = async () => {
    try {
      await session.endSession();
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  // 未开始状态
  if (session.status === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#1a0f0a] to-[#0a0a0a] flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-yellow-400 mb-4" style={{ fontFamily: 'Sansita, sans-serif' }}>
            🔥 篝火专注模式
          </h1>
          <p className="text-gray-400 text-lg mb-2">
            安静陪伴，专注工作
          </p>
          <p className="text-gray-500 text-sm">
            需要时随时可以和我说话
          </p>
        </div>

        <button
          onClick={handleStart}
          className="px-8 py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg text-lg"
        >
          开始专注
        </button>
      </div>
    );
  }

  // 进行中状态
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#1a0f0a] to-[#0a0a0a] flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={handleEnd}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← 返回
        </button>

        <div className="flex items-center gap-4">
          {/* 状态指示器 */}
          <div className="text-sm text-gray-400">
            {getStatusText()}
          </div>

          {/* 白噪音控制 */}
          <button
            onClick={session.toggleAmbient}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              session.isAmbientPlaying
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            🔊
          </button>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* 火焰动画 */}
        <div className="mb-8">
          <TalkingFire
            isSpeaking={session.isSpeaking}
            size={200}
          />
        </div>

        {/* 专注计时 */}
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-yellow-400 mb-2" style={{ fontFamily: 'monospace' }}>
            {session.formattedTime}
          </div>
          <div className="text-gray-400 text-sm">
            专注中
          </div>
        </div>

        {/* 统计信息（调试用，可选） */}
        {import.meta.env.DEV && (
          <div className="text-xs text-gray-500 mb-4 space-y-1">
            <div>对话次数: {session.chatCount}</div>
            <div>状态: {session.status}</div>
          </div>
        )}

        {/* 结束按钮 */}
        <button
          onClick={handleEnd}
          disabled={session.status === 'ending' || session.status === 'ended'}
          className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {session.status === 'ending' ? '结束中...' : '结束专注'}
        </button>
      </div>

      {/* 错误提示 */}
      {session.error && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-900/90 text-red-100 px-4 py-3 rounded-lg text-sm">
          ❌ {session.error}
        </div>
      )}
    </div>
  );
}
