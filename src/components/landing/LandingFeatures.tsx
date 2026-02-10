import React, { useState, useRef, useEffect, useMemo } from 'react';
import Feature1 from '../../assets/1.png';
import Feature2 from '../../assets/2.png';
import Feature3 from '../../assets/3.png';
import Feature4 from '../../assets/4.png';
import Feature5 from '../../assets/5.png';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * 落地页功能卡片的数据结构
 */
interface Feature {
    id: string;
    tab: string;
    title: string;
    description: string;
    image: string;
    bgColor: string;
}

/**
 * 卡片宽度（像素）
 * 仅用于桌面端横向滚动时的计算基准。
 */
const CARD_WIDTH = 900;

/**
 * 落地页功能展示区
 * 桌面端使用横向滚动卡片；移动端使用纵向平铺，避免横滑操作。
 */
export const LandingFeatures: React.FC = () => {
    const { t } = useTranslation();

    /**
     * 功能卡片配置
     * 用于驱动 Tab、卡片内容与图像展示。
     */
    const features: Feature[] = useMemo(() => [
        {
            id: 'body-double',
            tab: t('landing.features.bodyDouble.tab'),
            title: t('landing.features.bodyDouble.title'),
            description: t('landing.features.bodyDouble.description'),
            image: Feature1,
            bgColor: '#E6EFFF'
        },
        {
            id: 'awareness',
            tab: t('landing.features.awareness.tab'),
            title: t('landing.features.awareness.title'),
            description: t('landing.features.awareness.description'),
            image: Feature2,
            bgColor: '#FFF2E6'
        },
        {
            id: 'habits',
            tab: t('landing.features.habits.tab'),
            title: t('landing.features.habits.title'),
            description: t('landing.features.habits.description'),
            image: Feature3,
            bgColor: '#EBF5FF'
        },
        {
            id: 'checkin',
            tab: t('landing.features.checkin.tab'),
            title: t('landing.features.checkin.title'),
            description: t('landing.features.checkin.description'),
            image: Feature4,
            bgColor: '#FEEBED'
        },
        {
            id: 'streak',
            tab: t('landing.features.streak.tab'),
            title: t('landing.features.streak.title'),
            description: t('landing.features.streak.description'),
            image: Feature5,
            bgColor: '#ECFDF5'
        }
    ], [t]);
    /** 当前激活的功能卡片索引（用于桌面端导航与指示器） */
    const [activeIndex, setActiveIndex] = useState(0);
    /** 横向滚动容器引用（桌面端用于居中与滚动定位） */
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    /** 标记是否由程序触发滚动，避免滚动回调抖动 */
    const isScrollingRef = useRef(false);

    /**
     * 滚动到指定卡片（居中显示）
     */
    const scrollToCard = (index: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;

        isScrollingRef.current = true;
        setActiveIndex(index);

        // 获取目标卡片元素并滚动到它
        const cards = container.querySelectorAll('[data-card]');
        const targetCard = cards[index] as HTMLElement;

        if (targetCard) {
            targetCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }

        // 滚动完成后重置标志（延长时间确保动画完成）
        setTimeout(() => {
            isScrollingRef.current = false;
        }, 800);
    };

    /**
     * 监听滚动事件，更新当前激活的卡片索引
     */
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        /**
         * 根据容器中心点计算当前最接近的卡片索引
         * 仅在桌面端横向滚动时启用。
         */
        const handleScroll = () => {
            if (container.scrollWidth <= container.offsetWidth) return;
            // 如果是程序触发的滚动，不更新状态
            if (isScrollingRef.current) return;

            // 获取所有卡片元素
            const cards = container.querySelectorAll('[data-card]');
            const containerRect = container.getBoundingClientRect();
            const containerCenter = containerRect.left + containerRect.width / 2;

            // 找到最接近容器中心的卡片
            let closestIndex = 0;
            let closestDistance = Infinity;

            cards.forEach((card, index) => {
                const cardRect = card.getBoundingClientRect();
                const cardCenter = cardRect.left + cardRect.width / 2;
                const distance = Math.abs(cardCenter - containerCenter);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });

            if (closestIndex !== activeIndex) {
                setActiveIndex(closestIndex);
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [activeIndex]);

    /**
     * 初始化时让第一张卡片居中
     */
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        if (container.scrollWidth <= container.offsetWidth) return;
        // 设置初始滚动位置
        const containerWidth = container.offsetWidth;
        const initialScroll = -(containerWidth - CARD_WIDTH) / 2;
        container.scrollLeft = Math.max(0, initialScroll);
    }, []);

    return (
        <section className="pt-24 pb-16 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {/* Tabs Navigation */}
            <div className="hidden md:flex flex-wrap justify-center gap-3 mb-10 px-6">
                {features.map((feature, index) => (
                    <button
                        key={feature.id}
                        onClick={() => scrollToCard(index)}
                        className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
                            activeIndex === index
                                ? 'bg-blue-100 text-blue-600 shadow-sm'
                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                    >
                        {feature.tab}
                    </button>
                ))}
            </div>

            {/* Horizontal Scroll Container */}
            <div
                ref={scrollContainerRef}
                className="flex flex-col md:flex-row gap-6 overflow-x-visible md:overflow-x-auto md:snap-x md:snap-mandatory scrollbar-hide"
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    paddingLeft: 'max(24px, calc((100vw - 900px) / 2))',
                    paddingRight: 'max(24px, calc((100vw - 900px) / 2))',
                    paddingTop: '20px',
                    paddingBottom: '60px',
                }}
            >
                <style>{`
                    .scrollbar-hide::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>

                {features.map((feature, index) => (
                    <div
                        key={feature.id}
                        data-card
                        onClick={() => scrollToCard(index)}
                        className={`flex-shrink-0 w-full md:w-[900px] md:snap-center md:cursor-pointer transition-all duration-500 ${
                            activeIndex === index
                                ? 'opacity-100 scale-100'
                                : 'md:opacity-40 md:scale-[0.97]'
                        }`}
                    >
                        <div
                            className="rounded-[32px] overflow-hidden border border-black/5 h-full"
                            style={{
                                background: `linear-gradient(135deg, ${feature.bgColor} 0%, #FFFFFF 100%)`,
                                boxShadow: activeIndex === index
                                    ? '0 40px 80px -20px rgba(0,0,0,0.12)'
                                    : '0 20px 40px -20px rgba(0,0,0,0.05)'
                            }}
                        >
                            <div className="flex flex-col lg:flex-row items-center min-h-[500px]">
                                {/* Left: Image Side */}
                                <div className="w-full lg:w-1/2 p-6 lg:p-10 flex justify-center items-center">
                                    <img
                                        src={feature.image}
                                        alt={feature.title}
                                        className="max-h-[420px] w-auto object-contain"
                                        style={{
                                            borderRadius: '20px',
                                            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.08))'
                                        }}
                                    />
                                </div>

                                {/* Right: Text Side */}
                                <div className="w-full lg:w-1/2 p-6 lg:p-10">
                                    {/* Tab Badge */}
                                    <span className="inline-block px-4 py-1.5 bg-white/80 rounded-full text-sm font-bold text-gray-500 mb-5 border border-gray-100">
                                        {feature.tab}
                                    </span>
                                    <h3 className="text-3xl lg:text-4xl font-black mb-5 tracking-tight text-gray-900 leading-tight">
                                        {feature.title}
                                    </h3>
                                    <p className="text-lg text-gray-500 font-medium leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Dot Indicators */}
            <div className="hidden md:flex justify-center gap-2 mt-4">
                {features.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => scrollToCard(index)}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                            activeIndex === index
                                ? 'bg-gray-800 w-8'
                                : 'bg-gray-300 w-2.5 hover:bg-gray-400'
                        }`}
                    />
                ))}
            </div>
        </section>
    );
};
