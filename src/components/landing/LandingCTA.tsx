import React from 'react';
import LumiMain from '../../assets/new-lumi/lumi-main.png';
import Zigzag from '../../assets/new-lumi/zigzag.png';
import { useTranslation } from '../../hooks/useTranslation';

interface LandingCTAProps {
    /** 点击"Download on App Store"按钮的回调 */
    onDownloadiOS?: () => void;
    /** 点击"Android Beta"按钮的回调 */
    onRequestAndroid?: () => void;
}

export const LandingCTA: React.FC<LandingCTAProps> = ({ onDownloadiOS, onRequestAndroid }) => {
    const { t } = useTranslation();
    return (
        <section className="py-24 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-6xl mx-auto">
                <div
                    className="rounded-[48px] overflow-hidden relative"
                    style={{
                        backgroundColor: '#2545BD',
                        boxShadow: '0 40px 80px -15px rgba(37, 69, 189, 0.4)'
                    }}
                >
                    {/* Abstract Decorative Shapes (Cleaner) */}
                    <div className="absolute top-[-50px] left-[-50px] w-80 h-80 rounded-full bg-blue-400/10 blur-3xl" />
                    <div className="absolute bottom-[-50px] right-[-50px] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-3xl" />

                    {/* Refined Decorative Shapes */}
                    <div className="absolute top-12 right-12 w-40 h-auto opacity-20 rotate-[-10deg] hidden lg:block z-0">
                        <img src={Zigzag} alt="" className="w-full h-auto" />
                    </div>
                    {/* Removed small random dots and shapes for a cleaner look */}

                    <div className="flex flex-col lg:flex-row items-center p-10 lg:p-20 relative z-10 text-center lg:text-left">
                        {/* Left: Content */}
                        <div className="w-full lg:w-3/5 text-white mb-16 lg:mb-0">
                            <h2 className="text-4xl md:text-6xl font-black mb-8 leading-[1.1] tracking-tight">
                                {t('landing.cta.heading')}<br />
                                <span style={{ color: '#FE8D00' }}>{t('landing.cta.headingHighlight')}</span> {t('landing.cta.headingSuffix')}
                            </h2>
                            <p className="text-xl opacity-90 mb-10 max-w-lg mx-auto lg:mx-0 font-medium leading-relaxed">
                                {t('landing.cta.subtitle')}
                            </p>
                            <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                                {/* 主按钮：App Store 下载 */}
                                <button
                                    onClick={onDownloadiOS}
                                    className="px-8 py-5 bg-white text-[#2545BD] font-black text-lg rounded-full hover:bg-gray-50 transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2"
                                >
                                    {/* Apple Logo */}
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                                    </svg>
                                    {t('landing.hero.getApp')}
                                </button>

                                {/* 次要按钮：Android Beta */}
                                <button
                                    onClick={onRequestAndroid}
                                    className="px-6 py-5 bg-transparent text-white/70 font-semibold text-base rounded-full border-2 border-white/30 hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                                >
                                    {t('landing.hero.androidBeta')}
                                </button>
                            </div>
                        </div>

                        {/* Right: Premium Mascot Display */}
                        <div className="w-full lg:w-2/5 relative flex justify-center items-center h-[400px]">
                            <style>{`
                                @keyframes lumi-float {
                                    0% { transform: translateY(0px) scale(1); }
                                    50% { transform: translateY(-20px) scale(1.02); }
                                    100% { transform: translateY(0px) scale(1); }
                                }
                                @keyframes glow-pulse {
                                    0% { opacity: 0.3; transform: scale(1); }
                                    50% { opacity: 0.6; transform: scale(1.1); }
                                    100% { opacity: 0.3; transform: scale(1); }
                                }
                                @keyframes gentle-float {
                                    0% { transform: translate(0, 0); }
                                    50% { transform: translate(-5px, -10px); }
                                    100% { transform: translate(0, 0); }
                                }
                                .animate-lumi { animation: lumi-float 8s ease-in-out infinite; }
                                .animate-glow { animation: glow-pulse 8s ease-in-out infinite; }
                                .animate-float { animation: gentle-float 12s ease-in-out infinite; }
                            `}</style>

                            <div className="relative">
                                {/* Background Decorative Elements - Soft Blue Circles */}
                                <div
                                    className="absolute -top-16 -left-20 w-40 h-40 rounded-full opacity-[0.08] hidden lg:block animate-float"
                                    style={{
                                        backgroundColor: '#6B9BFF',
                                        zIndex: 0
                                    }}
                                />
                                <div
                                    className="absolute -bottom-12 right-[-60px] w-32 h-32 rounded-full opacity-[0.12] hidden lg:block"
                                    style={{
                                        backgroundColor: '#8AB4FF',
                                        zIndex: 0,
                                        animationDelay: '-6s'
                                    }}
                                />

                                {/* Geometric Shapes - Subtle Gray-Purple Tones */}
                                <div
                                    className="absolute top-[-40px] right-[-40px] w-32 h-32 opacity-[0.15] hidden lg:block animate-float"
                                    style={{
                                        zIndex: 0,
                                        animationDelay: '-3s'
                                    }}
                                >
                                    <img src={Zigzag} alt="" className="w-full h-auto" style={{ filter: 'brightness(0.7) saturate(0.5)' }} />
                                </div>

                                <div
                                    className="absolute bottom-[-20px] left-[-40px] w-24 h-24 opacity-[0.12] hidden lg:block"
                                    style={{
                                        backgroundColor: '#9FA8C3',
                                        transform: 'rotate(25deg)',
                                        borderRadius: '8px',
                                        zIndex: 0
                                    }}
                                />

                                {/* Single, Crisp Glow - Much Cleaner */}
                                <div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full opacity-15"
                                    style={{
                                        background: 'radial-gradient(circle, rgba(255, 200, 100, 0.6) 0%, rgba(255, 160, 80, 0.3) 40%, transparent 70%)',
                                        filter: 'blur(40px)',
                                        zIndex: 1
                                    }}
                                />

                                {/* The High-Res Mascot with Minimal, Clean Shadow */}
                                <img
                                    src={LumiMain}
                                    alt="Lumi Mascot"
                                    className="w-72 md:w-[400px] z-20 relative animate-lumi"
                                    style={{
                                        // Subtle shadow only - no heavy blur
                                        filter: 'drop-shadow(0 10px 30px rgba(255, 200, 100, 0.25))',
                                        zIndex: 20
                                    }}
                                />

                                {/* Removed small orbiting elements to reduce "messiness" */}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Refined Scrolling text banner */}
                <div className="mt-16 py-6 border-t border-b border-gray-100 overflow-hidden">
                    <div className="flex animate-scroll whitespace-nowrap opacity-30">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-12 mx-12">
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">{t('landing.cta.banner1')}</span>
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">{t('landing.cta.banner2')}</span>
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">{t('landing.cta.banner3')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
