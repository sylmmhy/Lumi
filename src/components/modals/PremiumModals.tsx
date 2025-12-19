import { useState, useEffect } from 'react';
import { createCheckoutSession, STRIPE_PRICE_IDS } from '../../remindMe/services/stripeService';

export const PremiumModal = ({ onClose }: { onClose: () => void }) => {
    const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'monthly'>('monthly');
    const [isLoading, setIsLoading] = useState(false);

    const handleCheckout = async () => {
        setIsLoading(true);
        const priceId = selectedPlan === 'weekly' ? STRIPE_PRICE_IDS.WEEKLY : STRIPE_PRICE_IDS.MONTHLY;
        await createCheckoutSession(priceId);
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-end md:justify-center p-4 animate-fade-in text-white">
            <div className="w-full max-w-sm bg-[#111] rounded-t-3xl md:rounded-3xl p-6 relative animate-slide-up md:animate-scale-in border border-orange-900/30 shadow-[0_0_50px_rgba(255,69,0,0.15)]">
                <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-gray-500 hover:text-white transition-colors">
                    <i className="fa-solid fa-xmark"></i>
                </button>

                <div className="text-center mb-8 mt-4 relative">
                    {/* Glow effect behind icon */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-orange-500/20 blur-3xl rounded-full"></div>

                    <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl shadow-[0_10px_20px_rgba(255,69,0,0.3)] relative z-10 transform -rotate-3">
                        <i className="fa-solid fa-rocket text-white"></i>
                    </div>

                    <h2 className="text-3xl font-serif font-bold italic mb-2 bg-gradient-to-r from-yellow-200 via-orange-200 to-white bg-clip-text text-transparent">
                        Supercharge You
                    </h2>
                    <p className="text-orange-200/60 text-sm">Become faster, sharper, and unstoppable.</p>
                </div>

                <div className="space-y-4 mb-8">
                    {[
                        "Unlimited AI Reminders & Calls",
                        "Smart Schedule Optimization",
                        "Detailed Progress Analytics"
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-xl border border-white/5">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-orange-600 flex items-center justify-center text-[10px] text-black font-bold shadow-sm">
                                <i className="fa-solid fa-check"></i>
                            </div>
                            <span className="text-sm font-medium text-gray-200">{item}</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    {/* Weekly */}
                    <div
                        onClick={() => setSelectedPlan('weekly')}
                        className={`border rounded-2xl p-4 flex flex-col items-center justify-center bg-gray-900/30 cursor-pointer transition-all ${selectedPlan === 'weekly' ? 'border-orange-500 bg-gray-900 opacity-100' : 'border-gray-800 opacity-70 hover:opacity-100'}`}
                    >
                        <span className="text-xs text-gray-500 mb-1">Weekly Plan</span>
                        <span className="text-xl font-bold text-white">$2.99</span>
                        <span className="text-[10px] text-gray-600">/ week</span>
                    </div>

                    {/* Monthly - Highlighted */}
                    <div
                        onClick={() => setSelectedPlan('monthly')}
                        className={`border-2 rounded-2xl p-4 flex flex-col items-center justify-center relative cursor-pointer shadow-[0_0_15px_rgba(255,100,0,0.1)] overflow-hidden transition-all ${selectedPlan === 'monthly' ? 'border-orange-500/80 bg-gradient-to-b from-orange-900/20 to-gray-900 opacity-100' : 'border-gray-800 bg-gray-900/30 opacity-70 hover:opacity-100'}`}
                    >
                        <div className="absolute top-0 right-0 bg-gradient-to-r from-orange-500 to-red-600 text-[9px] font-bold px-2 py-1 rounded-bl-xl text-white shadow-sm">
                            SAVE 33%
                        </div>
                        <span className="text-xs text-orange-200/80 mb-1">Monthly Plan</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-orange-500">$2.00</span>
                        </div>
                        <span className="text-[10px] text-gray-400">/ week</span>
                        <span className="text-[9px] text-gray-500 mt-1">Billed $8.00 monthly</span>
                    </div>
                </div>

                <button
                    onClick={handleCheckout}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 text-white py-4 rounded-full font-bold text-lg shadow-[0_10px_30px_rgba(234,88,12,0.4)] hover:shadow-[0_10px_40px_rgba(234,88,12,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-70 disabled:pointer-events-none"
                >
                    {isLoading ? (
                        <i className="fa-solid fa-spinner animate-spin"></i>
                    ) : (
                        <>
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full blur-md"></div>
                            <span>Start Free Trial</span>
                            <i className="fa-solid fa-bolt text-yellow-300 animate-pulse"></i>
                        </>
                    )}
                </button>
                <p className="text-center text-[10px] text-gray-600 mt-4">Recurring billing. Cancel anytime.</p>
            </div>
        </div>
    );
};

export const SpecialOfferModal = ({ onClose }: { onClose: () => void }) => {
    const [animationStage, setAnimationStage] = useState<'chest' | 'shaking' | 'open'>('chest');
    const [timeLeft, setTimeLeft] = useState(7200); // 2 hours in seconds
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Animation Sequence
        const t1 = setTimeout(() => setAnimationStage('shaking'), 500);
        const t2 = setTimeout(() => setAnimationStage('open'), 2000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const handleClaim = async () => {
        setIsLoading(true);
        await createCheckoutSession(STRIPE_PRICE_IDS.SPECIAL_OFFER);
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-fade-in text-white">
            <div className="w-full max-w-sm flex flex-col items-center">

                {/* Close Button (only visible after open) */}
                {animationStage === 'open' && (
                    <button onClick={onClose} className="absolute top-8 right-8 text-gray-400 hover:text-white">
                        <i className="fa-solid fa-xmark text-2xl"></i>
                    </button>
                )}

                {/* Chest Animation Area */}
                <div className="h-64 flex items-center justify-center relative mb-8">
                    {animationStage !== 'open' ? (
                        <div className={`text-9xl text-yellow-500 drop-shadow-[0_0_30px_rgba(255,215,0,0.5)] ${animationStage === 'shaking' ? 'animate-shake' : ''} transition-transform`}>
                            <i className="fa-solid fa-gift"></i>
                        </div>
                    ) : (
                        <div className="relative animate-pop-in flex flex-col items-center">
                            {/* Rays */}
                            <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full scale-150 animate-pulse"></div>

                            <div className="text-8xl text-yellow-400 mb-4 drop-shadow-[0_0_50px_rgba(255,215,0,0.8)]">
                                <i className="fa-solid fa-box-open"></i>
                            </div>

                            {/* Floating items */}
                            <i className="fa-solid fa-star text-yellow-200 absolute -top-4 -right-8 text-2xl animate-bounce"></i>
                            <i className="fa-solid fa-bolt text-yellow-200 absolute top-10 -left-10 text-2xl animate-pulse"></i>
                        </div>
                    )}
                </div>

                {/* Content - Revealed only when open */}
                {animationStage === 'open' && (
                    <div className="text-center w-full animate-slide-up">
                        <h2 className="text-3xl font-serif font-bold italic mb-2 text-white">Wait! Special Offer</h2>
                        <p className="text-gray-400 mb-6">One-time offer just for you.</p>

                        <div className="bg-[#2A2A2A] rounded-2xl p-6 border border-yellow-500/30 mb-6 relative overflow-hidden">
                            {/* Timer */}
                            <div className="absolute top-0 left-0 right-0 bg-yellow-500/10 py-1 flex justify-center gap-2 text-xs font-mono text-yellow-500">
                                <i className="fa-solid fa-stopwatch"></i> Expires in {formatTime(timeLeft)}
                            </div>

                            <div className="mt-4">
                                <span className="text-gray-400 line-through text-sm">$2.99 / Week</span>
                                <div className="text-5xl font-bold text-shine mb-1 font-serif italic">$0.99</div>
                                <span className="text-yellow-400 text-sm font-bold uppercase tracking-widest">For the first week</span>
                            </div>
                        </div>

                        <button
                            onClick={handleClaim}
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-full shadow-[0_0_20px_rgba(255,165,0,0.4)] text-lg animate-pulse hover:scale-105 transition-transform flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                        >
                            {isLoading ? <i className="fa-solid fa-spinner animate-spin"></i> : "Claim Offer"}
                        </button>
                    </div>
                )}

                {animationStage !== 'open' && (
                    <p className="text-yellow-500/50 font-mono text-sm animate-pulse">Opening your gift...</p>
                )}
            </div>
        </div>
    );
};
