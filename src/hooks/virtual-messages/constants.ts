/**
 * # 动态虚拟消息系统常量定义
 *
 * 本文件定义了话题检测规则、情绪词库等常量配置。
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import type { TopicRule, EmotionalState } from './types'

// =====================================================
// 话题检测规则
// =====================================================

/**
 * 话题检测规则
 * 每个话题包含：关键词、同义词、关联的记忆搜索问题
 */
export const TOPIC_RULES: TopicRule[] = [
  // ====== 情感类话题 ======
  {
    id: 'breakup',
    name: '失恋',
    keywords: ['失恋', '分手', '前任', 'ex', '被甩'],
    synonyms: ['感情问题', '恋爱受挫'],
    emotion: 'sad',
    emotionIntensity: 0.8,
    memoryQuestions: [
      '用户之前如何处理失恋或情感问题？',
      '用户情绪低落时什么方法有效？',
      '用户在亲密关系中有什么模式或顾虑？',
    ],
  },
  {
    id: 'stress',
    name: '压力',
    keywords: ['压力', '焦虑', '紧张', '喘不过气', '崩溃'],
    synonyms: ['心理压力', '工作压力'],
    emotion: 'anxious',
    emotionIntensity: 0.7,
    memoryQuestions: [
      '用户通常因为什么感到压力？',
      '用户如何应对压力和焦虑？',
      '什么方法能帮助用户放松？',
    ],
  },
  {
    id: 'loneliness',
    name: '孤独',
    keywords: ['孤独', '寂寞', '一个人', '没人', '独自'],
    synonyms: ['孤单', '落寞'],
    emotion: 'sad',
    emotionIntensity: 0.6,
    memoryQuestions: [
      '用户什么时候会感到孤独？',
      '用户如何应对孤独感？',
      '什么活动能让用户感到不那么孤单？',
    ],
  },

  // ====== 生活类话题 ======
  {
    id: 'travel',
    name: '旅行',
    // 包含旅行准备相关的关键词（打包、行李等）
    keywords: [
      '旅行', '旅游', '出门', '度假', '露营', '自驾',
      '打包', '收拾', '行李', '整理行李', '收拾行李',
      'packing', 'pack', 'suitcase', 'luggage', 'travel', 'trip',
    ],
    synonyms: ['出去玩', '去哪玩', '准备行李', 'pack my bag'],
    emotion: 'happy',
    emotionIntensity: 0.6,
    memoryQuestions: [
      '用户之前去过哪些地方旅行？',
      '用户喜欢什么类型的旅行活动？',
      '用户旅行前通常有什么准备习惯或焦虑？',
      '用户通常和谁一起旅行？',
      '用户最近提到过什么旅行计划？',
      // 新增：更发散的问题，用于关联生活背景
      'What upcoming trips or events has the user mentioned?',
      'Why might the user be packing? Any destinations mentioned?',
    ],
  },
  {
    id: 'fitness',
    name: '健身',
    keywords: ['健身', '运动', '跑步', '锻炼', '健身房', 'gym'],
    synonyms: ['去运动', '去健身房'],
    emotion: 'neutral',
    emotionIntensity: 0.3,
    memoryQuestions: [
      '用户之前的运动习惯是什么？',
      '用户健身前有什么拖延或阻力模式？',
      '什么方法能有效激励用户去运动？',
      '用户对运动有什么身体反应或顾虑？',
    ],
  },
  {
    id: 'hobby',
    name: '兴趣爱好',
    keywords: ['学', '练习', '兴趣', '爱好', '吉他', '钢琴', '画画', '摄影'],
    synonyms: ['业余爱好', '个人兴趣'],
    emotion: 'happy',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户有什么兴趣爱好？',
      '用户最近在学习什么新技能？',
      '用户在学习新事物时有什么模式？',
    ],
  },
  {
    id: 'food',
    name: '美食',
    keywords: ['吃', '美食', '做饭', '餐厅', '外卖', '烹饪'],
    synonyms: ['吃饭', '下馆子'],
    emotion: 'happy',
    emotionIntensity: 0.4,
    memoryQuestions: [
      '用户喜欢吃什么类型的食物？',
      '用户有什么饮食习惯或偏好？',
      '用户最近尝试过什么新餐厅或食物？',
    ],
  },

  // ====== 工作类话题 ======
  {
    id: 'work',
    name: '工作',
    keywords: ['工作', '上班', '项目', '开会', 'deadline', '老板'],
    synonyms: ['上班族', '职场'],
    emotion: 'neutral',
    emotionIntensity: 0.4,
    memoryQuestions: [
      '用户在工作中有什么拖延模式？',
      '用户面对工作任务时有什么情绪反应？',
      '什么方法能帮助用户集中注意力工作？',
    ],
  },
  {
    id: 'coding',
    name: '写代码',
    keywords: ['写代码', '编程', 'coding', 'bug', '开发'],
    synonyms: ['敲代码', '写程序'],
    emotion: 'neutral',
    emotionIntensity: 0.3,
    memoryQuestions: [
      '用户写代码时有什么分心或拖延模式？',
      '用户对编程任务有什么情绪反应？',
      '什么方法能帮助用户进入心流状态？',
    ],
  },
  {
    id: 'study',
    name: '学习',
    keywords: ['学习', '考试', '作业', '复习', '备考'],
    synonyms: ['念书', '读书'],
    emotion: 'neutral',
    emotionIntensity: 0.4,
    memoryQuestions: [
      '用户学习时有什么拖延模式？',
      '用户面对学习任务时有什么情绪反应？',
      '什么方法能帮助用户集中注意力学习？',
    ],
  },

  // ====== 社交类话题 ======
  {
    id: 'friends',
    name: '朋友',
    keywords: ['朋友', '朋友们', '闺蜜', '哥们', '聚会'],
    synonyms: ['社交', '约朋友'],
    emotion: 'happy',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户通常和谁一起活动？',
      '用户在社交中有什么偏好或顾虑？',
      '用户提到过哪些朋友的名字？',
    ],
  },
  {
    id: 'family',
    name: '家人',
    keywords: ['家人', '爸妈', '父母', '家里', '回家'],
    synonyms: ['家庭', '亲人'],
    emotion: 'neutral',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户和家人的关系如何？',
      '用户在家庭中有什么角色或责任？',
      '用户提到过哪些家庭成员？',
    ],
  },
  {
    id: 'relationship',
    name: '感情',
    keywords: ['感情', '恋爱', '对象', '男朋友', '女朋友', '暧昧'],
    synonyms: ['谈恋爱', '约会'],
    emotion: 'happy',
    emotionIntensity: 0.6,
    memoryQuestions: [
      '用户目前的感情状态如何？',
      '用户在感情中有什么模式或期望？',
      '用户提到过感情相关的人或事？',
    ],
  },

  // ====== 健康类话题 ======
  {
    id: 'sleep',
    name: '睡眠',
    keywords: ['睡觉', '失眠', '熬夜', '早起', '困'],
    synonyms: ['休息', '入睡'],
    emotion: 'tired',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户的睡眠习惯是什么？',
      '用户有什么睡眠问题或困扰？',
      '什么方法能帮助用户更好地入睡？',
    ],
  },
  {
    id: 'health',
    name: '健康',
    keywords: ['身体', '生病', '不舒服', '医院', '吃药'],
    synonyms: ['身体状况', '健康问题'],
    emotion: 'anxious',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户有什么健康方面的顾虑？',
      '用户的身体状况如何？',
      '用户有什么保持健康的习惯？',
    ],
  },
]

