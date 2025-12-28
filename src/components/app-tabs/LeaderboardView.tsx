import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * 排行榜视图，展示公开/好友榜数据，同时在功能未就绪时展示"Coming Soon"蒙层。
 *
 * @returns {JSX.Element} 排行榜页面内容与占位蒙层。
 */
export const LeaderboardView = () => {
    const { t } = useTranslation();
    const [scrollTop, setScrollTop] = useState(0);
    const showStickyHeader = scrollTop > 80;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    // Mock Data
    const rankingData = [
        { rank: 1, name: 'Parrot', score: 37327, avatar: '🦜' },
        { rank: 2, name: '3H', score: 30530, avatar: '😐', isMe: true },
        { rank: 3, name: 'Past', score: 10831, avatar: '🦉' },
        { rank: 4, name: 'Old Gao', score: 10632, avatar: '😎' },
        { rank: 5, name: 'Old Wu', score: 10138, avatar: '🧢' },
        { rank: 6, name: 'M', score: 10001, avatar: 'Ⓜ️' },
        { rank: 7, name: 'User 7', score: 9001, avatar: '👤' },
        { rank: 8, name: 'User 8', score: 8000, avatar: '👤' },
    ];

    return (
        <div className="flex-1 relative h-full overflow-hidden flex flex-col">
            {/* Sticky Top Bar (Floating) */}
            <div className={`absolute top-0 left-0 right-0 h-12 bg-white z-50 flex items-end justify-center pb-2 shadow-sm transition-all duration-300 ${showStickyHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
                <span className="font-serif italic font-bold text-brand-orange text-xl">{t('leaderboard.ranking')}</span>
            </div>

            {/* Scroll Container */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative" onScroll={handleScroll}>

                {/* Hero Section Container */}
                <div className="relative z-0">
                    <div className="bg-brand-orange pt-6 pb-12 relative z-0 flex flex-col items-center">
                        <i className="fa-solid fa-trophy text-brand-goldBorder text-5xl mb-3 drop-shadow-md"></i>
                        <h1 className="text-3xl font-serif text-white italic font-bold">{t('leaderboard.youAreTheBest')}</h1>

                        {/* Curve */}
                        <div className="absolute bottom-0 left-0 right-0 translate-y-[98%] z-0">
                            <svg viewBox="0 0 1440 100" className="w-full h-auto block text-brand-orange fill-current" preserveAspectRatio="none">
                                <path d="M0,0 L1440,0 L1440,30 Q720,100 0,30 Z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Floating Stats Box - Positioned with negative margin to overlap */}
                <div className="px-8 -mt-8 relative z-10 mb-8">
                    <div className="bg-white rounded-3xl shadow-lg p-4 flex divide-x divide-gray-100">
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <span className="text-xs text-gray-400 font-bold mb-1">{t('leaderboard.today')}</span>
                            <span className="text-gray-700 font-bold text-lg flex items-center gap-1">
                                <i className="fa-solid fa-caret-up text-gray-400"></i> 0 {t('leaderboard.pos')}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <span className="text-xs text-gray-400 font-bold mb-1">{t('leaderboard.timeLeft')}</span>
                            <span className="text-brand-orange font-bold text-lg flex items-center gap-1">
                                <i className="fa-regular fa-clock"></i> 1 {t('leaderboard.day')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Sticky Tabs */}
                <div className="sticky top-12 z-40 bg-white pb-2 pt-1">
                    <div className="flex justify-center gap-4">
                        <button className="bg-brand-yellow text-brand-orange font-serif italic font-bold text-lg px-8 py-2 rounded-full shadow-sm">
                            {t('leaderboard.public')}
                        </button>
                        <button className="bg-[#F0F0F0] text-gray-400 font-serif italic font-bold text-lg px-8 py-2 rounded-full">
                            {t('leaderboard.friends')}
                        </button>
                    </div>
                </div>

                {/* Ranking List */}
                <div className="px-4 pb-28 space-y-2">
                    {rankingData.map((user, idx) => (
                        <div
                            key={idx}
                            className={`flex items-center p-3 rounded-2xl ${user.isMe ? 'bg-brand-lightGreen border border-green-100' : 'bg-white hover:bg-gray-50'}`}
                        >
                            {/* Rank */}
                            <div className="w-10 flex justify-center">
                                {user.rank === 1 && <i className="fa-solid fa-trophy text-yellow-400 text-xl"></i>}
                                {user.rank === 2 && <i className="fa-solid fa-medal text-gray-400 text-xl"></i>}
                                {user.rank === 3 && <i className="fa-solid fa-medal text-orange-700 text-xl"></i>}
                                {user.rank > 3 && <span className="text-brand-greenText font-bold font-serif text-lg">{user.rank}</span>}
                            </div>

                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl shadow-sm mx-3 relative">
                                {user.avatar}
                                {user.rank <= 3 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                                        <i className={`fa-solid fa-crown text-[8px] ${user.rank === 1 ? 'text-yellow-500' : user.rank === 2 ? 'text-gray-400' : 'text-orange-600'}`}></i>
                                    </div>
                                )}
                            </div>

                            {/* Name */}
                            <div className="flex-1">
                                <span className={`font-bold ${user.isMe ? 'text-brand-greenText' : 'text-gray-700'}`}>
                                    {user.name}
                                </span>
                            </div>

                            {/* Score */}
                            <div className="text-right">
                                <span className="text-gray-500 text-sm font-medium">{user.score} {t('leaderboard.xp')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Coming Soon Overlay */}
            <div className="absolute inset-x-0 top-0 bottom-0 z-[60] bg-white/90 backdrop-blur-sm flex items-center justify-center px-6 text-center">
                <div className="bg-white border border-brand-orange/30 rounded-3xl shadow-lg px-6 py-5 flex flex-col items-center gap-3 max-w-sm w-full">
                    <div className="w-12 h-12 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange text-2xl shadow-inner">
                        <i className="fa-solid fa-hourglass-half"></i>
                    </div>
                    <p className="text-2xl font-serif font-bold italic text-brand-orange">{t('leaderboard.comingSoon')}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        {t('leaderboard.comingSoonHint')}
                    </p>
                </div>
            </div>
        </div>
    );
};
