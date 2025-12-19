import React from 'react';
import type { Task } from '../../remindMe/types';
import { TaskItem } from './TaskItem';

interface TaskGroupProps {
  title: string;
  icon: string;
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
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
}) => (
    <div className="animate-fade-in-up">
        <div className="bg-brand-cream inline-block px-4 py-2 rounded-lg mb-3">
            <h3 className="font-serif text-2xl text-[#3A3A3A] italic font-bold flex items-center gap-2">
                {title} <span className="not-italic text-lg opacity-80">{icon}</span>
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
                />
            ))}
        </div>
    </div>
);
