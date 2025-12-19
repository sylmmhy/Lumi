import { Home, BarChart3, Bell, User } from 'lucide-react'
import React from 'react'

type NavKey = 'home' | 'progress' | 'alerts' | 'profile'

interface BottomNavBarProps {
  activeKey?: NavKey
  variant?: 'light' | 'dark'
}

const NAV_ITEMS: Array<{
  key: NavKey
  label: string
  Icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'progress', label: 'Progress', Icon: BarChart3 },
  { key: 'alerts', label: 'Alerts', Icon: Bell },
  { key: 'profile', label: 'Profile', Icon: User },
]

// 固定底部导航，仅在已登录时显示
export function BottomNavBar({ activeKey, variant = 'light' }: BottomNavBarProps) {
  const isDark = variant === 'dark'

  const containerStyle = isDark
    ? {
        backgroundColor: 'rgba(31, 31, 31, 0.92)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 -6px 30px rgba(0,0,0,0.35)',
      }
    : {
        backgroundColor: '#f6f7fb',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -6px 30px rgba(0,0,0,0.12)',
      }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="px-4 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mb-4 flex max-w-[540px] items-center justify-between rounded-[22px] px-6 py-3" style={containerStyle}>
          {NAV_ITEMS.map(({ key, label, Icon }) => {
            const isActive = activeKey === key
            return (
              <button
                key={key}
                type="button"
                className="flex flex-1 flex-col items-center gap-1 rounded-full py-1 text-xs font-medium transition-colors"
                style={{
                  color: isDark
                    ? isActive
                      ? '#f9fafb'
                      : '#9ca3af'
                    : isActive
                      ? '#111827'
                      : '#6b7280',
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(249, 250, 251, 0.08)'
                      : 'rgba(17, 24, 39, 0.06)'
                    : 'transparent',
                }}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
