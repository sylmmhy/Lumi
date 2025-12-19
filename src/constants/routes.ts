export const APP_TABS = ['home', 'stats', 'urgency', 'leaderboard', 'profile'] as const
export type AppTab = typeof APP_TABS[number]

// 默认落地页调整为「Start」（对应 urgency），确保登录后直接到核心启动页
export const DEFAULT_APP_TAB: AppTab = 'urgency'
export const DEFAULT_APP_PATH = `/app/${DEFAULT_APP_TAB}`
