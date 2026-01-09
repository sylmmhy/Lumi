import { createContext } from 'react';

export interface NativeAuthPayload {
    userId?: string;
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    sessionToken?: string;
    name?: string;
    pictureUrl?: string;
}

export interface AuthState {
    isLoggedIn: boolean;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
    userPicture: string | null;
    isNewUser: boolean;
    sessionToken: string | null;
    refreshToken: string | null;
    isNativeLogin: boolean;
    /** 会话是否已通过 Supabase 验证（避免 localStorage 与云端不一致） */
    isSessionValidated: boolean;
    /** 用户是否已完成习惯引导流程 */
    hasCompletedHabitOnboarding: boolean;
}

export interface AuthContextValue extends AuthState {
    /** 是否正在处理 OAuth 回调（用于避免过早跳转） */
    isOAuthProcessing: boolean;
    /** 同步本地存储并返回最新登录态 */
    checkLoginState: () => { isLoggedIn: boolean; userId: string | null; sessionToken: string | null };
    /** 跳转到登录页，带 redirect 参数 */
    navigateToLogin: (redirectPath?: string) => void;
    /** 邮箱登录 */
    loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
    /** 邮箱注册 */
    signupWithEmail: (email: string, password: string, fullName?: string, visitorId?: string) => Promise<{ error: string | null }>;
    /** 统一登录/注册：自动判断用户是否存在，已注册则登录，未注册则自动创建账户 */
    authWithEmail: (email: string, password: string) => Promise<{ error: string | null; isNewUser?: boolean }>;
    /** 发送邮箱验证码 (OTP) */
    sendEmailOtp: (email: string) => Promise<{ error: string | null }>;
    /** 使用邮箱验证码登录 */
    verifyEmailOtp: (email: string, otp: string) => Promise<{ error: string | null; isNewUser?: boolean }>;
    /** 更新用户信息 */
    updateProfile: (updates: { name?: string; pictureUrl?: string }) => Promise<{ error: string | null }>;
    /** 登出并刷新登录态 */
    logout: () => void;
    /** 清空所有本地存储 */
    fullReset: () => void;
    /** 标记引导完成 */
    markOnboardingCompleted: (taskDescription: string, timeSpent: number, status: 'success' | 'failure') => void;
    /** 标记习惯引导已完成（更新数据库） */
    markHabitOnboardingCompleted: () => Promise<{ error: string | null }>;
    /** 删除用户账户 */
    deleteAccount: () => Promise<{ error: string | null }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
