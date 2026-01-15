import { useState } from 'react';
import { LandingPage } from '../components/landing/LandingPage';
import { BetaRequestModal } from '../components/landing/BetaRequestModal';

/** App Store 下载链接 */
const APP_STORE_URL = 'https://apps.apple.com/us/app/lumi-ai-body-doubling/id6756595704';

/**
 * Landing Page 包装组件
 *
 * 管理两种下载按钮的点击行为：
 * - iOS 按钮：直接跳转到 App Store
 * - Android 按钮：打开邮箱输入弹窗（Android 版还在开发中）
 */
export const LandingPageWrapper: React.FC = () => {
    const [isBetaModalOpen, setIsBetaModalOpen] = useState(false);

    /**
     * 处理 iOS 下载按钮点击
     * 直接在新标签页打开 App Store 链接
     */
    const handleDownloadiOS = () => {
        window.open(APP_STORE_URL, '_blank');
    };

    /**
     * 处理 Android Beta 按钮点击
     * 打开邮箱收集弹窗（因为 Android 版还在开发中）
     */
    const handleRequestAndroid = () => {
        setIsBetaModalOpen(true);
    };

    return (
        <>
            <LandingPage
                onDownloadiOS={handleDownloadiOS}
                onRequestAndroid={handleRequestAndroid}
            />
            <BetaRequestModal
                isOpen={isBetaModalOpen}
                onClose={() => setIsBetaModalOpen(false)}
            />
        </>
    );
};
