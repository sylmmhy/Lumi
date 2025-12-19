import mixpanel from 'mixpanel-browser'

let isMixpanelInitialized = false

/**
 * 生成或获取永久设备用户 ID
 * 与 Amplitude 和 PostHog 使用相同的 ID，确保跨平台一致性
 * 
 * @returns {string} 永久设备用户 ID
 */
const getOrCreatePermanentUserId = (): string => {
  const STORAGE_KEY = 'firego_permanent_user_id'
  
  let permanentUserId = localStorage.getItem(STORAGE_KEY)
  
  if (!permanentUserId) {
    permanentUserId = `puid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(STORAGE_KEY, permanentUserId)
    
    if (import.meta.env.DEV) {
      console.log('🆕 生成永久设备用户 ID:', permanentUserId)
    }
  }
  
  return permanentUserId
}

/**
 * 初始化 Mixpanel SDK
 * 
 * 关键设计：
 * 1. 生成永久设备用户 ID（存储在 localStorage，永不改变）
 * 2. 设置为 distinct_id
 * 3. 登录时通过 identify 关联账号
 * 4. 实现跨设备、跨账号的身份关联
 */
export const initMixpanel = () => {
  if (isMixpanelInitialized) return

  try {
    // 获取永久设备用户 ID
    const permanentUserId = getOrCreatePermanentUserId()
    
    mixpanel.init("5e6daeb0a1366f81e32386617599919b", {
      debug: true,
      track_pageview: true,
      persistence: "localStorage",
      // @ts-ignore - autocapture might not be in the types yet or requires specific setup
      autocapture: true,
      record_sessions_percent: 100,
    })
    
    // 设置永久设备用户 ID 作为 distinct_id
    mixpanel.identify(permanentUserId)
    
    // 设置设备级别的用户属性
    mixpanel.people.set({
      device_user_id: permanentUserId,
      first_seen: new Date().toISOString(),
    })
    
    isMixpanelInitialized = true
    console.log('✅ Mixpanel initialized with permanent user ID:', permanentUserId)
  } catch (error) {
    console.error('Failed to initialize Mixpanel:', error)
  }
}

/**
 * 发送 Mixpanel 事件
 * @param eventName 事件名称
 * @param properties 事件属性
 */
export const trackMixpanelEvent = (eventName: string, properties?: Record<string, unknown>) => {
  if (!isMixpanelInitialized) return
  mixpanel.track(eventName, properties)
}

/**
 * 设置 Mixpanel 用户 ID 并建立身份关联
 * 
 * 关键功能：使用 alias 建立身份图谱
 * - 当用户登录时，关联"账号ID"和"设备ID"
 * - Mixpanel 会自动推断所有相关身份属于同一个人
 * 
 * @param {string} userId - 用户账号 ID
 */
export const setMixpanelUserId = (userId: string) => {
  if (!isMixpanelInitialized) return
  
  // 获取当前的永久设备用户 ID
  const permanentUserId = localStorage.getItem('firego_permanent_user_id')
  
  if (permanentUserId && permanentUserId !== userId) {
    // 使用 alias 建立关联：账号ID 和 设备ID 是同一个人
    mixpanel.alias(userId, permanentUserId)
    
    if (import.meta.env.DEV) {
      console.log('🔗 Mixpanel alias:', userId, '←→', permanentUserId)
    }
  }
  
  // 标识用户
  mixpanel.identify(userId)
}

/**
 * 设置 Mixpanel 用户属性
 * @param properties 用户属性
 */
export const setMixpanelUserProperties = (properties: Record<string, unknown>) => {
  if (!isMixpanelInitialized) return
  mixpanel.people.set(properties)
}

/**
 * 重置 Mixpanel 用户状态 (退出登录)
 * 
 * 注意：不调用 mixpanel.reset()，因为那会清除 distinct_id（设备 ID）
 * 同一个设备上可能有多个账号，我们希望保持设备追踪的连续性
 * 
 * 策略：退出登录时不做任何操作，下次登录时 identify() 会自动切换到新用户
 * Mixpanel 会通过 distinct_id 关联同一设备上的不同账号
 */
export const resetMixpanelUser = () => {
  // 不执行任何操作，保留设备追踪
  // 新用户登录时会自动调用 identify(newUserId)
  if (import.meta.env.DEV) {
    console.log('🔄 Mixpanel: 保留设备 ID，等待下次登录')
  }
}

export { mixpanel }

