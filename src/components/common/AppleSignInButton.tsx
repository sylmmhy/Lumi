import React from 'react';

interface AppleSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Button style variant - 'black' has black background, 'white' has white background, 'outline' has white background with black border */
  variant?: 'black' | 'white' | 'outline';
  /** Button text - must be one of Apple's approved titles */
  title?: 'signin' | 'signup' | 'continue';
  /** Optional custom width class */
  className?: string;
}

/**
 * Apple Sign In Button following Apple Human Interface Guidelines
 *
 * Requirements from Apple HIG:
 * - Logo and title must be same color (both black or both white)
 * - Button height should be at least 44px
 * - Font size should be 43% of button height
 * - Approved titles: "Sign in with Apple", "Sign up with Apple", "Continue with Apple"
 *
 * @see https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
 */
export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({
  onClick,
  isLoading = false,
  disabled = false,
  variant = 'black',
  title = 'continue',
  className = '',
}) => {
  const titleText = {
    signin: 'Sign in with Apple',
    signup: 'Sign up with Apple',
    continue: 'Continue with Apple',
  }[title];

  const loadingText = {
    signin: 'Signing in...',
    signup: 'Signing up...',
    continue: 'Continuing...',
  }[title];

  // Style variants following Apple HIG
  const variantStyles = {
    black: 'bg-black text-white hover:bg-gray-900',
    white: 'bg-white text-black hover:bg-gray-50',
    outline: 'bg-white text-black border border-black hover:bg-gray-50',
  };

  const iconColor = variant === 'black' ? 'white' : 'black';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        w-full h-11 flex items-center justify-center gap-2
        rounded-lg font-medium text-base
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${className}
      `}
      style={{
        // Apple recommends font size at 43% of button height (44px * 0.43 ≈ 19px)
        fontSize: '19px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Apple Logo SVG */}
      <svg
        className="w-5 h-5 flex-shrink-0"
        viewBox="0 0 24 24"
        fill={iconColor}
        aria-hidden="true"
      >
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
      <span className="leading-none">
        {isLoading ? loadingText : titleText}
      </span>
    </button>
  );
};
