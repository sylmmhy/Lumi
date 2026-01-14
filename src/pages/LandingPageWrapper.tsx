import { useState } from 'react';
import { LandingPage } from '../components/landing/LandingPage';
import { BetaRequestModal } from '../components/landing/BetaRequestModal';

/**
 * Landing Page 包装组件
 *
 * 管理 Beta Request 弹窗的显示状态
 * 点击页面上的 CTA 按钮时打开邮箱输入弹窗
 */
export const LandingPageWrapper: React.FC = () => {
    const [isBetaModalOpen, setIsBetaModalOpen] = useState(false);

    /**
     * 处理"Request Beta Access"按钮点击
     * 打开邮箱输入弹窗
     */
    const handleGetStarted = () => {
        setIsBetaModalOpen(true);
    };

    return (
        <>
            <LandingPage onGetStarted={handleGetStarted} />
            <BetaRequestModal
                isOpen={isBetaModalOpen}
                onClose={() => setIsBetaModalOpen(false)}
            />
        </>
    );
};
