/**
 * WaterTankProgress - 蓄水池/充能球进度组件
 *
 * 设计理念：
 * - 去压力化：不展示"连胜/断签"，只展示"累计"
 * - 物理隐喻：像蓄水池一样，每完成一个任务就"蓄一点水"
 * - 视觉反馈：波浪动画增加趣味性
 */

import React, { useEffect, useState } from 'react';

interface WaterTankProgressProps {
    /** 当前完成数 */
    current: number;
    /** 目标数 */
    target: number;
    /** 主文案，默认 "You're building momentum!" */
    slogan?: string;
    /** 触发水位上涨动画（当 checkIn 时设为 true） */
    triggerRise?: boolean;
}

/**
 * 蓄水池进度组件
 *
 * 功能：
 * 1. 显示圆形容器，内部有波浪动画
 * 2. 水位高度 = (current / target) * 100%
 * 3. 中心显示 "current/target" 数字
 * 4. triggerRise 为 true 时播放水位上涨动画
 */
export const WaterTankProgress: React.FC<WaterTankProgressProps> = ({
    current,
    target,
    slogan = "You're building momentum!",
    triggerRise = false,
}) => {
    // 计算水位百分比（0-100）
    const percentage = Math.min((current / target) * 100, 100);

    // 动画状态：用于水位上涨效果
    const [animatedPercentage, setAnimatedPercentage] = useState(percentage);
    const [isRising, setIsRising] = useState(false);

    // 当 percentage 变化时，触发平滑动画
    useEffect(() => {
        setAnimatedPercentage(percentage);
    }, [percentage]);

    // 当 triggerRise 为 true 时，触发上涨动画
    useEffect(() => {
        if (triggerRise) {
            setIsRising(true);
            const timer = setTimeout(() => setIsRising(false), 600);
            return () => clearTimeout(timer);
        }
    }, [triggerRise, current]);

    // SVG 尺寸
    const size = 128;
    const center = size / 2;
    const radius = 56;

    // 水位 Y 坐标（从下往上）
    // 当 percentage = 0 时，Y = center + radius（最底部）
    // 当 percentage = 100 时，Y = center - radius（最顶部）
    const waterY = center + radius - (animatedPercentage / 100) * (radius * 2);

    return (
        <div className="flex flex-col items-center py-6">
            {/* 主文案 */}
            <p className="text-white text-lg font-medium mb-4 text-center px-4 italic"
               style={{ fontFamily: "'Sansita', sans-serif" }}
            >
                {slogan}
            </p>

            {/* 蓄水池容器 */}
            <div className={`relative transition-transform duration-300 ${isRising ? 'scale-110' : 'scale-100'}`}>
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    className="drop-shadow-lg"
                >
                    {/* 定义渐变和 clipPath */}
                    <defs>
                        {/* 水的渐变色 - 金色 */}
                        <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#F5D76E" stopOpacity="1" />
                            <stop offset="100%" stopColor="#D4A84B" stopOpacity="1" />
                        </linearGradient>

                        {/* 圆形裁剪区域 */}
                        <clipPath id="circleClip">
                            <circle cx={center} cy={center} r={radius} />
                        </clipPath>

                        {/* 波浪 pattern */}
                        <pattern id="wavePattern" x="0" y="0" width="200" height="20" patternUnits="userSpaceOnUse">
                            <path
                                d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V30 H0 Z"
                                fill="rgba(255,255,255,0.3)"
                            />
                        </pattern>
                    </defs>

                    {/* 背景圆（浅灰） */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="#F0F0F0"
                        stroke="#E0E0E0"
                        strokeWidth="2"
                    />

                    {/* 水位区域 */}
                    <g clipPath="url(#circleClip)">
                        {/* 水体（金色） */}
                        <rect
                            x={center - radius}
                            y={waterY}
                            width={radius * 2}
                            height={radius * 2}
                            fill="url(#waterGradient)"
                            className="transition-all duration-500 ease-out"
                        />

                        {/* 波浪层 1（动画） */}
                        <rect
                            x={center - radius - 100}
                            y={waterY - 8}
                            width={radius * 4 + 200}
                            height="20"
                            fill="rgba(255,255,255,0.25)"
                            className="water-wave-1"
                        />

                        {/* 波浪层 2（稍慢的动画） */}
                        <rect
                            x={center - radius - 50}
                            y={waterY - 4}
                            width={radius * 4 + 100}
                            height="16"
                            fill="rgba(255,255,255,0.15)"
                            className="water-wave-2"
                        />
                    </g>

                    {/* 外圈描边 */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="3"
                    />
                </svg>

                {/* 中心数字 */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span
                        className={`font-bold text-2xl transition-colors duration-300 ${
                            percentage > 50 ? 'text-white' : 'text-gray-700'
                        }`}
                        style={{ fontFamily: "'Quicksand', sans-serif" }}
                    >
                        {current}/{target}
                    </span>
                </div>
            </div>

            {/* CSS 动画样式 */}
            <style>{`
                @keyframes wave1 {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100px); }
                }
                @keyframes wave2 {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50px); }
                }
                .water-wave-1 {
                    animation: wave1 3s linear infinite;
                }
                .water-wave-2 {
                    animation: wave2 4s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default WaterTankProgress;