// =====================================================
// 情绪关键词库
// =====================================================

/**
 * 情绪关键词库
 * 用于检测用户当前情绪状态
 */
export const EMOTION_KEYWORDS: Record<EmotionalState['primary'], string[]> = {
  happy: ['开心', '高兴', '兴奋', '期待', '棒', '太好了', '耶', '哈哈', '嘻嘻', '爽', '赞'],
  sad: ['难过', '伤心', '失落', '沮丧', '想哭', '心痛', '失恋', '郁闷', '不开心', '委屈'],
  anxious: ['焦虑', '紧张', '担心', '害怕', '慌', '压力', '崩溃', '着急', '不安', '恐惧'],
  frustrated: ['烦', '生气', '郁闷', '受够了', '无语', '烦死了', '气死', '恼火', '不爽', '烦躁'],
  tired: ['累', '困', '疲惫', '没力气', '不想动', '好累', '疲劳', '精疲力竭', '筋疲力尽'],
  neutral: [],
}

/**
 * 情绪强度调整词（加强）
 */
export const EMOTION_INTENSIFIERS: string[] = [
  '非常', '特别', '超级', '太', '好', '真的', '很', '极其', '无比', '相当',
]

/**
 * 情绪强度调整词（减弱）
 */
export const EMOTION_DIMINISHERS: string[] = [
  '有点', '稍微', '一点', '略微', '还好', '还行',
]

// =====================================================
// 虚拟消息配置
// =====================================================

/**
 * 虚拟消息类型优先级映射
 */
export const MESSAGE_TYPE_PRIORITY = {
  EMPATHY: 'urgent',
  DIRECTIVE: 'high',
  CONTEXT: 'normal',
  CHECKPOINT: 'low',
} as const

/**
 * 消息冷却时间（毫秒）
 */
export const MESSAGE_COOLDOWN_MS = 15000  // 15 秒

/**
 * 消息过期时间（毫秒）
 */
export const MESSAGE_EXPIRY_MS = 60000    // 60 秒

/**
 * 检查点触发间隔（毫秒）
 */
export const CHECKPOINT_INTERVAL_MS = 60000  // 60 秒

/**
 * 情绪响应触发阈值
 */
export const EMOTION_RESPONSE_THRESHOLD = 0.6
