数据库字段说明

为 tasks 表添加了 11 个新字段，用于支持提醒功能
删除了独立的 reminders 表
所有提醒功能现在统一使用 tasks 表
新增的字段：
字段名	类型	说明
time	VARCHAR	提醒时间 (HH:mm 格式)
display_time	VARCHAR	显示时间 (12小时制)
reminder_date	DATE	提醒日期
completed_reminder	BOOLEAN	是否完成
task_type	TEXT	任务类型 (todo/routine)
time_category	TEXT	时间分类 (morning/afternoon/evening)
called	BOOLEAN	AI 是否已打电话 ⭐
is_recurring	BOOLEAN	是否重复
recurrence_pattern	TEXT	重复模式 (daily/weekly/monthly)
recurrence_days	INTEGER[]	重复日期数组
recurrence_end_date	DATE	重复结束日期
