import { useNavigate } from 'react-router-dom';
import { LandingPage } from '../components/landing/LandingPage';

export const LandingPageWrapper: React.FC = () => {
    const navigate = useNavigate();

    const handleGetStarted = () => {
        navigate('/login');
    };

    return <LandingPage onGetStarted={handleGetStarted} />;
};
