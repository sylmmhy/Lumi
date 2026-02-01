/**
 * EnergyBall - 存钱罐进度组件
 *
 * Matter.js 物理引擎 + 多角度金币素材
 *
 * 视觉规格：
 * 1. 纹理权重：正面/微侧面 80%，全侧面 20%
 * 2. 旋转限制：±30° 以内，防止"金墩子"
 * 3. 物理参数：高摩擦 + 轻微弹性
 * 4. 纵深感：底层 brightness(0.8) contrast(1.1)
 * 5. 数字置顶：毛玻璃背景 blur(5px)
 */

import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

interface EnergyBallProps {
    current: number;
    target: number;
    triggerRise?: boolean;
}

interface CoinState {
    x: number;
    y: number;
    rotation: number;
    textureIndex: number;
    spawnOrder: number;
}

/**
 * 金币纹理配置
 * - 正面/微侧面 (coin-0 ~ coin-3): 权重高，占 80%
 * - 全侧面 (coin-4 ~ coin-9): 权重低，占 20%
 */
const COIN_TEXTURES = {
    // 正面和微侧面（高权重）
    front: [
        '/coins/coin-0.png',
        '/coins/coin-1.png',
        '/coins/coin-2.png',
        '/coins/coin-3.png',
    ],
    // 全侧面（低权重）
    side: [
        '/coins/coin-4.png',
        '/coins/coin-5.png',
        '/coins/coin-6.png',
        '/coins/coin-7.png',
        '/coins/coin-8.png',
        '/coins/coin-9.png',
    ],
};

/**
 * 根据权重随机选择纹理
 * 80% 概率选正面/微侧面，20% 概率选全侧面
 */
function getRandomTexture(): string {
    const isFront = Math.random() < 0.8;
    if (isFront) {
        const idx = Math.floor(Math.random() * COIN_TEXTURES.front.length);
        return COIN_TEXTURES.front[idx];
    } else {
        const idx = Math.floor(Math.random() * COIN_TEXTURES.side.length);
        return COIN_TEXTURES.side[idx];
    }
}

/**
 * 存钱罐进度组件
 */
