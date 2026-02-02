/**
 * 篝火陪伴模式布局配置
 */
export const CAMPFIRE_CONFIG = {
  /** 背景图片宽度（从 campfire-bg.png 元数据获取） */
  bgWidth: 1179,
  /** 背景图片高度（从 campfire-bg.png 元数据获取） */
  bgHeight: 1926,
  /** 背景图片资源 */
  bgImage: '/campfire-bg.png',
  /** 火焰底部在图片中的垂直位置，0-1（从设计稿测量） */
  fireBottomY: 0.64,
  /** 火焰宽度占图片宽度的比例，0-1（视觉调优得出） */
  fireWidthRatio: 0.5,
  /** 背景填充色（与图片底部边缘颜色一致，用于填充超出区域） */
  bgColor: '#1D1B3D',
} as const;

/**
 * 陪伴状态（用于火焰视觉变化）
 */
export type CampfirePresenceState = 'active' | 'silent' | 'connecting';

/**
 * 环境音类型
 */
export type CampfireSoundscapeId = 'campfire' | 'rain' | 'coffee';

/**
 * 环境音预设
 * 说明：雨声/咖啡厅暂时只有占位选项，尚未提供真实音源或模拟处理。
 */
export interface CampfireSoundscapePreset {
  id: CampfireSoundscapeId;
  label: string;
  description: string;
  /** 是否已有可用音源 */
  isAvailable: boolean;
  playbackRate: number;
  outputGain: number;
}

/**
 * 环境音预设列表
 */
export const CAMPFIRE_SOUNDSCAPE_PRESETS: CampfireSoundscapePreset[] = [
  {
    id: 'campfire',
    label: '篝火',
    description: '温暖噼啪声',
    isAvailable: true,
    playbackRate: 1,
    outputGain: 1,
  },
  {
    id: 'rain',
    label: '雨声',
    description: '待上线',
    isAvailable: false,
    playbackRate: 1,
    outputGain: 1,
  },
  {
    id: 'coffee',
    label: '咖啡厅',
    description: '待上线',
    isAvailable: false,
    playbackRate: 1,
    outputGain: 1,
  },
];
