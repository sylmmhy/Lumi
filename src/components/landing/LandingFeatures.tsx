import React, { useState, useRef, useEffect } from 'react';
import Feature1 from '../../assets/1.png';
import Feature2 from '../../assets/2.png';
import Feature3 from '../../assets/3.png';
import Feature4 from '../../assets/4.png';
import Feature5 from '../../assets/5.png';

interface Feature {
    id: string;
    tab: string;
    title: string;
    description: string;
    image: string;
    bgColor: string;
}

const features: Feature[] = [
    {
        id: 'body-double',
        tab: 'AI Companion',
        title: 'Meet Lumi, Your Body Double',
        description: "An AI coach who's as persistent as your mom, but way less judgmental. Lumi stays with you through tasks, providing the accountability you need without the guilt trips.",
        image: Feature1,
        bgColor: '#E6EFFF'
    },
    {
        id: 'awareness',
        tab: 'Smart Insights',
        title: 'I Know What You\'re Avoiding',
        description: "Lumi learns your patterns and gently calls out procrastination before it spirals. No more hiding from that task you've been putting off for weeks.",
        image: Feature2,
        bgColor: '#FFF2E6'
    },
    {
        id: 'habits',
        tab: 'Habit Tracking',
        title: 'Set A Habit. AI Will Call You.',
        description: "Habit tracking that actually works. Set your goals, and Lumi will check in with you at the right moments. Finally, a system that won't become a graveyard of good intentions.",
        image: Feature3,
        bgColor: '#EBF5FF'
    },
    {
        id: 'checkin',
        tab: 'Video Check-In',
        title: 'Quick Video Check-In. Get Started.',
        description: "Like having a supportive friend who never gets tired of you. Quick video sessions to build momentum and get you moving on your tasks.",
        image: Feature4,
        bgColor: '#FEEBED'
    },
    {
        id: 'streak',
        tab: 'Progress Tracking',
        title: 'Ready? Let\'s Get Moving.',
        description: "Watch your streaks grow and celebrate your wins. Track your progress with beautiful visualizations that make consistency feel rewarding.",
        image: Feature5,
        bgColor: '#ECFDF5'
    }
];

/** 卡片宽度（像素） */
const CARD_WIDTH = 900;

export const LandingFeatures: React.FC = () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
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

        const handleScroll = () => {
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

        // 设置初始滚动位置
        const containerWidth = container.offsetWidth;
        const initialScroll = -(containerWidth - CARD_WIDTH) / 2;
        container.scrollLeft = Math.max(0, initialScroll);
    }, []);

    return (
        <section className="pt-24 pb-16 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {/* Tabs Navigation */}
            <div className="flex flex-wrap justify-center gap-3 mb-10 px-6">
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
                className="flex gap-6 overflow-x-auto snap-x snap-mandatory"
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
                        className={`flex-shrink-0 snap-center cursor-pointer transition-all duration-500 ${
                            activeIndex === index
                                ? 'opacity-100 scale-100'
                                : 'opacity-40 scale-[0.97]'
                        }`}
                        style={{ width: `${CARD_WIDTH}px`, maxWidth: '90vw' }}
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
            <div className="flex justify-center gap-2 mt-4">
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
