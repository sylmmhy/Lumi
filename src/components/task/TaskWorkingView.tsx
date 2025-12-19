import { useEffect, useState, type RefObject } from 'react';
import { CameraOff } from 'lucide-react';
import { TalkingFire } from '../ai/TalkingFire';

/**
 * TaskWorkingView - 可复用的任务执行视图组件
 * 
 * 功能：
 * - 显示摄像头画面（可选）
 * - 显示倒计时/正计时
 * - 显示任务名称
 * - 显示 AI 波形动画
 * - 显示 AI 连接状态
 * - 提供操作按钮（可自定义）
 */

export interface TaskWorkingViewProps {
  /** 任务描述 */
  taskDescription: string;

  /** 时间（秒），可以是剩余时间或已用时间 */
  time: number;

  /** 时间模式：countdown（倒计时）或 countup（正计时） */
  timeMode?: 'countdown' | 'countup';

  /** 摄像头相关 */
  camera?: {
    /** 是否启用摄像头 */
    enabled: boolean;
    /** video 元素的 ref */
    videoRef: RefObject<HTMLVideoElement | null>;
  };

  /** 切换摄像头开关（可选，提供时显示一个开关按钮） */
  onToggleCamera?: () => void;

  /** AI 状态相关（可选，如果不传则不显示 AI 相关 UI） */
  aiStatus?: {
    /** AI 是否已连接 */
    isConnected: boolean;
    /** 错误信息 */
    error?: string | null;
    /** 波形动画高度 */
    waveformHeights?: number[];
    /** 是否正在说话 */
    isSpeaking?: boolean;
  };

  /** 主按钮配置 */
  primaryButton: {
    /** 按钮文字 */
    label: string;
    /** 按钮前的 emoji（可选） */
    emoji?: string;
    /** 点击回调 */
    onClick: () => void;
  };

  /** 次要按钮配置（可选） */
  secondaryButton?: {
    /** 按钮文字 */
    label: string;
    /** 按钮前的 emoji（可选） */
    emoji?: string;
    /** 点击回调 */
    onClick: () => void;
  };

  /** 是否有底部导航栏（用于调整 padding） */
  hasBottomNav?: boolean;

  /** 背景颜色 */
  backgroundColor?: string;
}

/**
 * 格式化时间为 M:SS 格式
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(Math.abs(seconds) / 60);
  const secs = Math.abs(seconds) % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 根据当前视口宽度计算火焰尺寸：
 * - 手机视口（小于等于 640px）占屏幕宽度的 2/3，让角色更大
 * - 其他视口保持 1/2 宽度
 *
 * 通过字符串返回，便于直接传入支持 string/number 的尺寸属性。
 *
 * @returns {string} 例如 "200px"，在 SSR 环境下回退为 50vw 以避免 window 未定义。
 */
const getResponsiveFireSize = (): string => {
  if (typeof window === 'undefined') {
    return '50vw';
  }

  const MOBILE_MAX_WIDTH = 640; // Tailwind sm 断点附近，视为手机
  const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
  const ratio = isMobile ? 2 / 3 : 0.5;
  const responsiveWidth = Math.floor(window.innerWidth * ratio);
  return `${responsiveWidth}px`;
};

