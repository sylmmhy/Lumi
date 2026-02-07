/**
 * VerificationBadge - 任务视觉验证状态徽章
 *
 * 显示在 CelebrationView 的成功页面中，三种状态：
 * - 验证中：旋转 spinner（glass-morphism 风格）
 * - 验证通过：绿色 ✅ + 额外金币（glass-morphism 风格）
 * - 验证失败/无显示：静默不显示（不打击用户积极性）
 *
 * 设计风格：Glass-morphism，在 CelebrationView 深色背景上以半透明白色呈现。
 */

interface VerificationBadgeProps {
  /** 是否正在验证 */
  isVerifying: boolean;
  /** 验证结果 */
  result: {
    verified: boolean;
    confidence: number;
    coins_awarded: number;
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
      className="flex items-center gap-2 backdrop-blur-sm"
      style={{
        padding: '8px 16px',
        borderRadius: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        animation: 'slideUpFadeIn 0.5s ease-out forwards',
      }}
    >
      {isVerifying ? (
        <>
          {/* 旋转 spinner */}
          <div
            className="w-[18px] h-[18px] rounded-full"
            style={{
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: '#FFC92A',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span
            style={{
              fontFamily: "'Quicksand', sans-serif",
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.7)',
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
              fontFamily: "'Quicksand', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: '#4ade80',
            }}
          >
            Verified
          </span>
          {result.coins_awarded > 0 && (
            <span className="flex items-center gap-1">
              <span
                style={{
                  fontFamily: "'Sansita', sans-serif",
                  fontSize: '16px',
                  fontWeight: 400,
                  background: 'linear-gradient(to bottom, #FAF078, #FFC92A)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                +{result.coins_awarded}
              </span>
              <img src="/coin.png" alt="coin" style={{ width: '18px', height: '18px' }} />
            </span>
          )}
        </>
      ) : null}
    </div>
  );
}
