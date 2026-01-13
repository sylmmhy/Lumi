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
      {/* 右上角开关按钮 */}
      <button
        onClick={() => {
          if (!isEnabled) {
            toggleEnabled()
            setIsOpen(true)
          } else {
            setIsOpen(!isOpen)
          }
        }}
        className={`fixed z-[9999] w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
          isEnabled
            ? 'bg-green-500 hover:bg-green-600'
            : 'bg-gray-500 hover:bg-gray-600'
        }`}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 50px)',
          right: '12px'
        }}
        title={isEnabled ? '打开调试控制台' : '启用调试控制台'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        {logs.filter(l => l.type === 'error').length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
            {Math.min(logs.filter(l => l.type === 'error').length, 9)}
            {logs.filter(l => l.type === 'error').length > 9 && '+'}
          </span>
        )}
      </button>

      {/* 日志面板 */}
      {isOpen && isEnabled && (
        <div
          className="fixed inset-0 z-[9998] bg-black/90 flex flex-col"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
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
                onChange={(e) => setFilter(e.target.value as LogEntry['type'] | 'all')}
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
