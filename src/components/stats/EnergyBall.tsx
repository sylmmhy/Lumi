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
 * 6. 增量更新：打卡时只新增一个金币掉落
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';

interface EnergyBallProps {
    current: number;
    target: number;
    triggerRise?: boolean;
}

interface CoinState {
    id: string;
    x: number;
    y: number;
    rotation: number;
    texture: string;
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
export const EnergyBall: React.FC<EnergyBallProps> = ({ current, triggerRise = false }) => {
    const size = 125;
    const borderWidth = 8;
    const innerSize = size - borderWidth * 2; // 109px
    const coinSize = 18;
    const radius = innerSize / 2;
    const hitboxScale = 0.85;

    const [coins, setCoins] = useState<CoinState[]>([]);
    const engineRef = useRef<Matter.Engine | null>(null);
    const worldRef = useRef<Matter.World | null>(null);
    const coinBodiesRef = useRef<Map<string, { body: Matter.Body; texture: string }>>(new Map());
    const prevCurrentRef = useRef<number>(0);
    const animationIdRef = useRef<number | null>(null);
    const isInitializedRef = useRef(false);
    const timeoutIdsRef = useRef<number[]>([]);

    /**
     * 初始化物理引擎（只执行一次）
     */
    const initEngine = useCallback(() => {
        if (isInitializedRef.current) return;

        // 创建物理引擎
        const engine = Matter.Engine.create({
            gravity: { x: 0, y: 1.5 },
        });
        engineRef.current = engine;
        worldRef.current = engine.world;

        // 创建圆形边界（下半圆弧）
        const segments = 20;
        const wallThickness = 15;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI;
            const nextAngle = ((i + 1) / segments) * Math.PI;
            const midAngle = (angle + nextAngle) / 2;

            const wallRadius = radius + 5;
            const x = radius + Math.cos(midAngle) * wallRadius;
            const y = radius + Math.sin(midAngle) * wallRadius;

            const segmentLength = 2 * wallRadius * Math.sin(Math.PI / segments / 2) * 2 + 4;

            const wall = Matter.Bodies.rectangle(x, y, segmentLength, wallThickness, {
                isStatic: true,
                angle: midAngle + Math.PI / 2,
                friction: 0.9,
                restitution: 0.1,
            });
            Matter.Composite.add(engine.world, wall);
        }

        // 左右墙壁
        Matter.Composite.add(engine.world, Matter.Bodies.rectangle(-2, radius + 10, 10, innerSize + 20, { isStatic: true, friction: 0.9 }));
        Matter.Composite.add(engine.world, Matter.Bodies.rectangle(innerSize + 2, radius + 10, 10, innerSize + 20, { isStatic: true, friction: 0.9 }));

        isInitializedRef.current = true;

        // 启动物理模拟循环
        const updatePhysics = () => {
            if (!engineRef.current) return;

            Matter.Engine.update(engineRef.current, 1000 / 60);

            const newCoins: CoinState[] = [];
            coinBodiesRef.current.forEach(({ body, texture }, id) => {
                let rotation = (body.angle * 180) / Math.PI;
                rotation = rotation % 360;
                if (rotation > 180) rotation -= 360;
                if (rotation < -180) rotation += 360;
                const clampedRotation = Math.max(-30, Math.min(30, rotation));

                newCoins.push({
                    id,
                    x: body.position.x - coinSize / 2,
                    y: body.position.y - coinSize / 2,
                    rotation: clampedRotation,
                    texture,
                });
            });

            setCoins([...newCoins]);
            animationIdRef.current = requestAnimationFrame(updatePhysics);
        };

        animationIdRef.current = requestAnimationFrame(updatePhysics);
    }, [radius, innerSize, coinSize]);