export function TaskWorkingView({
  taskDescription,
  time,
  timeMode = 'countdown',
  camera,
  onToggleCamera,
  aiStatus,
  primaryButton,
  secondaryButton,
  hasBottomNav = false,
  backgroundColor = '#1e1e1e',
}: TaskWorkingViewProps) {
  const displayTime = timeMode === 'countdown' ? time : time;
  const [fireSize, setFireSize] = useState<string>(getResponsiveFireSize());

  useEffect(() => {
    /**
     * 处理窗口尺寸变化，实时更新火焰尺寸（手机 2/3，其他 1/2）。
     */
    const handleResize = () => {
      setFireSize(getResponsiveFireSize());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col pt-[60px] ${hasBottomNav ? 'pb-[160px]' : 'pb-[80px]'} px-2 gap-2`}
      style={{ backgroundColor }}
    >
      {/* 主视图区域 */}
      <div className="relative flex-1 overflow-hidden rounded-[32px] bg-black flex items-center justify-center">

        {/* 1. 中央火焰动画 (最底层) */}
        <div className="z-0 flex items-center justify-center">
          <TalkingFire
            isSpeaking={aiStatus?.isSpeaking || false}
            size={fireSize} // 手机 2/3 宽，其他 1/2 宽
          />
        </div>

        {/* 2. 悬浮摄像头 (右下角) */}
        {camera?.enabled && (
          <div className="absolute bottom-4 right-4 w-[120px] h-[160px] rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-50 bg-black/50 backdrop-blur-sm">
            <video
              ref={camera.videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]" // 镜像翻转
            />
            {/* 关闭摄像头按钮 (悬浮在视频上) */}
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className="absolute top-2 right-2 w-12 h-12 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all flex items-center justify-center"
              >
                <CameraOff size={22} />
              </button>
            )}
          </div>
        )}

        {/* 摄像头开启按钮 (如果摄像头关闭，显示在右下角) */}
        {onToggleCamera && !camera?.enabled && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-1 z-40 pointer-events-none">
            <div className="text-white/60 text-sm font-medium text-left leading-tight pointer-events-auto flex-1 min-w-0">
              💡 Allow camera access so AI can better assist you.
            </div>
            <button
              onClick={onToggleCamera}
              className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-all pointer-events-auto flex-shrink-0"
              title="Turn camera on"
            >
              <CameraOff size={20} />
            </button>
          </div>
        )}

        {/* 3. AI 状态徽章 (右上角) */}
        {aiStatus && (
          <div className="absolute top-4 right-4 h-[36px] flex items-center gap-2 px-4 rounded-full bg-black/20 backdrop-blur-md border border-white/10 z-40">
            <div
              className={`w-2 h-2 rounded-full ${aiStatus.isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                }`}
            />
            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">
              {aiStatus.isConnected ? 'LIVE' : 'CONNECTING'}
            </span>
          </div>
        )}

        {/* 连接中提示 (覆盖层) */}
        {aiStatus && !aiStatus.isConnected && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-50">
            <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-brand-orange animate-spin" />
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/20 shadow-lg">
              <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
              <p className="text-white font-bold text-sm">Connecting to AI coach...</p>
            </div>
          </div>
        )}

        {/* 时间徽章（顶部居中） */}
        <div
          className="absolute top-[31px] left-1/2 -translate-x-1/2 flex items-center justify-center gap-[10px] z-40"
          style={{
            padding: '10px 30px',
            borderRadius: '200px',
            background: 'rgba(255, 255, 255, 0.15)', // 稍微透明一点，适应黑色背景
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <span
            className="text-center capitalize"
            style={{
              fontFamily: 'Sansita, sans-serif',
              fontSize: '44px',
              fontWeight: 400,
              lineHeight: '1',
              color: '#F67D01'
            }}
          >
            {formatTime(displayTime)}
          </span>
        </div>

        {/* 任务名称徽章（时间下方） */}
        <div
          className="absolute top-[107px] left-1/2 -translate-x-1/2 z-40"
          style={{
            display: 'inline-flex',
            padding: '10px 20px',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            borderRadius: '200px',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            maxWidth: '345px'
          }}
        >
          <span
            style={{
              fontFamily: 'Sansita, sans-serif',
              fontSize: '16px',
              fontWeight: 400,
              color: '#F67D01', // 保持橙色，或者改成白色 text-white/90
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {taskDescription}
          </span>
        </div>

        {/* 错误提示 */}
        {aiStatus?.error && (
          <div className="absolute top-24 left-4 right-4 bg-red-500/90 border border-red-400 rounded-xl p-3 z-50">
            <p className="text-sm text-white">{aiStatus.error}</p>
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="flex gap-4 w-full items-center">
        {/* 次要按钮（如果有） */}
        {secondaryButton && (
          <button
            onClick={secondaryButton.onClick}
            className="flex-[1] h-[56px] bg-[#2c3039] border border-[#5a5c62] rounded-[20px] flex items-center justify-center gap-[10px] px-2 active:translate-y-[2px] transition-all"
            style={{
              boxShadow: '0 4px 0 0 #444A58'
            }}
          >
            <span
              className="font-bold text-white uppercase tracking-[0.8px]"
              style={{
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                fontSize: 'clamp(12px, 3vw, 16px)',
                lineHeight: '1'
              }}
            >
              {secondaryButton.emoji && `${secondaryButton.emoji} `}
              {secondaryButton.label}
            </span>
          </button>
        )}

        {/* 主按钮 */}
        <button
          onClick={primaryButton.onClick}
          className={`${secondaryButton ? 'flex-[2]' : 'flex-1'} h-[56px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[20px] flex items-center justify-center gap-[10px] px-2 active:translate-y-[2px] transition-all`}
          style={{
            boxShadow: '0 6px 0 0 #D34A22'
          }}
        >
          <span
            className="font-bold text-black uppercase tracking-[0.8px]"
            style={{
              fontFamily: 'Inter, Noto Sans JP, sans-serif',
              whiteSpace: 'nowrap',
              fontSize: 'clamp(12px, 3vw, 16px)',
              lineHeight: '1'
            }}
          >
            {primaryButton.emoji && `${primaryButton.emoji} `}
            {primaryButton.label}
          </span>
        </button>
      </div>
    </div>
  );
}
