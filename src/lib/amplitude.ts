import { getOrCreatePermanentUserId } from './permanentUserId'

type AmplitudeSdk = typeof import('@amplitude/analytics-browser')

let amplitudeSdk: AmplitudeSdk | null = null
let amplitudeSdkPromise: Promise<AmplitudeSdk> | null = null

async function loadAmplitudeSdk(): Promise<AmplitudeSdk> {
  if (amplitudeSdk) return amplitudeSdk
  if (!amplitudeSdkPromise) {
    amplitudeSdkPromise = import('./amplitudeSdk').then((mod) => {
      amplitudeSdk = mod.amplitude
      return mod.amplitude
    })
  }
  return amplitudeSdkPromise
}

let isInitialized = false
let isTestMode = false // 测试模式标志
let initPromise: Promise<void> | null = null

/**
 * 初始化 Amplitude SDK
 * 
 * 关键设计：
 * 1. 生成永久设备用户 ID（存储在 localStorage，永不改变）
 * 2. 设置为初始 Device ID
 * 3. 登录时通过 User ID 关联不同设备和账号
 * 4. 实现跨设备、跨账号的身份关联
 *
 * @returns {Promise<void>} 初始化完成或跳过
 */
export async function initAmplitude() {
  if (isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    // 检测 URL 参数，设置测试模式标志
    const urlParams = new URLSearchParams(window.location.search)
    isTestMode = urlParams.get('test') === 'true'

    const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY
    if (!apiKey) {
      console.warn('Amplitude API key missing; analytics disabled.')
      return
    }

    try {
      const amplitude = await loadAmplitudeSdk()

      // 获取永久设备用户 ID
      const permanentUserId = getOrCreatePermanentUserId()
      
      await amplitude.init(apiKey, undefined, {
        defaultTracking: { sessions: true, pageViews: true, formInteractions: false, fileDownloads: false },
        logLevel: amplitude.Types.LogLevel.None,
        // 使用永久设备用户 ID 作为 Device ID
        deviceId: permanentUserId,
      }).promise
      isInitialized = true

      // 设置设备级别的用户属性
      const identify = new amplitude.Identify()
      identify.set('device_user_id', permanentUserId)
      identify.set('first_seen', new Date().toISOString())
      
      // 测试模式：设置用户属性以触发后台过滤规则
      if (isTestMode) {
        identify.set('is_test_session', true)
        if (import.meta.env.DEV) {
          console.log('🧪 Test mode: is_test_session=true (data will be filtered by Amplitude backend)')
        }
      }
      
      amplitude.identify(identify)
      if (import.meta.env.DEV) {
        console.log('✅ Amplitude initialized with permanent user ID:', permanentUserId)
      }
    } catch (error) {
      console.error('Failed to initialize Amplitude:', error)
    } finally {
      initPromise = null
    }
  })()

  return initPromise
}

/**
 * 发送自定义事件，附带可选属性。
 *
 * @param {string} eventName - 事件名称
 * @param {Record<string, unknown>} [eventProperties] - 附加属性
 */
export function trackEvent(eventName: string, eventProperties?: Record<string, unknown>) {
  if (!isInitialized || !amplitudeSdk) return // 未初始化时跳过事件发送
  if (import.meta.env.DEV) {
    console.log('📊 Amplitude Event:', eventName, eventProperties || '')
  }
  amplitudeSdk.track(eventName, eventProperties)
}

/**
 * 设置当前用户 ID，初始化前会等待。
 *
 * @param {string} userId - Supabase 或应用的用户标识
 * @returns {Promise<void>} 标识设置结果
 */
export async function setUserId(userId: string) {
  if (!userId) return
  await initAmplitude()
  if (!isInitialized || !amplitudeSdk) return
  amplitudeSdk.setUserId(userId)
}

/**
 * 写入用户属性，跳过不支持的类型；当值为 null 时调用 unset 以移除属性。
 *
 * @param {Record<string, unknown>} properties - 待写入的用户属性
 * @returns {Promise<void>} 完成时的 Promise
 */
export async function setUserProperties(properties: Record<string, unknown>) {
  await initAmplitude()
  if (!isInitialized || !amplitudeSdk) return
  const identify = new amplitudeSdk.Identify()
  const isIdentifyValue = (value: unknown): value is string | number | boolean | string[] => {
    if (['string', 'number', 'boolean'].includes(typeof value)) return true
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
  }
  Object.entries(properties).forEach(([key, value]) => {
    if (value === undefined) return
    if (value === null) {
      identify.unset(key)
      return
    }
    if (!isIdentifyValue(value)) {
      console.warn(`Amplitude property "${key}" skipped due to unsupported type`)
      return
    }
    identify.set(key, value)
  })
  amplitudeSdk.identify(identify)
}

/**
 * 退出登录时的处理：
 * 
 * 策略：不做任何操作，保留所有身份信息
 * 
 * 原因：
 * 1. 这是个人产品，不存在多人共享设备的场景
 * 2. 同一个人可能有多个账号，切换账号也应该视为同一个人
 * 3. 通过永久设备用户 ID 和 User ID 的组合，可以实现完整的身份关联
 * 4. 退出登录后再登录其他账号，Amplitude 会自动通过 Device ID 关联
 * 
 * 身份关联逻辑：
 * - Device ID (永久设备ID) = 识别这个设备/人
 * - User ID (账号ID) = 当前登录的账号
 * - 通过 Device ID，可以关联一个人的所有账号和所有设备
 */
export function resetUser() {
  // 不执行任何操作，保留所有身份追踪
  // Device ID 和 User ID 都保持不变
  if (import.meta.env.DEV) {
    console.log('🔄 Amplitude: 保留所有身份信息，持续追踪同一个人')
  }
}
