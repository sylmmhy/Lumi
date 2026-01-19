/**
 * EnergyBall - 液体波浪充能球组件
 *
 * 触发式物理动画：
 * - 默认状态：水面静止
 * - 进度增加时：触发波浪晃动，然后物理衰减至静止
 */

import React, { useEffect, useState, useRef } from 'react';

interface EnergyBallProps {
    /** 当前完成数 */
    current: number;
    /** 目标数 */
    target: number;
    /** 触发水位上涨动画 */
    triggerRise?: boolean;
}

/**
 * 液体波浪充能球组件
 */
export const EnergyBall: React.FC<EnergyBallProps> = ({
    current,
    target,
    triggerRise = false,
}) => {
    const percentage = Math.min((current / target) * 100, 100);
    const [isRising, setIsRising] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    // 保存上一次的 current 值，用于检测变化
    const prevCurrentRef = useRef(current);

    // 物理动画状态
    const waveStateRef = useRef({
        amplitude: 0,        // 当前振幅（会衰减）
        phase: 0,            // 当前相位
        isAnimating: false,  // 是否正在动画
    });

    // 监听 triggerRise 触发缩放效果
    useEffect(() => {
        if (triggerRise) {
            setIsRising(true);
            const timer = setTimeout(() => setIsRising(false), 600);
            return () => clearTimeout(timer);
        }
    }, [triggerRise]);

    // 监听 current 变化，触发波浪动画
    useEffect(() => {
        if (current > prevCurrentRef.current) {
            // 进度增加了，触发波浪！
            waveStateRef.current.amplitude = 12; // 初始振幅
            waveStateRef.current.isAnimating = true;
        }
        prevCurrentRef.current = current;
    }, [current]);

    // 首次挂载时触发一次波浪动画（页面进入时的视觉反馈）
    useEffect(() => {
        const timer = setTimeout(() => {
            waveStateRef.current.amplitude = 8; // 稍小的初始振幅
            waveStateRef.current.isAnimating = true;
        }, 300); // 延迟 300ms，等页面渲染完成
        return () => clearTimeout(timer);
    }, []);

    // 尺寸配置
    const size = 96;
    const borderWidth = 6;
    const innerSize = size - borderWidth * 2;

    // Canvas 绘制
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 高清屏适配
        const dpr = window.devicePixelRatio || 1;
        canvas.width = innerSize * dpr;
        canvas.height = innerSize * dpr;
        ctx.scale(dpr, dpr);

        // 衰减系数（越接近 1，衰减越慢，晃动越久）
        const dampingFactor = 0.99;
        // 停止动画的振幅阈值（越小，余波荡漾越久）
        const stopThreshold = 0.1;

        const draw = () => {
            ctx.clearRect(0, 0, innerSize, innerSize);

            const state = waveStateRef.current;

            // 水位高度（从顶部算起）
            const waterLevel = innerSize - (percentage / 100) * innerSize;

            // 如果正在动画，更新相位和衰减振幅
            if (state.isAnimating) {
                state.phase += 0.08; // 相位递增速度
                state.amplitude *= dampingFactor; // 振幅衰减

                // 振幅低于阈值，停止动画
                if (state.amplitude < stopThreshold) {
                    state.amplitude = 0;
                    state.isAnimating = false;
                }
            }

            // 当前振幅（静止时为 0）
            const currentAmplitude = state.amplitude;

            // 波长配置（平缓的大波浪）
            const backWavelength = innerSize * 2.5;
            const frontWavelength = innerSize * 1.8;

            // 绘制后层波浪（浅色）
            ctx.beginPath();
            ctx.moveTo(0, innerSize);
            for (let x = 0; x <= innerSize; x++) {
                const waveY = currentAmplitude * Math.sin((x / backWavelength) * Math.PI * 2 + state.phase);
                ctx.lineTo(x, waterLevel + waveY);
            }
            ctx.lineTo(innerSize, innerSize);
            ctx.closePath();
            ctx.fillStyle = '#FAE59D';
            ctx.fill();

            // 绘制前层波浪（深色，相位偏移 + 反向）
            ctx.beginPath();
            ctx.moveTo(0, innerSize);
            for (let x = 0; x <= innerSize; x++) {
                const waveY = currentAmplitude * 0.8 * Math.sin((x / frontWavelength) * Math.PI * 2 - state.phase * 0.7 + Math.PI * 0.5);
                ctx.lineTo(x, waterLevel + waveY);
            }
            ctx.lineTo(innerSize, innerSize);
            ctx.closePath();
            ctx.fillStyle = '#F9CF3A';
            ctx.fill();

            animationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationRef.current);
        };
    }, [percentage, innerSize]);

    return (
        <div className={`relative transition-transform duration-300 ${isRising ? 'scale-110' : 'scale-100'}`}>
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
                {/* 内层圆形容器（遮罩） */}
                <div
                    className="relative rounded-full overflow-hidden"
                    style={{
                        width: innerSize,
                        height: innerSize,
                        backgroundColor: '#FFF8E7',
                    }}
                >
                    {/* Canvas 波浪 */}
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: innerSize,
                            height: innerSize,
                        }}
                    />
                </div>
            </div>

            {/* 中心文字 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                    className="font-extrabold text-2xl leading-none"
                    style={{
                        fontFamily: "'Quicksand', sans-serif",
                        color: '#8B5A3C',
                    }}
                >
                    {current}/{target}
                </span>
                <span
                    className="leading-none whitespace-nowrap"
                    style={{
                        fontFamily: "'Quicksand', sans-serif",
                        color: '#AC6F46',
                        fontSize: '7px',
                        marginTop: '3px',
                    }}
                >
                    Monthly Progress
                </span>
            </div>
        </div>
    );
};

export default EnergyBall;
