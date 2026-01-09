import React, { useState, useEffect } from 'react';

interface LandingNavbarProps {
    onGetStarted?: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onGetStarted }) => {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
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
                        <span className={`text-xl font-bold ${isScrolled ? 'text-gray-900' : 'text-gray-900'}`}>
                            Lumi
                        </span>
                    </div>

                    {/* Navigation Links - Desktop */}
                    <div className="hidden md:flex items-center gap-8">
                        <a
                            href="#features"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            Features
                        </a>
                        <a
                            href="#testimonials"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            Testimonials
                        </a>
                        <a
                            href="#faq"
                            className={`text-sm font-medium transition-colors ${
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-700 hover:text-gray-900'
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
                                isScrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            Log in
                        </a>
                        <button
                            onClick={onGetStarted}
                            className="px-5 py-2.5 bg-[#2545BD] text-white text-sm font-semibold rounded-full hover:bg-[#1e3a9f] transition-all"
                        >
                            Try for free
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
