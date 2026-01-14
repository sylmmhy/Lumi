/**
 * DevConsole - WebView 调试控制台
 *
 * 在原生 App 的 WebView 中显示实时日志，方便调试。
 * 点击右上角的按钮可以打开/关闭日志面板。
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { detectWebView } from '../../utils/webviewDetection'

interface LogEntry {
  id: number
  type: 'log' | 'warn' | 'error' | 'info' | 'debug'
  timestamp: Date
  args: unknown[]
}

// 日志颜色映射
const logColors: Record<LogEntry['type'], string> = {
  log: 'text-gray-200',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-purple-400',
}

// 日志图标
const logIcons: Record<LogEntry['type'], string> = {
  log: '●',
  info: 'ℹ',
  warn: '⚠',
  error: '✕',
  debug: '⚙',
}

// 格式化参数为字符串
function formatArg(arg: unknown): string {
  if (arg === null) return 'null'
  if (arg === undefined) return 'undefined'
  if (typeof arg === 'string') return arg
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`
  }
  try {
    return JSON.stringify(arg, null, 2)
  } catch {
    return String(arg)
  }
}

// 最大日志条数
const MAX_LOGS = 200

// 本地存储键名
const STORAGE_KEY = 'dev_console_enabled'
const AUTH_SESSION_KEY = 'dev_console_auth'

// 控制台密码
const CONSOLE_PASSWORD = '0211'

export function DevConsole() {
  const [isOpen, setIsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(() => {
    // 从本地存储读取开关状态
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogEntry['type'] | 'all'>('all')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logIdRef = useRef(0)

  // 密码验证状态
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_SESSION_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  // 复制成功提示状态
  const [showCopyToast, setShowCopyToast] = useState(false)
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 用于在密码验证后延迟复制日志（解决闭包陷阱）
  const [pendingCopyOnOpen, setPendingCopyOnOpen] = useState(false)

  // 双击检测
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 检测是否在原生 App 中
  const webViewInfo = detectWebView()
  const isInNativeApp = webViewInfo.isNativeApp

  // 添加日志条目
  const addLog = useCallback((type: LogEntry['type'], args: unknown[]) => {
    setLogs(prev => {
      const newLogs = [
        ...prev,
        {
          id: ++logIdRef.current,
          type,
          timestamp: new Date(),
          args,
        }
      ]
      // 限制日志条数
      if (newLogs.length > MAX_LOGS) {
        return newLogs.slice(-MAX_LOGS)
      }
      return newLogs
    })
  }, [])

  /**
   * 格式化日志条目为可读文本
   * @param logsToFormat - 要格式化的日志条目数组
   * @returns 格式化后的文本字符串
   */
  const formatLogsForClipboard = useCallback((logsToFormat: LogEntry[]): string => {
    return logsToFormat.map(log => {
      const timestamp = log.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + '.' + String(log.timestamp.getMilliseconds()).padStart(3, '0')
      const content = log.args.map(arg => formatArg(arg)).join(' ')
      return `[${timestamp}] [${log.type.toUpperCase()}] ${content}`
    }).join('\n')
  }, [])

  /**
   * 复制指定日志到剪贴板并显示提示
   * @param logsToCopy - 要复制的日志条目数组
   */
  const copyLogsToClipboard = useCallback(async (logsToCopy: LogEntry[]) => {
    if (logsToCopy.length === 0) return

    const formattedText = formatLogsForClipboard(logsToCopy)
    try {
      await navigator.clipboard.writeText(formattedText)

      // 清除之前的定时器
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current)
      }

      // 显示复制成功提示
      setShowCopyToast(true)

      // 2秒后自动隐藏
      copyToastTimerRef.current = setTimeout(() => {
        setShowCopyToast(false)
      }, 2000)
    } catch (err) {
      console.error('[DevConsole] 复制到剪贴板失败:', err)
    }
  }, [formatLogsForClipboard])

  // 拦截 console 方法
  useEffect(() => {
    if (!isEnabled) return

    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }

    // 包装 console 方法
    console.log = (...args: unknown[]) => {
      originalConsole.log.apply(console, args)
      addLog('log', args)
    }
    console.info = (...args: unknown[]) => {
      originalConsole.info.apply(console, args)
      addLog('info', args)
    }
    console.warn = (...args: unknown[]) => {
      originalConsole.warn.apply(console, args)
      addLog('warn', args)
    }
    console.error = (...args: unknown[]) => {
      originalConsole.error.apply(console, args)
      addLog('error', args)
    }
    console.debug = (...args: unknown[]) => {
      originalConsole.debug.apply(console, args)
      addLog('debug', args)
    }

    // 捕获未处理的错误
    const handleError = (event: ErrorEvent) => {
      addLog('error', [`Uncaught Error: ${event.message}`, `at ${event.filename}:${event.lineno}:${event.colno}`])
    }

    // 捕获未处理的 Promise 拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      addLog('error', ['Unhandled Promise Rejection:', event.reason])
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // 添加初始化日志
    addLog('info', ['[DevConsole] 调试控制台已启动'])
    addLog('info', [`[DevConsole] WebView 环境: ${webViewInfo.type}`])
    addLog('info', [`[DevConsole] User-Agent: ${webViewInfo.userAgent.substring(0, 100)}...`])

    return () => {
      // 恢复原始 console 方法
      console.log = originalConsole.log
      console.info = originalConsole.info
      console.warn = originalConsole.warn
      console.error = originalConsole.error
      console.debug = originalConsole.debug
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [isEnabled, addLog, webViewInfo.type, webViewInfo.userAgent])

  // 保存开关状态到本地存储
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isEnabled))
    } catch {
      // ignore
    }
  }, [isEnabled])

  // 自动滚动到底部
  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isOpen])

  // 密码验证成功后延迟复制日志（等待初始化日志加载）
  useEffect(() => {
    if (pendingCopyOnOpen && logs.length > 0) {
      copyLogsToClipboard(logs)
      setPendingCopyOnOpen(false)
    }
  }, [pendingCopyOnOpen, logs, copyLogsToClipboard])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current)
      }
    }
  }, [])

  // 清除日志
  const clearLogs = () => {
    setLogs([])
  }

  // 切换启用状态
  const toggleEnabled = () => {
    setIsEnabled(prev => !prev)
    if (isEnabled) {
      setLogs([])
    }
  }

  // 验证密码
  const handlePasswordSubmit = () => {
    if (password === CONSOLE_PASSWORD) {
      setIsAuthenticated(true)
      setShowPasswordInput(false)
      setPassword('')
      setPasswordError(false)
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true')
      } catch {
        // ignore
      }
      // 验证成功后直接打开控制台
      if (!isEnabled) {
        toggleEnabled()
      }
      setIsOpen(true)

      // 标记需要复制日志（useEffect 会在日志加载后执行复制）
      setPendingCopyOnOpen(true)
    } else {
      setPasswordError(true)
      setPassword('')
    }
  }

  // 取消密码输入
  const handlePasswordCancel = () => {
    setShowPasswordInput(false)
    setPassword('')
    setPasswordError(false)
  }

  // 过滤日志
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.type === filter)

  // 如果不在原生 App 中，也不在开发模式，则不显示
  // 在开发模式下始终可用，方便测试
  const isDev = import.meta.env.DEV
  if (!isInNativeApp && !isDev) {
    return null
  }

  return (
    <>
      {/* 右上角开关按钮 - 透明的，需要双击才能打开 */}
      <button
        onClick={() => {
          // 如果已验证，正常操作（单击即可）
          if (isAuthenticated) {
            if (!isEnabled) {
              toggleEnabled()
              setIsOpen(true)
            } else {
              setIsOpen(!isOpen)
            }
            return
          }

          // 未验证时，需要双击才能打开密码输入框
          clickCountRef.current += 1

          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
          }

          if (clickCountRef.current >= 2) {
            // 双击成功，显示密码输入框
            clickCountRef.current = 0
            setShowPasswordInput(true)
          } else {
            // 等待第二次点击
            clickTimerRef.current = setTimeout(() => {
              clickCountRef.current = 0
            }, 500) // 500ms 内需要完成双击
          }
        }}
        className="fixed z-[9999] w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 bg-transparent"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 50px)',
          right: '12px'
        }}
        title="Debug Console"
      >
        {/* 透明按钮，不显示图标 */}
      </button>

      {/* 复制成功提示 Toast */}
      {showCopyToast && (
        <div
          className="fixed z-[10001] top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg shadow-lg flex items-center gap-2 animate-fade-in"
        >
          <span>✓</span>
          <span>Logs copied to clipboard</span>
        </div>
      )}

      {/* 密码输入弹窗 */}
      {showPasswordInput && (
        <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-xs border border-gray-700">
            <h3 className="text-white text-lg font-semibold mb-4 text-center">
              Debug Entry
            </h3>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setPasswordError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit()
                }
              }}
              placeholder="Enter password"
              autoFocus
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white text-center text-lg tracking-widest ${
                passwordError ? 'border-red-500' : 'border-gray-600'
              } focus:outline-none focus:border-blue-500`}
            />
            {passwordError && (
              <p className="text-red-400 text-sm text-center mt-2">
                Wrong password
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handlePasswordCancel}
                className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 日志面板 */}
      {isOpen && isEnabled && (
        <div
          className="fixed inset-0 z-[9998] bg-black/90 flex flex-col"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 50px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* 头部工具栏 */}
          <div className="flex items-center justify-between px-3 py-3 bg-gray-900 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-white font-mono text-sm">DevConsole</span>
              <span className="text-gray-400 text-xs">({logs.length} logs)</span>
            </div>
            <div className="flex items-center gap-2">
              {/* 过滤器 */}
              <select
                value={filter}
                onChange={(e) => {
                  const newFilter = e.target.value as LogEntry['type'] | 'all'
                  setFilter(newFilter)
                  // 更改日志级别时自动复制该类型的日志
                  const logsToCopy = newFilter === 'all'
                    ? logs
                    : logs.filter(log => log.type === newFilter)
                  copyLogsToClipboard(logsToCopy)
                }}
                className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600"
              >
                <option value="all">全部</option>
                <option value="log">Log</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="debug">Debug</option>
              </select>
              {/* 清除按钮 */}
              <button
                onClick={clearLogs}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-gray-800 rounded border border-gray-600"
              >
                清除
              </button>
              {/* 禁用按钮 */}
              <button
                onClick={toggleEnabled}
                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-800 rounded border border-gray-600"
              >
                禁用
              </button>
              {/* 关闭按钮 */}
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-gray-300 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
          </div>

          {/* 环境信息 */}
          <div className="px-3 py-1 bg-gray-800 text-xs text-gray-400 border-b border-gray-700 font-mono">
            <span className="mr-4">环境: {webViewInfo.type}</span>
            <span>Native: {isInNativeApp ? '是' : '否'}</span>
          </div>

          {/* 日志列表 */}
          <div className="flex-1 overflow-auto p-2 font-mono text-xs">
            {filteredLogs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                暂无日志
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  className={`py-1 px-2 border-b border-gray-800 ${logColors[log.type]}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="opacity-50 shrink-0">
                      {log.timestamp.toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}.{String(log.timestamp.getMilliseconds()).padStart(3, '0')}
                    </span>
                    <span className="shrink-0">{logIcons[log.type]}</span>
                    <div className="flex-1 break-all whitespace-pre-wrap">
                      {log.args.map((arg, i) => (
                        <span key={i}>
                          {i > 0 && ' '}
                          {formatArg(arg)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* 底部提示 */}
          <div className="px-3 py-2 bg-gray-900 border-t border-gray-700 text-xs text-gray-500 text-center">
            提示: 日志会自动捕获 console.log/warn/error/info/debug 以及未处理的错误
          </div>
        </div>
      )}
    </>
  )
}