export const EnergyBall: React.FC<EnergyBallProps> = ({ current }) => {
    const size = 125;
    const borderWidth = 8;
    const innerSize = size - borderWidth * 2; // 109px
    const coinSize = 18; // 保持正方形，不拉伸
    const radius = innerSize / 2;

    const [coins, setCoins] = useState<CoinState[]>([]);
    const engineRef = useRef<Matter.Engine | null>(null);
    const coinBodiesRef = useRef<Matter.Body[]>([]);
    const textureMapRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        const coinCount = Math.min(Math.max(current, 0), 40);

        if (coinCount === 0) {
            setCoins([]);
            return;
        }

        // 清理之前的引擎
        if (engineRef.current) {
            Matter.World.clear(engineRef.current.world, false);
            Matter.Engine.clear(engineRef.current);
        }

        // 创建物理引擎 - 增加重力感
        const engine = Matter.Engine.create({
            gravity: { x: 0, y: 1.5 }, // 调高重力，让金币更快沉底
        });
        engineRef.current = engine;

        const world = engine.world;

        // 创建圆形边界（下半圆弧）
        const segments = 20;
        const wallThickness = 15;
        const containerOffset = 0; // 不向下偏移，保持金币在可视区域内
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI;
            const nextAngle = ((i + 1) / segments) * Math.PI;
            const midAngle = (angle + nextAngle) / 2;

            const wallRadius = radius + 5; // 扩大边界半径
            const x = radius + Math.cos(midAngle) * wallRadius;
            const y = radius + Math.sin(midAngle) * wallRadius + containerOffset;

            const segmentLength = 2 * wallRadius * Math.sin(Math.PI / segments / 2) * 2 + 4;

            const wall = Matter.Bodies.rectangle(x, y, segmentLength, wallThickness, {
                isStatic: true,
                angle: midAngle + Math.PI / 2,
                friction: 0.9,
                restitution: 0.1,
            });
            Matter.Composite.add(world, wall);
        }

        // 左右墙壁 - 也向外扩展
        Matter.Composite.add(world, Matter.Bodies.rectangle(-2, radius + 10, 10, innerSize + 20, { isStatic: true, friction: 0.9 }));
        Matter.Composite.add(world, Matter.Bodies.rectangle(innerSize + 2, radius + 10, 10, innerSize + 20, { isStatic: true, friction: 0.9 }));

        // 为每个金币分配随机纹理
        const newTextureMap = new Map<string, string>();

        // 创建金币刚体 - 碰撞体缩小到 85%，增加随机生成点
        const coinBodies: Matter.Body[] = [];
        const hitboxScale = 0.85; // 碰撞体缩放，让金币视觉上有微小重叠
        for (let i = 0; i < coinCount; i++) {
            // 随机生成点：x 轴随机分布，y 轴从负数开始（让金币从上方掉入）
            const startX = radius + (Math.random() - 0.5) * 70;
            const startY = -coinSize - i * 3; // 从容器上方依次生成，避免重叠

            const coin = Matter.Bodies.circle(startX, startY, (coinSize / 2) * hitboxScale, {
                friction: 0.8,           // 高摩擦
                frictionStatic: 0.9,
                restitution: 0.2,        // 轻微弹性，快速稳定
                density: 0.005,
                label: `coin-${i}`,
            });

            // 随机纹理（权重分配）
            const texture = getRandomTexture();
            newTextureMap.set(coin.id.toString(), texture);

            // 初始随机角速度
            Matter.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);

            coinBodies.push(coin);
            Matter.Composite.add(world, coin);
        }
        coinBodiesRef.current = coinBodies;
        textureMapRef.current = newTextureMap;

        // 物理模拟循环
        let frameCount = 0;
        let stableFrames = 0;
        let animationId: number;

        const updateCoins = () => {
            Matter.Engine.update(engine, 1000 / 60);
            frameCount++;

            const newCoins = coinBodies.map((body, index) => {
                // 限制旋转角度在 ±30° 以内
                let rotation = (body.angle * 180) / Math.PI;
                rotation = rotation % 360;
                if (rotation > 180) rotation -= 360;
                if (rotation < -180) rotation += 360;
                const clampedRotation = Math.max(-30, Math.min(30, rotation));

                return {
                    x: body.position.x - coinSize / 2,
                    y: body.position.y - coinSize / 2,
                    rotation: clampedRotation,
                    textureIndex: index, // 用于 key
                    spawnOrder: index,
                };
            });

            setCoins([...newCoins]);

            // 稳定性检测
            if (frameCount > 50) {
                const isStable = coinBodies.every((body) => {
                    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                    return speed < 0.3;
                });

                if (isStable) {
                    stableFrames++;
                    if (stableFrames > 25) {
                        return; // 稳定，停止模拟
                    }
                } else {
                    stableFrames = 0;
                }
            }

            if (frameCount < 200) {
                animationId = requestAnimationFrame(updateCoins);
            }
        };

        animationId = requestAnimationFrame(updateCoins);

        return () => {
            cancelAnimationFrame(animationId);
            if (engineRef.current) {
                Matter.World.clear(engineRef.current.world, false);
                Matter.Engine.clear(engineRef.current);
            }
        };
    }, [current]);

    // 按生成顺序排序：越晚生成 z-index 越高
    const sortedCoins = [...coins].sort((a, b) => a.spawnOrder - b.spawnOrder);
    const totalCoins = sortedCoins.length;

    // 调试日志
    console.log('[EnergyBall] current:', current, 'coins.length:', coins.length, 'sortedCoins.length:', sortedCoins.length);

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
                    {/* 金币层 */}
                    <div className="absolute inset-0">
                        {sortedCoins.map((coin, renderIndex) => {
                            // 纵深感：底层暗，顶层亮
                            const depthRatio = renderIndex / Math.max(totalCoins - 1, 1);
                            const brightness = 0.85 + depthRatio * 0.15; // 0.85 ~ 1.0
                            const contrast = 1.05 - depthRatio * 0.05;   // 1.05 ~ 1.0

                            const texture = textureMapRef.current.get(
                                coinBodiesRef.current[coin.spawnOrder]?.id.toString() || ''
                            ) || COIN_TEXTURES.front[0];

                            return (
                                <img
                                    key={coin.spawnOrder}
                                    src={texture}
                                    alt=""
                                    className="absolute"
                                    style={{
                                        width: coinSize,
                                        height: coinSize,
                                        objectFit: 'contain', // 保持比例，不拉伸
                                        left: coin.x,
                                        top: coin.y,
                                        transform: `rotate(${coin.rotation}deg)`,
                                        filter: `brightness(${brightness}) contrast(${contrast}) drop-shadow(1px 2px 3px rgba(0,0,0,0.35))`,
                                        zIndex: renderIndex + 1,
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 数字层 - 最顶层，轻微磨砂透明背景 */}
            <div
                className="absolute inset-0 flex items-start justify-center pt-6 pointer-events-none"
                style={{ zIndex: 999 }}
            >
                <div
                    className="px-2.5 py-1 rounded-full"
                    style={{
                        background: 'rgba(255, 248, 235, 0.2)',
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                    }}
                >
                    <span
                        className="font-bold text-xl"
                        style={{
                            fontFamily: "'Quicksand', sans-serif",
                            color: '#7A5230',
                            textShadow: '0 1px 1px rgba(255,255,255,0.5)',
                        }}
                    >
                        {current}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default EnergyBall;
