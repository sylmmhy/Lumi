import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import type { LeaderboardType, RankingEntry } from '../../hooks/useLeaderboard';
import { useAuth } from '../../hooks/useAuth';

/**
 * LeaderboardView - 排行榜视图
 *
 * 展示 Public / Friends 两个排行榜 Tab，接入 get-leaderboard Edge Function。
 * 按 weekly_coins 降序排列，每周一 UTC 重置。
 */
export const LeaderboardView = () => {
    const { t } = useTranslation();
    const auth = useAuth();
    const { data, isLoading, fetchLeaderboard } = useLeaderboard();
    const [scrollTop, setScrollTop] = useState(0);
    const [activeTab, setActiveTab] = useState<LeaderboardType>('public');
    const showStickyHeader = scrollTop > 80;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    // 初始加载 + Tab 切换
    const loadData = useCallback((type: LeaderboardType) => {
        if (!auth.userId) return;
        setActiveTab(type);
        void fetchLeaderboard(auth.userId, type);
    }, [auth.userId, fetchLeaderboard]);

    useEffect(() => {
        loadData('public');
    }, [loadData]);

    const handleTabSwitch = (type: LeaderboardType) => {
        if (type === activeTab) return;
        loadData(type);
    };

    // 排名图标
    const RankIcon = ({ rank }: { rank: number }) => {
        if (rank === 1) return <i className="fa-solid fa-trophy text-yellow-400 text-xl"></i>;
        if (rank === 2) return <i className="fa-solid fa-medal text-gray-400 text-xl"></i>;
        if (rank === 3) return <i className="fa-solid fa-medal text-orange-700 text-xl"></i>;
        return <span className="text-brand-greenText font-bold font-serif text-lg">{rank}</span>;
    };

    // 排名行
    const RankingRow = ({ entry }: { entry: RankingEntry }) => (
        <div
            className={`flex items-center p-3 rounded-2xl ${entry.is_me ? 'bg-brand-lightGreen border border-green-100' : 'bg-white hover:bg-gray-50'}`}
        >
            {/* Rank */}
            <div className="w-10 flex justify-center">
                <RankIcon rank={entry.rank} />
            </div>

            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl shadow-sm mx-3 relative">
                {entry.avatar_emoji}
                {entry.rank <= 3 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <i className={`fa-solid fa-crown text-[8px] ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : 'text-orange-600'}`}></i>
                    </div>
                )}
            </div>

            {/* Name */}
            <div className="flex-1">
                <span className={`font-bold ${entry.is_me ? 'text-brand-greenText' : 'text-gray-700'}`}>
                    {entry.display_name}
                    {entry.is_me && <span className="text-xs text-gray-400 ml-1">({t('leaderboard.you')})</span>}
                </span>
            </div>

            {/* Score */}
            <div className="text-right">
                <span className="text-gray-500 text-sm font-medium flex items-center gap-1">
                    {entry.weekly_coins}
                    <img src="/coin.png" alt="coin" className="w-4 h-4" />
                </span>
            </div>
        </div>
    );

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

                {/* Floating Stats Box */}
                <div className="px-8 -mt-8 relative z-10 mb-8">
                    <div className="bg-white rounded-3xl shadow-lg p-4 flex divide-x divide-gray-100">
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <span className="text-xs text-gray-400 font-bold mb-1">{t('leaderboard.weeklyCoins')}</span>
                            <span className="text-brand-orange font-bold text-lg flex items-center gap-1">
                                <img src="/coin.png" alt="coin" className="w-5 h-5" />
                                {data?.rankings.find(r => r.is_me)?.weekly_coins ?? data?.user_rank?.weekly_coins ?? 0}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <span className="text-xs text-gray-400 font-bold mb-1">{t('leaderboard.timeLeft')}</span>
                            <span className="text-brand-orange font-bold text-lg flex items-center gap-1">
                                <i className="fa-regular fa-clock"></i>
                                {data?.days_remaining ?? '-'} {(data?.days_remaining ?? 0) === 1 ? t('leaderboard.day') : t('leaderboard.days')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Sticky Tabs */}
                <div className="sticky top-12 z-40 bg-white pb-2 pt-1">
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => handleTabSwitch('public')}
                            className={`font-serif italic font-bold text-lg px-8 py-2 rounded-full shadow-sm transition-colors ${
                                activeTab === 'public'
                                    ? 'bg-brand-yellow text-brand-orange'
                                    : 'bg-[#F0F0F0] text-gray-400'
                            }`}
                        >
                            {t('leaderboard.public')}
                        </button>
                        <button
                            onClick={() => handleTabSwitch('friends')}
                            className={`font-serif italic font-bold text-lg px-8 py-2 rounded-full shadow-sm transition-colors ${
                                activeTab === 'friends'
                                    ? 'bg-brand-yellow text-brand-orange'
                                    : 'bg-[#F0F0F0] text-gray-400'
                            }`}
                        >
                            {t('leaderboard.friends')}
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Ranking List */}
                {!isLoading && (
                    <div className="px-4 pb-28 space-y-2">
                        {(data?.rankings ?? []).length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-center">
                                <span className="text-4xl mb-4">🏆</span>
                                <p className="text-gray-500 text-sm">
                                    {activeTab === 'friends'
                                        ? t('leaderboard.noFriendsYet')
                                        : t('leaderboard.noRankingsYet')}
                                </p>
                            </div>
                        ) : (
                            <>
                                {data?.rankings.map((entry) => (
                                    <RankingRow key={entry.user_id} entry={entry} />
                                ))}

                                {/* 如果用户不在 Top N，显示分隔 + 自己的排名 */}
                                {data?.user_rank && (
                                    <>
                                        <div className="flex items-center gap-2 px-4 py-2">
                                            <div className="flex-1 border-t border-dashed border-gray-200"></div>
                                            <span className="text-xs text-gray-400">···</span>
                                            <div className="flex-1 border-t border-dashed border-gray-200"></div>
                                        </div>
                                        <RankingRow entry={data.user_rank} />
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
