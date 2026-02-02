import React from 'react';
import { TalkingFire } from '../ai/TalkingFire';
import { CAMPFIRE_CONFIG, type CampfirePresenceState } from './campfireConfig';

interface CampfireBackgroundProps {
  /** AI是否正在说话 */
  isSpeaking: boolean;
  /** 篝火陪伴状态 */
  presenceState?: CampfirePresenceState;
  /** 自定义火焰配置（可选） */
  fireConfig?: Partial<typeof CAMPFIRE_CONFIG>;
}

/**
 * 篝火背景组件
 *
 * 负责渲染背景图片和火焰动画的定位
 *
 * 实现原理：
 * 1. 图片宽度铺满视窗（100vw），高度按比例自动计算
 * 2. 图片顶部和两侧对齐视窗边缘
 * 3. 火焰使用百分比定位，相对于图片容器，确保与背景同步缩放
 * 4. 如果屏幕比图片高，底部用背景色填充
 */
export const CampfireBackground: React.FC<CampfireBackgroundProps> = ({
  isSpeaking,
  presenceState = 'active',
  fireConfig,
}) => {
  const config = { ...CAMPFIRE_CONFIG, ...fireConfig };
  const fireWidthMultiplier =
    presenceState === 'active' ? 1 : presenceState === 'connecting' ? 0.95 : 0.9;
  const glowClass =
    presenceState === 'active'
      ? 'bg-orange-300/35 animate-pulse'
      : presenceState === 'connecting'
        ? 'bg-amber-200/30 animate-pulse'
        : 'bg-amber-100/20';

  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden"
      style={{ backgroundColor: config.bgColor }}
    >
      {/* 图片容器 - 宽度 100%，高度按比例自动，顶部对齐 */}
      <div className="relative w-full">
        {/* 背景图片 - 宽度铺满，高度按比例 */}
        <img
          src={config.bgImage}
          alt=""
          className="w-full h-auto block"
        />

        {/* 氛围遮罩：静默时更柔和，活跃时更明亮 */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
            presenceState === 'silent' ? 'bg-black/25' : 'bg-transparent'
          }`}
        />

        {/* 火焰动画 - 相对于图片容器定位，使用百分比确保同步缩放 */}
        <div
          className="absolute left-1/2 z-20"
          style={{
            top: `${config.fireBottomY * 100}%`,
            width: `${config.fireWidthRatio * fireWidthMultiplier * 100}%`,
            transform: 'translateX(-50%) translateY(-100%)', // 水平居中，底部对齐到 top 位置
          }}
        >
          {/* 呼吸灯效果：即使静默也有“AI 在这里”的存在感 */}
          <div
            className={`pointer-events-none absolute left-1/2 top-2/3 -z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-700 ${glowClass}`}
          />
          <TalkingFire isSpeaking={isSpeaking} size="100%" />
        </div>
      </div>
    </div>
  );
};
