import React from 'react';
import type { Task } from '../../remindMe/types';
import { TaskItem } from './TaskItem';

interface TaskGroupProps {
  title: string;
  icon: string;
  tasks: Task[];
  onToggle: (id: string) => Promise<boolean> | boolean;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
  onSkipForDay?: (task: Task) => void;
  onUnskipForDay?: (task: Task) => void;
  /** 拍照验证回调 */
  onPhotoVerify?: (task: Task) => void;
  /** 排行榜参与状态：false 时隐藏所有验证相关 UI */
  leaderboardOptIn?: boolean;
}

/**
 * TaskGroup 组件
 * 显示一组任务（Morning/Afternoon/Evening）
 * 
 * To-do 和 Routine 任务都使用相同的 TaskItem 组件
 * 只显示今天有没有完成，不显示历史热力图
 * 历史热力图在 StatsView（绿色统计页面）中显示
 */
export const TaskGroup: React.FC<TaskGroupProps> = ({
  title,
  icon,
  tasks,
  onToggle,
  onDelete,
  onEdit,
  onSkipForDay,
  onUnskipForDay,
  onPhotoVerify,
  leaderboardOptIn = true,
}) => (
    <div className="animate-fade-in-up">
        {/* Section Label - Quicksand Bold */}
        <div className="bg-brand-cream/60 inline-block px-3 py-1.5 rounded-lg mb-3">
            <h3 className="text-[13px] text-gray-500 flex items-center gap-1.5" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700 }}>
                {title} <span className="text-[13px]">{icon}</span>
            </h3>
        </div>
        <div className="space-y-3">
      {tasks.map((task) => (
                <TaskItem
                    key={task.id}
                    task={task}
                    icon={icon}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onSkipForDay={onSkipForDay}
                    onUnskipForDay={onUnskipForDay}
                    onPhotoVerify={onPhotoVerify}
                    leaderboardOptIn={leaderboardOptIn}
                />
            ))}
        </div>
    </div>
);
