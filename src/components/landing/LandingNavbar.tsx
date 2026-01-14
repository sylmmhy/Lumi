import React, { useState, useEffect } from 'react';

interface LandingNavbarProps {
    onGetStarted?: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onGetStarted }) => {
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
                            Features
                        </a>
                        <a
                            href="#testimonials"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Testimonials
                        </a>
                        <a
                            href="#faq"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            FAQ
                        </a>
                    </div>

                    {/* CTA Button */}
                    <div className="flex items-center">
                        <button
                            onClick={onGetStarted}
                            className="px-5 py-2.5 text-sm font-semibold rounded-full bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-all"
                        >
                            Request Beta Access
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
