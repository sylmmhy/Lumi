import React, { useState } from 'react';

interface LandingFooterProps {
    /** 点击"Download"按钮的回调 - 跳转 App Store */
    onDownloadiOS?: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onDownloadiOS }) => {
    const [showContactModal, setShowContactModal] = useState(false);

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
                                onClick={onDownloadiOS}
                                className="px-6 py-3 bg-[#2545BD] text-white font-semibold rounded-full hover:bg-[#1e3a9f] transition-all flex items-center gap-2"
                            >
                                {/* Apple Logo */}
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                                </svg>
                                Download App
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
                                <li><button onClick={() => setShowContactModal(true)} className="hover:text-white transition-colors">Contact</button></li>
                            </ul>
                        </div>

                        {/* Social */}
                        <div>
                            <h4 className="font-semibold mb-4">Connect</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="https://www.tiktok.com/@meet_lumi_ai" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TikTok</a></li>
                                <li><a href="https://www.linkedin.com/company/meetlumi-ai/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">LinkedIn</a></li>
                                <li><a href="https://discord.gg/tJt8XUttK9" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a></li>
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

            {/* Contact Modal */}
            {showContactModal && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setShowContactModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Contact Us</h3>
                        <p className="text-gray-600 mb-4">CEO Email</p>
                        <a
                            href="mailto:yilun@meetlumi.org"
                            className="text-[#2545BD] font-semibold text-lg hover:underline"
                        >
                            yilun@meetlumi.org
                        </a>
                        <button
                            onClick={() => setShowContactModal(false)}
                            className="mt-6 w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </footer>
    );
};
