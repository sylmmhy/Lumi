/**
 * EnergyBall - 存钱罐进度组件
 *
 * 使用 Matter.js 物理引擎实现金币掉落堆叠效果
 * 优化：
 * - 随机纹理：10 种不同角度的金币素材
 * - 锁定旋转：贴图只在 ±15° 内小幅度旋转
 * - 纵深层级：底层金币暗一些，模拟阴影
 * - 数字优先：带毛玻璃背景，始终可读
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
    rotation: number;      // 物理旋转（用于 ±15° 限制）
    textureIndex: number;  // 随机纹理索引 0-9
    spawnOrder: number;    // 生成顺序（用于计算层级）
}

// 10 种金币纹理（不同角度）
const COIN_TEXTURES = [
    '/coins/coin-0.png',
    '/coins/coin-1.png',
    '/coins/coin-2.png',
    '/coins/coin-3.png',
    '/coins/coin-4.png',
    '/coins/coin-5.png',
    '/coins/coin-6.png',
    '/coins/coin-7.png',
    '/coins/coin-8.png',
    '/coins/coin-9.png',
];

/**
 * 存钱罐进度组件
 */
export const EnergyBall: React.FC<EnergyBallProps> = ({ current }) => {
    const size = 125;
    const borderWidth = 8;
    const innerSize = size - borderWidth * 2; // 109px
    const coinSize = 22;
    const radius = innerSize / 2;

    const [coins, setCoins] = useState<CoinState[]>([]);
    const engineRef = useRef<Matter.Engine | null>(null);
    const coinBodiesRef = useRef<Matter.Body[]>([]);
    const textureMapRef = useRef<Map<string, number>>(new Map()); // body.id -> textureIndex

    useEffect(() => {
        const coinCount = Math.min(Math.max(current, 0), 20);

        if (coinCount === 0) {
            setCoins([]);
            return;
        }

        // 清理之前的引擎
        if (engineRef.current) {
            Matter.World.clear(engineRef.current.world, false);
            Matter.Engine.clear(engineRef.current);
        }

        // 创建物理引擎
        const engine = Matter.Engine.create({
            gravity: { x: 0, y: 0.8 },
        });
        engineRef.current = engine;

        const world = engine.world;

        // 创建圆形边界（用多个小矩形近似圆弧，只需要下半部分）
        const segments = 24;
        const wallThickness = 20;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI;
            const nextAngle = ((i + 1) / segments) * Math.PI;
            const midAngle = (angle + nextAngle) / 2;

            const wallRadius = radius - 2;
            const x = radius + Math.cos(midAngle) * wallRadius;
            const y = radius + Math.sin(midAngle) * wallRadius;

            const segmentLength = 2 * wallRadius * Math.sin(Math.PI / segments / 2) * 2 + 2;

            const wall = Matter.Bodies.rectangle(x, y, segmentLength, wallThickness, {
                isStatic: true,
                angle: midAngle + Math.PI / 2,
                friction: 1,
                restitution: 0.05,
            });
            Matter.Composite.add(world, wall);
        }

        // 左右两边的墙
        Matter.Composite.add(world, Matter.Bodies.rectangle(-5, radius, 10, innerSize, { isStatic: true }));
        Matter.Composite.add(world, Matter.Bodies.rectangle(innerSize + 5, radius, 10, innerSize, { isStatic: true }));

        // 为每个金币预分配随机纹理
        const newTextureMap = new Map<string, number>();

        // 创建金币（圆形刚体）
        const coinBodies: Matter.Body[] = [];
        for (let i = 0; i < coinCount; i++) {
            const startX = radius + (Math.random() - 0.5) * 40;
            const startY = 10 + i * 5;

            const coin = Matter.Bodies.circle(startX, startY, coinSize / 2 - 1, {
                friction: 0.9,
                frictionStatic: 1,
                restitution: 0.1,
                density: 0.005,
                label: `coin-${i}`,
            });

            // 随机分配纹理（在生成时固定）
            const textureIndex = Math.floor(Math.random() * COIN_TEXTURES.length);
            newTextureMap.set(coin.id.toString(), textureIndex);

            Matter.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.3);

            coinBodies.push(coin);
            Matter.Composite.add(world, coin);
        }
        coinBodiesRef.current = coinBodies;
        textureMapRef.current = newTextureMap;

        // 手动步进物理引擎
        let frameCount = 0;
        let stableFrames = 0;
        let animationId: number;

        const updateCoins = () => {
            Matter.Engine.update(engine, 1000 / 60);
            frameCount++;

            const newCoins = coinBodies.map((body, index) => {
                // 限制旋转角度在 ±15° 内
                const rawRotation = (body.angle * 180) / Math.PI;
                const clampedRotation = Math.max(-15, Math.min(15, (rawRotation % 30) - 15));

                return {
                    x: body.position.x - coinSize / 2,
                    y: body.position.y - coinSize / 2,
                    rotation: clampedRotation,
                    textureIndex: textureMapRef.current.get(body.id.toString()) || 0,
                    spawnOrder: index,
                };
            });

            setCoins([...newCoins]);

            // 检查是否稳定
            if (frameCount > 60) {
                const isStable = coinBodies.every((body) => {
                    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                    return speed < 0.5;
                });

                if (isStable) {
                    stableFrames++;
                    if (stableFrames > 30) {
                        return;
                    }
                } else {
                    stableFrames = 0;
                }
            }

            if (frameCount < 180) {
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

    // 按 Y 坐标排序，底部的先渲染（在后面）
    const sortedCoins = [...coins].sort((a, b) => a.y - b.y);

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
                            // 计算亮度：底部的金币暗一些（模拟阴影）
                            // renderIndex 越小 = Y 越小 = 越靠上 = 越早渲染 = 在后面
                            const depthRatio = renderIndex / Math.max(sortedCoins.length - 1, 1);
                            const brightness = 0.75 + depthRatio * 0.25; // 0.75 ~ 1.0

                            return (
                                <img
                                    key={`${coin.spawnOrder}-${coin.textureIndex}`}
                                    src={COIN_TEXTURES[coin.textureIndex]}
                                    alt=""
                                    className="absolute"
                                    style={{
                                        width: coinSize,
                                        height: coinSize,
                                        left: coin.x,
                                        top: coin.y,
                                        transform: `rotate(${coin.rotation}deg)`,
                                        filter: `brightness(${brightness}) drop-shadow(1px 2px 3px rgba(0,0,0,0.3))`,
                                        zIndex: renderIndex,
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 中心文字 - 最顶层，带毛玻璃背景 */}
            <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 100 }}
            >
                <div
                    className="px-3 py-1 rounded-lg"
                    style={{
                        background: 'rgba(255, 255, 255, 0.75)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                    }}
                >
                    <span
                        className="font-bold text-2xl"
                        style={{
                            fontFamily: "'Quicksand', sans-serif",
                            color: '#8B5A3C',
                            textShadow: '0 1px 2px rgba(255,255,255,0.5)',
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
