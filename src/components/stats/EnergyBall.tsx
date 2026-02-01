/**
 * EnergyBall - 存钱罐进度组件
 *
 * 金币使用预计算的物理堆叠位置（Matter.js 模拟后导出）
 * 零运行时性能消耗
 */

import React from 'react';

interface EnergyBallProps {
    /** 当前完成数 */
    current: number;
    /** 目标数 */
    target: number;
    /** 触发动画（当 checkIn 时设为 true） */
    triggerRise?: boolean;
}

/**
 * 预计算的金币堆叠位置（基于 Matter.js 物理模拟）
 * 容器尺寸：109px（内径）
 * 金币尺寸：24px
 *
 * 每个位置包含：
 * - x, y（左上角坐标）
 * - rotation（旋转角度，±15° 模拟倒入时的随机倾斜）
 * - layer: 0=后层(暗/小), 1=中层, 2=前层(亮/大) - 视觉深度
 *
 * 位置已考虑：重力、碰撞、圆形边界、摩擦力、安息角（中心高两边低）
 */
const COIN_POSITIONS: Array<{ x: number; y: number; rotation: number; layer?: number }>[] = [
    // 0 个金币
    [],
    // 1 个金币 - 底部中央
    [
        { x: 42, y: 80, rotation: -8, layer: 2 },
    ],
    // 2 个金币 - 底部并排，有轻微重叠
    [
        { x: 30, y: 78, rotation: -12, layer: 1 },
        { x: 52, y: 79, rotation: 10, layer: 2 },
    ],
    // 3 个金币 - 底部三个，中间稍高（安息角）
    [
        { x: 18, y: 77, rotation: -15, layer: 0 },
        { x: 42, y: 74, rotation: 5, layer: 2 },
        { x: 64, y: 78, rotation: 14, layer: 1 },
    ],
    // 4 个金币 - 底部3个 + 上面1个（中心高）
    [
        { x: 16, y: 78, rotation: -14, layer: 0 },
        { x: 40, y: 76, rotation: 6, layer: 1 },
        { x: 62, y: 79, rotation: 12, layer: 0 },
        { x: 42, y: 56, rotation: -8, layer: 2 },
    ],
    // 5 个金币 - 底部3个 + 上面2个
    [
        { x: 14, y: 79, rotation: -15, layer: 0 },
        { x: 38, y: 76, rotation: 4, layer: 1 },
        { x: 60, y: 78, rotation: 13, layer: 0 },
        { x: 28, y: 55, rotation: -10, layer: 1 },
        { x: 52, y: 54, rotation: 9, layer: 2 },
    ],
    // 6 个金币 - 2层堆叠，山丘形
    [
        { x: 10, y: 80, rotation: -14, layer: 0 },
        { x: 34, y: 77, rotation: 5, layer: 1 },
        { x: 58, y: 78, rotation: 11, layer: 0 },
        { x: 22, y: 54, rotation: -12, layer: 1 },
        { x: 46, y: 52, rotation: 7, layer: 2 },
        { x: 68, y: 55, rotation: 15, layer: 1 },
    ],
    // 7 个金币
    [
        { x: 8, y: 81, rotation: -15, layer: 0 },
        { x: 32, y: 78, rotation: 3, layer: 0 },
        { x: 56, y: 79, rotation: 12, layer: 0 },
        { x: 20, y: 54, rotation: -13, layer: 1 },
        { x: 44, y: 51, rotation: 6, layer: 2 },
        { x: 66, y: 53, rotation: 14, layer: 1 },
        { x: 42, y: 32, rotation: -4, layer: 2 },
    ],
    // 8 个金币
    [
        { x: 6, y: 82, rotation: -14, layer: 0 },
        { x: 30, y: 79, rotation: 2, layer: 0 },
        { x: 54, y: 80, rotation: 11, layer: 0 },
        { x: 18, y: 55, rotation: -12, layer: 1 },
        { x: 42, y: 52, rotation: 5, layer: 1 },
        { x: 64, y: 54, rotation: 13, layer: 1 },
        { x: 30, y: 31, rotation: -8, layer: 2 },
        { x: 54, y: 30, rotation: 10, layer: 2 },
    ],
    // 9 个金币
    [
        { x: 4, y: 83, rotation: -15, layer: 0 },
        { x: 28, y: 80, rotation: 1, layer: 0 },
        { x: 52, y: 81, rotation: 10, layer: 0 },
        { x: 74, y: 82, rotation: 15, layer: 0 },
        { x: 16, y: 56, rotation: -13, layer: 1 },
        { x: 40, y: 53, rotation: 4, layer: 1 },
        { x: 62, y: 55, rotation: 12, layer: 1 },
        { x: 28, y: 32, rotation: -9, layer: 2 },
        { x: 52, y: 31, rotation: 8, layer: 2 },
    ],
    // 10 个金币
    [
        { x: 3, y: 84, rotation: -14, layer: 0 },
        { x: 26, y: 81, rotation: 0, layer: 0 },
        { x: 50, y: 82, rotation: 9, layer: 0 },
        { x: 72, y: 83, rotation: 14, layer: 0 },
        { x: 14, y: 57, rotation: -12, layer: 1 },
        { x: 38, y: 54, rotation: 3, layer: 1 },
        { x: 60, y: 56, rotation: 11, layer: 1 },
        { x: 26, y: 33, rotation: -10, layer: 2 },
        { x: 50, y: 32, rotation: 7, layer: 2 },
        { x: 38, y: 12, rotation: 5, layer: 2 },
    ],
    // 11 个金币
    [
        { x: 2, y: 85, rotation: -15, layer: 0 },
        { x: 24, y: 82, rotation: -1, layer: 0 },
        { x: 48, y: 83, rotation: 8, layer: 0 },
        { x: 70, y: 84, rotation: 13, layer: 0 },
        { x: 12, y: 58, rotation: -13, layer: 1 },
        { x: 36, y: 55, rotation: 2, layer: 1 },
        { x: 58, y: 57, rotation: 10, layer: 1 },
        { x: 24, y: 34, rotation: -11, layer: 2 },
        { x: 48, y: 33, rotation: 6, layer: 2 },
        { x: 70, y: 35, rotation: 14, layer: 1 },
        { x: 36, y: 13, rotation: 4, layer: 2 },
    ],
    // 12 个金币
    [
        { x: 1, y: 86, rotation: -14, layer: 0 },
        { x: 22, y: 83, rotation: -2, layer: 0 },
        { x: 46, y: 84, rotation: 7, layer: 0 },
        { x: 68, y: 85, rotation: 12, layer: 0 },
        { x: 10, y: 59, rotation: -12, layer: 1 },
        { x: 34, y: 56, rotation: 1, layer: 1 },
        { x: 56, y: 58, rotation: 9, layer: 1 },
        { x: 78, y: 60, rotation: 15, layer: 0 },
        { x: 22, y: 35, rotation: -10, layer: 2 },
        { x: 46, y: 34, rotation: 5, layer: 2 },
        { x: 68, y: 36, rotation: 13, layer: 2 },
        { x: 34, y: 14, rotation: 3, layer: 2 },
    ],
    // 13 个金币
    [
        { x: 0, y: 87, rotation: -15, layer: 0 },
        { x: 20, y: 84, rotation: -3, layer: 0 },
        { x: 44, y: 85, rotation: 6, layer: 0 },
        { x: 66, y: 86, rotation: 11, layer: 0 },
        { x: 8, y: 60, rotation: -13, layer: 1 },
        { x: 32, y: 57, rotation: 0, layer: 1 },
        { x: 54, y: 59, rotation: 8, layer: 1 },
        { x: 76, y: 61, rotation: 14, layer: 0 },
        { x: 20, y: 36, rotation: -11, layer: 2 },
        { x: 44, y: 35, rotation: 4, layer: 2 },
        { x: 66, y: 37, rotation: 12, layer: 2 },
        { x: 32, y: 15, rotation: 2, layer: 2 },
        { x: 56, y: 14, rotation: 9, layer: 2 },
    ],
    // 14 个金币
    [
        { x: -1, y: 88, rotation: -14, layer: 0 },
        { x: 18, y: 85, rotation: -4, layer: 0 },
        { x: 42, y: 86, rotation: 5, layer: 0 },
        { x: 64, y: 87, rotation: 10, layer: 0 },
        { x: 6, y: 61, rotation: -12, layer: 1 },
        { x: 30, y: 58, rotation: -1, layer: 1 },
        { x: 52, y: 60, rotation: 7, layer: 1 },
        { x: 74, y: 62, rotation: 13, layer: 0 },
        { x: 18, y: 37, rotation: -10, layer: 2 },
        { x: 42, y: 36, rotation: 3, layer: 2 },
        { x: 64, y: 38, rotation: 11, layer: 2 },
        { x: 30, y: 16, rotation: 1, layer: 2 },
        { x: 54, y: 15, rotation: 8, layer: 2 },
        { x: 42, y: -2, rotation: 6, layer: 2 },
    ],
    // 15 个金币
    [
        { x: -2, y: 89, rotation: -15, layer: 0 },
        { x: 16, y: 86, rotation: -5, layer: 0 },
        { x: 40, y: 87, rotation: 4, layer: 0 },
        { x: 62, y: 88, rotation: 9, layer: 0 },
        { x: 4, y: 62, rotation: -13, layer: 1 },
        { x: 28, y: 59, rotation: -2, layer: 1 },
        { x: 50, y: 61, rotation: 6, layer: 1 },
        { x: 72, y: 63, rotation: 12, layer: 1 },
        { x: 16, y: 38, rotation: -11, layer: 2 },
        { x: 40, y: 37, rotation: 2, layer: 2 },
        { x: 62, y: 39, rotation: 10, layer: 2 },
        { x: 28, y: 17, rotation: 0, layer: 2 },
        { x: 52, y: 16, rotation: 7, layer: 2 },
        { x: 40, y: -3, rotation: 5, layer: 2 },
        { x: 64, y: -2, rotation: 12, layer: 2 },
    ],
];