    /**
     * 添加一个金币
     */
    const addCoin = useCallback(() => {
        if (!worldRef.current) return;

        const startX = radius + (Math.random() - 0.5) * 70;
        const startY = -coinSize * 2;

        const coin = Matter.Bodies.circle(startX, startY, (coinSize / 2) * hitboxScale, {
            friction: 0.8,
            frictionStatic: 0.9,
            restitution: 0.2,
            density: 0.005,
        });

        Matter.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);
        Matter.Composite.add(worldRef.current, coin);

        const texture = getRandomTexture();
        coinBodiesRef.current.set(coin.id.toString(), { body: coin, texture });
    }, [radius, coinSize, hitboxScale]);

    /**
     * 移除一个金币（移除最后添加的）
     */
    const removeCoin = useCallback(() => {
        if (!worldRef.current || coinBodiesRef.current.size === 0) return;

        // 获取最后一个金币
        const entries = Array.from(coinBodiesRef.current.entries());
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
            const [id, { body }] = lastEntry;
            Matter.Composite.remove(worldRef.current, body);
            coinBodiesRef.current.delete(id);
        }
    }, []);

    /**
     * 批量添加金币（初始化时使用）
     */
    const addCoinsInBatch = useCallback((count: number) => {
        if (!worldRef.current) return;

        for (let i = 0; i < count; i++) {
            const startX = radius + (Math.random() - 0.5) * 70;
            const startY = -coinSize - i * 3;

            const coin = Matter.Bodies.circle(startX, startY, (coinSize / 2) * hitboxScale, {
                friction: 0.8,
                frictionStatic: 0.9,
                restitution: 0.2,
                density: 0.005,
            });

            Matter.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);
            Matter.Composite.add(worldRef.current, coin);

            const texture = getRandomTexture();
            coinBodiesRef.current.set(coin.id.toString(), { body: coin, texture });
        }
    }, [radius, coinSize, hitboxScale]);

    // 初始化引擎
    useEffect(() => {
        initEngine();

        return () => {
            // 清理所有 pending 的 setTimeout
            timeoutIdsRef.current.forEach(id => window.clearTimeout(id));
            timeoutIdsRef.current = [];

            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
            }
            if (engineRef.current) {
                Matter.World.clear(engineRef.current.world, false);
                Matter.Engine.clear(engineRef.current);
            }
            isInitializedRef.current = false;
            coinBodiesRef.current.clear();
        };
    }, [initEngine]);

    // 响应 current 变化
    useEffect(() => {
        const targetCount = Math.min(Math.max(current, 0), 40);
        const currentCount = coinBodiesRef.current.size;
        const prevCount = prevCurrentRef.current;

        // 首次加载或重新挂载：批量添加
        if (prevCount === 0 && targetCount > 0 && currentCount === 0) {
            addCoinsInBatch(targetCount);
        }
        // 增加金币：逐个添加
        else if (targetCount > currentCount) {
            const diff = targetCount - currentCount;
            for (let i = 0; i < diff; i++) {
                const timeoutId = window.setTimeout(() => addCoin(), i * 100); // 间隔 100ms 掉落
                timeoutIdsRef.current.push(timeoutId);
            }
        }
        // 减少金币：逐个移除
        else if (targetCount < currentCount) {
            const diff = currentCount - targetCount;
            for (let i = 0; i < diff; i++) {
                removeCoin();
            }
        }

        prevCurrentRef.current = targetCount;
    }, [current, addCoin, removeCoin, addCoinsInBatch]);

    return (
        <div className="relative">
            {/* 金色光晕 - 打卡时显示并旋转 */}
            <div
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-300 ${
                    triggerRise ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                    width: size * 3.5,
                    height: size * 3.5,
                    zIndex: 0,
                }}
            >
                <img
                    src="/golden-light.png"
                    alt=""
                    className="w-full h-full object-contain"
                    style={{
                        animation: triggerRise ? 'spin-glow 10s linear infinite' : 'none',
                    }}
                />
            </div>

            {/* 外层白色圆圈 */}
            <div
                className="rounded-full flex items-center justify-center relative"
                style={{
                    width: size,
                    height: size,
                    backgroundColor: 'white',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                    zIndex: 1,
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
                        {coins.map((coin, index) => {
                            const depthRatio = index / Math.max(coins.length - 1, 1);
                            const brightness = 0.85 + depthRatio * 0.15;
                            const contrast = 1.05 - depthRatio * 0.05;

                            return (
                                <img
                                    key={coin.id}
                                    src={coin.texture}
                                    alt=""
                                    className="absolute"
                                    style={{
                                        width: coinSize,
                                        height: coinSize,
                                        objectFit: 'contain',
                                        left: coin.x,
                                        top: coin.y,
                                        transform: `rotate(${coin.rotation}deg)`,
                                        filter: `brightness(${brightness}) contrast(${contrast}) drop-shadow(1px 2px 3px rgba(0,0,0,0.35))`,
                                        zIndex: index + 1,
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

            {/* 光晕旋转动画 */}
            <style>{`
                @keyframes spin-glow {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </div>
    );
};

export default EnergyBall;
