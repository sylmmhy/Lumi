import React from 'react';

interface LandingFooterProps {
    onGetStarted?: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onGetStarted }) => {
    return (
        <footer style={{ fontFamily: 'Nunito, sans-serif' }}>
            {/* Yellow wave top */}
            <div className="h-16 bg-gradient-to-r from-yellow-400 to-orange-400" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0, 0 60%)' }}></div>

            {/* Main footer content */}
            <div className="bg-gray-900 text-white py-16 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-12">
                        {/* Brand */}
                        <div className="md:col-span-1">
                            <h3 className="text-2xl font-bold mb-4">Lumi</h3>
                            <p className="text-gray-400 mb-6">
                                Your AI body double for beating procrastination and building lasting habits.
                            </p>
                            <button
                                onClick={onGetStarted}
                                className="px-6 py-3 bg-[#2545BD] text-white font-semibold rounded-full hover:bg-[#1e3a9f] transition-all"
                            >
                                Get Started
                            </button>
                        </div>

                        {/* Product */}
                        <div>
                            <h4 className="font-semibold mb-4">Product</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                                <li><a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a></li>
                                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
                            </ul>
                        </div>

                        {/* Company */}
                        <div>
                            <h4 className="font-semibold mb-4">Company</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="https://meetlumi.org/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a></li>
                                <li><a href="https://meetlumi.org/terms" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Use</a></li>
                                <li><a href="mailto:support@getlumi.app" className="hover:text-white transition-colors">Contact</a></li>
                            </ul>
                        </div>

                        {/* Social */}
                        <div>
                            <h4 className="font-semibold mb-4">Connect</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Discord</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                        <p className="text-gray-500 text-sm">
                            © {new Date().getFullYear()} Lumi. All rights reserved.
                        </p>
                        <p className="text-gray-500 text-sm mt-4 md:mt-0">
                            Made with 🔥 for procrastinators everywhere
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
};