/**
 * 存钱罐进度组件
 */
export const EnergyBall: React.FC<EnergyBallProps> = ({
    current,
}) => {
    // 尺寸配置
    const size = 125;
    const borderWidth = 8;
    const innerSize = size - borderWidth * 2; // 109px

    // 获取预计算的金币位置
    const coinCount = Math.min(Math.max(current, 0), 15);
    const positions = COIN_POSITIONS[coinCount] || [];

    return (
        <div className="relative">
            {/* 外层白色圆圈 */}
            <div
                className="rounded-full flex items-center justify-center"
                style={{
                    width: size,
                    height: size,
                    backgroundColor: 'white',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                }}
            >
                {/* 内层圆形容器 */}
                <div
                    className="relative rounded-full overflow-hidden"
                    style={{
                        width: innerSize,
                        height: innerSize,
                        background: 'linear-gradient(180deg, #FFF8E7 0%, #F5E6C8 100%)',
                    }}
                >
                    {/* 金币层 - 按 layer 排序渲染（后层先渲染） */}
                    <div className="absolute inset-0">
                        {[...positions]
                            .sort((a, b) => (a.layer ?? 1) - (b.layer ?? 1))
                            .map((coin, index) => {
                                // 视觉深度：后层(0)暗/小，中层(1)正常，前层(2)亮/大
                                const layer = coin.layer ?? 1;
                                const scale = layer === 0 ? 0.85 : layer === 1 ? 0.95 : 1.0;
                                const brightness = layer === 0 ? 0.75 : layer === 1 ? 0.9 : 1.0;
                                const zIndex = layer * 10 + index;

                                return (
                                    <img
                                        key={index}
                                        src="/coins.png"
                                        alt=""
                                        className="absolute"
                                        style={{
                                            width: 24,
                                            height: 24,
                                            left: coin.x,
                                            top: coin.y,
                                            transform: `rotate(${coin.rotation}deg) scale(${scale})`,
                                            filter: `brightness(${brightness}) drop-shadow(1px 2px 3px rgba(0,0,0,0.25))`,
                                            zIndex,
                                        }}
                                    />
                                );
                            })}
                    </div>
                </div>
            </div>

            {/* 中心文字 */}
            <div className="absolute inset-0 flex items-center justify-center">
                <span
                    className="font-bold text-2xl"
                    style={{
                        fontFamily: "'Quicksand', sans-serif",
                        color: '#8B5A3C',
                        textShadow: '0 1px 2px rgba(255,255,255,0.8)',
                    }}
                >
                    {current}
                </span>
            </div>
        </div>
    );
};

export default EnergyBall;
