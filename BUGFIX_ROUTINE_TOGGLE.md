# Routine 任务勾选 Bug 修复

## 🐛 问题描述

用户反馈：勾选 Routine 任务时，热力图的小格子没有点亮。

**具体表现：**
1. 在 HomeView（蓝色页面）勾选 Routine 任务
2. 切换到 StatsView（绿色页面）
3. 热力图中的小格子仍然是灰色（未点亮）
4. 点击查看详情弹窗，弹窗中的格子也没有点亮

---

## 🔍 根本原因

### 问题 1：HomeView 勾选不更新打卡记录

**位置**：`src/pages/AppTabsPage.tsx` - `toggleComplete` 函数

**原因**：
- `toggleComplete` 只更新了 `tasks` 表的 `completed_reminder` 字段
- 没有同时更新 `routine_completions` 表
- 导致任务虽然显示为已完成，但打卡记录没有保存

**代码问题**：
```typescript
// ❌ 旧代码 - 只更新 tasks 表
const toggleComplete = async (id: string) => {
    // ...
    await toggleReminderCompletion(id, !task.completed);
    // 缺少：没有更新 routine_completions 表
};
```

### 问题 2：StatsView 弹窗不同步更新

**位置**：`src/components/app-tabs/StatsView.tsx` - `toggleHabitToday` 函数

**原因**：
- 勾选任务后更新了 `habits` 状态
- 但没有同步更新 `selectedHabit` 状态
- 弹窗显示的是旧数据，所以格子不会点亮

**代码问题**：
```typescript
// ❌ 旧代码 - 只更新 habits，不更新 selectedHabit
const toggleHabitToday = async (id: string) => {
    setHabits(prev => prev.map(habit => {
        if (habit.id === id) {
            return { ...habit, history: { ...habit.history, [todayKey]: newStatus } };
        }
        return habit;
    }));
    // 缺少：没有更新 selectedHabit
};
```

---

## ✅ 修复方案

### 修复 1：HomeView 同时更新打卡记录

**文件**：`src/pages/AppTabsPage.tsx`

**修改内容**：

```typescript
// ✅ 新代码 - 同时更新 tasks 和 routine_completions
const toggleComplete = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || !auth.userId) return;

    const newCompletedStatus = !task.completed;

    // Optimistically update UI
    setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, completed: newCompletedStatus } : t
    ));

    try {
        // 1. Update in tasks table
        await toggleReminderCompletion(id, newCompletedStatus);

        // 2. If it's a Routine task, also update routine_completions table
        if (task.type === 'routine') {
            const today = new Date().toISOString().split('T')[0];
            await toggleRoutineCompletion(auth.userId, id, today);
        }
    } catch (error) {
        console.error('Failed to toggle reminder completion:', error);
        // Revert on error
        setTasks(prev => prev.map(t =>
            t.id === id ? { ...t, completed: !newCompletedStatus } : t
        ));
    }
};
```

**修复内容：**
1. ✅ 检查任务类型
2. ✅ 如果是 Routine 任务，同时调用 `toggleRoutineCompletion`
3. ✅ 保持数据一致性：`tasks` 表和 `routine_completions` 表都更新

---

### 修复 2：StatsView 弹窗同步更新

**文件**：`src/components/app-tabs/StatsView.tsx`

**修改内容**：

```typescript
// ✅ 新代码 - 同时更新 habits 和 selectedHabit
const toggleHabitToday = async (id: string) => {
    if (!auth.userId) return;

    const todayKey = formatDateKey(new Date());

    try {
        const newStatus = await toggleRoutineCompletion(auth.userId, id, todayKey);

        // Update habits state
        setHabits(prev => prev.map(habit => {
            if (habit.id === id) {
                const updatedHabit = {
                    ...habit,
                    history: { ...habit.history, [todayKey]: newStatus }
                };
                
                // 如果这个任务正在详情弹窗中显示，同步更新弹窗数据
                if (selectedHabit?.id === id) {
                    setSelectedHabit(updatedHabit);
                }
                
                return updatedHabit;
            }
            return habit;
        }));

        // Recalculate streak...
    } catch (error) {
        console.error('Failed to toggle habit:', error);
    }
};
```

**修复内容：**
1. ✅ 更新 `habits` 状态
2. ✅ 检查是否有弹窗打开
3. ✅ 如果弹窗显示的是当前任务，同步更新 `selectedHabit`
4. ✅ 弹窗中的热力图会实时更新

---

## 🔄 数据流

### 修复后的完整流程

#### HomeView（蓝色页面）勾选

```
用户勾选 Routine 任务
  ↓
AppTabsPage.toggleComplete(id)
  ↓
1. 更新 tasks.completed_reminder (tasks 表)
  ↓
2. 调用 toggleRoutineCompletion() (routine_completions 表)
  ↓
3. 本地状态更新
  ↓
✅ UI 刷新：勾选框被勾选
✅ 数据库同步：打卡记录已保存
```

#### StatsView（绿色页面）勾选

```
用户勾选任务
  ↓
StatsView.toggleHabitToday(id)
  ↓
1. 调用 toggleRoutineCompletion() (routine_completions 表)
  ↓
2. 更新 habits 状态
  ↓
3. 检查是否有弹窗打开
  ↓
4. 如果有，同步更新 selectedHabit 状态
  ↓
✅ UI 刷新：
   - 勾选框被勾选
   - 卡片中的热力图更新
   - 弹窗中的热力图更新
```

---

## 🧪 测试步骤

### 测试 1：HomeView 勾选

1. 在 HomeView（蓝色页面）创建一个 Routine 任务
2. 勾选这个任务
3. 切换到 StatsView（绿色页面）
4. **预期结果**：热力图中今天的格子被点亮 ✅

### 测试 2：StatsView 卡片勾选

1. 在 StatsView（绿色页面）找到一个 Routine 任务
2. 勾选任务卡片上的勾选框
3. **预期结果**：
   - 勾选框被勾选 ✅
   - 卡片中的小热力图今天的格子被点亮 ✅

### 测试 3：StatsView 弹窗勾选

1. 在 StatsView（绿色页面）点击任务卡片
2. 打开详细热力图弹窗
3. 返回卡片，勾选任务
4. 再次打开弹窗
5. **预期结果**：弹窗中的热力图今天的格子被点亮 ✅

---

## 📊 影响范围

### 修改的文件

- ✅ `src/pages/AppTabsPage.tsx`
- ✅ `src/components/app-tabs/StatsView.tsx`

### 涉及的表

- `tasks` 表：存储任务基本信息
  - `completed_reminder` 字段：任务是否完成
- `routine_completions` 表：存储 Routine 任务的每日打卡记录
  - `completion_date` 字段：完成日期

### 数据一致性

现在两个表会保持同步：
- 勾选任务 → 同时更新两个表
- 取消勾选 → 同时删除打卡记录

---

## 🎉 修复结果

### 修复前

❌ 勾选任务，格子不点亮  
❌ 数据不一致  
❌ 用户体验差

### 修复后

✅ 勾选任务，格子立即点亮  
✅ 数据实时同步  
✅ 卡片和弹窗都正确更新  
✅ 用户体验良好

---

## 📝 代码质量

- ✅ 无 linter 错误
- ✅ 类型安全
- ✅ 错误处理完善
- ✅ 添加了详细注释

---

**修复完成日期**：2025年11月26日  
**Bug 等级**：高（影响核心功能）  
**修复状态**：✅ 已完成并测试

