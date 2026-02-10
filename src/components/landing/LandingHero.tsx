import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface LandingHeroProps {
    /** 点击"Download on App Store"按钮的回调 */
    onDownloadiOS?: () => void;
    /** 点击"Android Beta"按钮的回调 */
    onRequestAndroid?: () => void;
}

/**
 * Landing 页顶部 Hero 区域
 * 增加移动端顶部留白，避免标题被固定导航栏遮挡。
 */
export const LandingHero: React.FC<LandingHeroProps> = ({ onDownloadiOS, onRequestAndroid }) => {
    const { t } = useTranslation();
    return (
        <section
            className="relative w-full overflow-hidden px-6"
            style={{
                fontFamily: 'Nunito, sans-serif',
                background: 'radial-gradient(circle at top right, #FFFFFF 0%, #F5F7FA 100%)',
                minHeight: '80vh',
                display: 'flex',
                alignItems: 'center'
            }}
        >
            {/* Content container */}
            <div className="max-w-6xl mx-auto relative w-full" style={{ zIndex: 10 }}>
                <div className="flex flex-col lg:flex-row items-center justify-between pt-24 md:pt-12 pb-24">
                    {/* Left side: Typography + CTA */}
                    <div className="w-full lg:w-[55%] z-10 text-left">
                        {/* Super Heading */}
                        <h1
                            className="text-gray-900"
                            style={{
                                fontWeight: 900,
                                fontSize: '48px',
                                lineHeight: '1.2em',
                                letterSpacing: '-0.03em',
                                marginBottom: '32px'
                            }}
                        >
                            {t('landing.hero.heading')} <span style={{ color: '#2545BD' }}>{t('landing.hero.headingHighlight')}</span> {t('landing.hero.headingSuffix')}
                        </h1>

                        <p className="text-lg text-gray-400 mb-10 max-w-lg leading-relaxed font-medium italic">
                            {t('landing.hero.subtitle')}
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-wrap items-center gap-4">
                            {/* 主按钮：App Store 下载 */}
                            <button
                                onClick={onDownloadiOS}
                                className="transition-all hover:opacity-90 transform hover:scale-105 active:scale-95 flex items-center gap-3"
                                style={{
                                    fontWeight: 700,
                                    fontSize: '18px',
                                    backgroundColor: '#2545BD',
                                    color: '#FFFFFF',
                                    borderRadius: '9999px',
                                    padding: '20px 40px',
                                    textAlign: 'center',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 20px 40px rgba(37, 69, 189, 0.2)'
                                }}
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
                                className="transition-all hover:bg-gray-100 transform hover:scale-105 active:scale-95"
                                style={{
                                    fontWeight: 600,
                                    fontSize: '16px',
                                    backgroundColor: 'transparent',
                                    color: '#6B7280',
                                    borderRadius: '9999px',
                                    padding: '18px 28px',
                                    textAlign: 'center',
                                    border: '2px solid #E5E7EB',
                                    cursor: 'pointer'
                                }}
                            >
                                {t('landing.hero.androidBeta')}
                            </button>
                        </div>
                    </div>

                    {/* Right side: Phone mockup with refined circles */}
                    <div className="w-full lg:w-[45%] relative flex justify-center lg:justify-end mt-16 lg:mt-0">
                        <div className="relative">
                            {/* Refined Blue circle */}
                            <div
                                className="absolute rounded-full hidden lg:block"
                                style={{
                                    width: '420px',
                                    height: '420px',
                                    backgroundColor: '#2545BD',
                                    left: '60%',
                                    top: '50%',
                                    transform: 'translate(-15%, -50%)',
                                    zIndex: 1,
                                    opacity: 0.9,
                                    filter: 'blur(1px)'
                                }}
                            />
                            {/* Phone mockup */}
                            <img
                                src="/hero-phones.png"
                                alt="Lumi App"
                                style={{
                                    width: '520px',
                                    height: 'auto',
                                    objectFit: 'contain',
                                    position: 'relative',
                                    zIndex: 3,
                                    borderRadius: '24px'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Background decorative gradient */}
            <div
                className="absolute top-0 right-0 w-1/2 h-full hidden lg:block"
                style={{
                    background: 'radial-gradient(circle at 70% 30%, rgba(37, 69, 189, 0.03) 0%, transparent 70%)',
                    zIndex: 0
                }}
            />
        </section>
    );
};
