import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface LandingNavbarProps {
    /** 点击"Download"按钮的回调 - 跳转 App Store */
    onDownloadiOS?: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onDownloadiOS }) => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // Show navbar when scrolling up, hide when scrolling down
            if (currentScrollY < lastScrollY || currentScrollY < 50) {
                setIsVisible(true);
            } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
                setIsVisible(false);
            }

            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [lastScrollY]);

    return (
        <nav
            className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300"
            style={{
                fontFamily: 'Nunito, sans-serif',
                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                transform: isVisible ? 'translateY(0)' : 'translateY(-100%)'
            }}
        >
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <img
                            src="/lumi-icon.png"
                            alt="Lumi"
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                objectFit: 'cover'
                            }}
                        />
                        <span className="text-xl font-bold text-gray-900">
                            Lumi
                        </span>
                    </div>

                    {/* Navigation Links - Desktop */}
                    <div className="hidden md:flex items-center gap-8">
                        <a
                            href="#features"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            {t('landing.nav.features')}
                        </a>
                        <a
                            href="#testimonials"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            {t('landing.nav.testimonials')}
                        </a>
                        <a
                            href="#faq"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            {t('landing.nav.faq')}
                        </a>
                    </div>

                    {/* CTA Button */}
                    <div className="flex items-center">
                        <button
                            onClick={onDownloadiOS}
                            className="px-5 py-2.5 text-sm font-semibold rounded-full bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-all flex items-center gap-2"
                        >
                            {/* Apple Logo */}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                            </svg>
                            {t('landing.nav.downloadApp')}
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
