type PostHogClient = typeof import('posthog-js')['default']

let posthog: PostHogClient | null = null
let posthogPromise: Promise<PostHogClient> | null = null

async function loadPostHogClient(): Promise<PostHogClient> {
  if (posthog) return posthog
  if (!posthogPromise) {
    posthogPromise = import('./posthogSdk').then((mod) => {
      posthog = mod.posthog
      return mod.posthog
    })
  }
  return posthogPromise
}

let isPostHogInitialized = false
let initPromise: Promise<void> | null = null

/**
 * 生成永久设备用户 ID
 * 这个 ID 存储在 localStorage 中，永不改变
 * 用于识别"这个设备上的人"，即使切换账号或退出登录
 * 
 * @returns {string} 设备用户 ID
 */
const getOrCreatePermanentUserId = (): string => {
  const STORAGE_KEY = 'firego_permanent_user_id'
  
  // 尝试从 localStorage 读取
  let permanentUserId = localStorage.getItem(STORAGE_KEY)
  
  // 如果不存在，生成新的
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
 * 初始化 PostHog SDK
 * 
 * 关键设计：
 * 1. 生成永久设备用户 ID（存储在 localStorage，永不改变）
 * 2. 使用这个 ID 作为初始的 distinct_id
 * 3. 登录时通过 alias 关联账号和设备
 * 4. 实现跨设备、跨账号的身份关联
 * 
 * @returns {void}
 */
export const initPostHog = async () => {
  if (isPostHogInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const client = await loadPostHogClient()

      // 获取或创建永久设备用户 ID
      const permanentUserId = getOrCreatePermanentUserId()
      
      client.init('phc_jvbFGqyv4KpwINXVBuARBL18Lx5OlyNlbCwYuinnX3j', {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        // 移除 bootstrap，改用下面的主动 identify 逻辑，这样更可靠
        // bootstrap: { distinctID: permanentUserId },
      })

      // 关键修正：关联 PostHog 原生匿名 ID 与我们的永久设备 ID
      const currentDistinctId = client.get_distinct_id()
      
      // 如果当前 ID 不是 puid，说明可能是 PostHog 自动生成的匿名 ID
      // 或者是之前的登录 ID。我们需要确保它与 puid 关联。
      if (currentDistinctId && currentDistinctId !== permanentUserId) {
        // 只有当当前 ID 不是已登录的用户 ID 时（简单判断：不包含 puid 且不像邮箱/UUID），才进行关联
        // 但为了保险，我们在应用启动时，如果没有登录，就强制 identify 到 puid
        const isUserLoggedIn = localStorage.getItem('user_id')
        
        if (!isUserLoggedIn) {
          // 未登录状态下，强制将当前会话归属到永久设备 ID
          client.identify(permanentUserId)
          if (import.meta.env.DEV) {
            console.log('🔗 PostHog: 将原生匿名 ID 关联到 PUID:', currentDistinctId, '->', permanentUserId)
          }
        }
      }
      
      // 确保设置设备属性
      client.people.set({
        device_user_id: permanentUserId,
        first_seen_at: new Date().toISOString(),
      })
      
      isPostHogInitialized = true
      console.log('✅ PostHog initialized with permanent user ID:', permanentUserId)
    } catch (error) {
      console.error('Failed to initialize PostHog:', error)
    } finally {
      initPromise = null
    }
  })()

  return initPromise
}

/**
 * 发送 PostHog 事件
 * 
 * @param {string} eventName - 事件名称
 * @param {Record<string, unknown>} [properties] - 事件属性（可选）
 */
export const trackPostHogEvent = (eventName: string, properties?: Record<string, unknown>) => {
  if (!isPostHogInitialized || !posthog) return
  posthog.capture(eventName, properties)
}

/**
 * 设置 PostHog 用户 ID 并建立身份关联
 * 
 * 关键功能：使用 alias 建立身份图谱
 * - 当用户登录时，关联"账号ID"和"设备ID"
 * - PostHog 会自动推断所有相关身份属于同一个人
 * 
 * 举例：
 * 1. 电脑登录账号A → alias(accountA, device_pc)
 * 2. 电脑登录账号B → alias(accountB, device_pc)
 * 3. 手机登录账号A → alias(accountA, device_phone)
 * 结果：PostHog 推断 device_pc = device_phone = accountA = accountB = 同一个人
 * 
 * @param {string} userId - 用户账号 ID
 */
export const setPostHogUserId = (userId: string) => {
  if (!isPostHogInitialized || !posthog) return
  
  // 获取当前的永久设备用户 ID
  const permanentUserId = localStorage.getItem('firego_permanent_user_id')
  
  if (permanentUserId && permanentUserId !== userId) {
    // 使用 alias 建立关联：账号ID 和 设备ID 是同一个人
    posthog.alias(userId, permanentUserId)
    
    if (import.meta.env.DEV) {
      console.log('🔗 PostHog alias:', userId, '←→', permanentUserId)
    }
  }
  
  // 标识用户
  posthog.identify(userId)
}

/**
 * 设置 PostHog 用户属性
 * 这些属性会附加到用户档案上，可用于后续的分析和分组
 * 
 * @param {Record<string, unknown>} properties - 用户属性
 */
export const setPostHogUserProperties = (properties: Record<string, unknown>) => {
  if (!isPostHogInitialized || !posthog) return
  // PostHog 使用 people.set() 来设置用户属性
  posthog.people.set(properties)
}

/**
 * 重置 PostHog 用户状态（退出登录时调用）
 * 
 * 注意：不调用 posthog.reset()，因为那会清除 distinct_id（设备 ID）
 * 同一个设备上可能有多个账号（个人账号、工作账号等）
 * 我们希望保持设备追踪的连续性，通过 distinct_id 关联同一设备上的不同账号
 * 
 * 策略：退出登录时不做任何操作，下次登录时 identify() 会自动切换到新用户
 * PostHog 会自动处理用户切换，并保持设备级别的追踪
 */
export const resetPostHogUser = () => {
  // 不执行任何操作，保留设备追踪
  // 新用户登录时会自动调用 identify(newUserId)
  if (import.meta.env.DEV) {
    console.log('🔄 PostHog: 保留设备 ID，等待下次登录')
  }
}
