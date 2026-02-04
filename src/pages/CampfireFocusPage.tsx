/**
 * CampfireFocusPage - 篝火专注模式主页面
 * 
 * 路由：/campfire
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampfireFocusView } from '../components/campfire/CampfireFocusView';
import { FocusEndModal } from '../components/campfire/FocusEndModal';
// SessionStats 类型定义
interface SessionStats {
  sessionId: string;
  taskDescription: string | null;
  durationSeconds: number;
  chatCount: number;
  distractionCount: number;
}

export function CampfireFocusPage() {
  const navigate = useNavigate();
  const [endStats, setEndStats] = useState<SessionStats | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  const handleEnd = (stats: SessionStats | null) => {
    setEndStats(stats);
    setShowEndModal(true);
  };

  const handleCloseModal = () => {
    setShowEndModal(false);
    navigate('/app/home'); // 返回主页
  };

  return (
    <>
      <CampfireFocusView onEnd={handleEnd} />
      {showEndModal && (
        <FocusEndModal
          stats={endStats}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
