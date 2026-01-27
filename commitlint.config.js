/**
 * Commitlint 配置
 * 强制执行 Conventional Commits 规范
 *
 * 格式：<type>: <描述>
 * 例如：feat: 添加任务提醒功能
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 允许中文 commit message
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
