/**
 * VerificationBadge - 任务视觉验证状态徽章
 *
 * 显示在 CelebrationView 的成功页面中，三种状态：
 * - 验证中：旋转 spinner
 * - 验证通过：绿色 ✅ + 额外 XP
 * - 验证失败/无显示：静默不显示（不打击用户积极性）
 */

interface VerificationBadgeProps {
  /** 是否正在验证 */
  isVerifying: boolean;
  /** 验证结果 */
  result: {
    verified: boolean;
    confidence: number;
    xp_awarded: number;
    not_visually_verifiable: boolean;
  } | null;
}

export function VerificationBadge({ isVerifying, result }: VerificationBadgeProps) {
  // 验证失败时静默不显示
  if (!isVerifying && (!result || !result.verified)) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '8px 16px',
        borderRadius: '12px',
        backgroundColor: isVerifying ? '#2E2B28' : '#1a3a1a',
        border: isVerifying ? '1px solid #444' : '1px solid #2d5a2d',
        animation: 'slideUpFadeIn 0.5s ease-out forwards',
      }}
    >
      {isVerifying ? (
        <>
          {/* 旋转 spinner */}
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid #666',
              borderTopColor: '#FFC92A',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: '#999',
            }}
          >
            Verifying...
          </span>
        </>
      ) : result && result.verified ? (
        <>
          {/* 验证通过 */}
          <span style={{ fontSize: '18px' }}>
            {result.not_visually_verifiable ? '📋' : '✅'}
          </span>
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              fontWeight: 600,
              color: '#4ade80',
            }}
          >
            Verified
          </span>
          {result.xp_awarded > 0 && (
            <span
              style={{
                fontFamily: 'Sansita, sans-serif',
                fontSize: '16px',
                fontWeight: 400,
                background: 'linear-gradient(to bottom, #FAF078, #FFC92A)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              +{result.xp_awarded} XP
            </span>
          )}
        </>
      ) : null}
    </div>
  );
}
