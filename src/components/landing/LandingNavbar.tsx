import React, { useState, useEffect } from 'react';

interface LandingNavbarProps {
    onGetStarted?: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onGetStarted }) => {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                isScrolled ? 'bg-white shadow-md' : 'bg-transparent'
            }`}
            style={{ fontFamily: 'Nunito, sans-serif' }}
        >
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🔥</span>
                        <span className={`text-xl font-bold transition-colors ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                            Lumi
                        </span>
                    </div>

                    {/* Navigation Links - Desktop */}
                    <div className="hidden md:flex items-center gap-8">
                        <a
                            href="#features"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                            }`}
                        >
                            Features
                        </a>
                        <a
                            href="#testimonials"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                            }`}
                        >
                            Testimonials
                        </a>
                        <a
                            href="#faq"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                            }`}
                        >
                            FAQ
                        </a>
                    </div>

                    {/* CTA Button */}
                    <div className="flex items-center gap-4">
                        <a
                            href="/login"
                            className={`hidden md:block text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                            }`}
                        >
                            Log in
                        </a>
                        <button
                            onClick={onGetStarted}
                            className={`px-5 py-2.5 text-sm font-semibold rounded-full transition-all ${
                                isScrolled
                                    ? 'bg-[#2545BD] text-white hover:bg-[#1e3a9f]'
                                    : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                            }`}
                        >
                            Try for free
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
