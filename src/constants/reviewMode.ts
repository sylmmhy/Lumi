/**
 * Apple App Store Review Mode Configuration
 *
 * Set this to `true` when submitting for Apple review.
 * This enables a simplified onboarding flow that complies with Apple's guidelines:
 * - Guideline 5.1.1: Permission prompts
 *   - Button text uses "Continue" instead of "Allow Camera/Microphone"
 *   - No "Skip" buttons - must request permission immediately
 *   - System permission dialog appears immediately after tapping "Continue"
 *
 * After approval, set back to `false` to use the original onboarding flow.
 */
export const APPLE_REVIEW_MODE = true;
