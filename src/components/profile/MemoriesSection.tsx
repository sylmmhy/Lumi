import { useState, useEffect, useContext, useCallback } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { AuthContext } from '../../context/AuthContextDefinition';
import { supabase } from '../../lib/supabase';

interface Memory {
  id: string;
  content: string;
  tag: 'PREF' | 'PROC' | 'SOMA' | 'EMO' | 'SAB';
  confidence: number;
  task_name: string | null;
  created_at: string;
}

const TAG_CONFIG: Record<string, { label: string; labelZh: string; icon: string; bgColor: string; textColor: string }> = {
  'PREF': {
    label: 'AI Preference',
    labelZh: 'AI 偏好',
    icon: 'fa-sliders',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-500'
  },
  'PROC': {
    label: 'Procrastination',
    labelZh: '拖延模式',
    icon: 'fa-hourglass-half',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-500'
  },
  'SOMA': {
    label: 'Body Response',
    labelZh: '身心反应',
    icon: 'fa-heart-pulse',
    bgColor: 'bg-red-50',
    textColor: 'text-red-500'
  },
  'EMO': {
    label: 'Emotional',
    labelZh: '情绪模式',
    icon: 'fa-face-smile',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-500'
  },
  'SAB': {
    label: 'Self-Sabotage',
    labelZh: '自我妨碍',
    icon: 'fa-ban',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500'
  },
};

/**
 * MemoriesSection - Display and manage user memories in profile
 * Collapsible design - shows as a single row, expands to show memory list
 */
export function MemoriesSection() {
  const { t, uiLanguage } = useTranslation();
  const auth = useContext(AuthContext);
  const [isExpanded, setIsExpanded] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isZh = uiLanguage?.startsWith('zh');

  // Fetch user memories
  const fetchMemories = useCallback(async () => {
    if (!auth?.userId || !supabase) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMemories(data || []);
    } catch (error) {
      console.error('Error fetching memories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [auth?.userId]);

  // Load memories when expanded
  useEffect(() => {
    if (isExpanded && memories.length === 0) {
      fetchMemories();
    }
  }, [isExpanded, fetchMemories, memories.length]);

  // Delete a memory
  const handleDelete = async (memoryId: string) => {
    if (!supabase) return;

    setDeletingId(memoryId);
    try {
      const { error } = await supabase
        .from('user_memories')
        .delete()
        .eq('id', memoryId);

      if (error) throw error;
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (error) {
      console.error('Error deleting memory:', error);
      alert(isZh ? '删除失败，请重试' : 'Failed to delete. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Group memories by tag
  const groupedMemories = memories.reduce((acc, memory) => {
    const tag = memory.tag;
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(memory);
    return acc;
  }, {} as Record<string, Memory[]>);

  // Count by type
  const prefCount = groupedMemories['PREF']?.length || 0;
  const otherCount = memories.length - prefCount;

  if (!auth?.isLoggedIn) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Main Row - Clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-brain text-indigo-500"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">
              {isZh ? 'AI 记忆' : 'AI Memories'}
            </p>
            <p className="text-xs text-gray-400">
              {isZh ? 'Lumi 了解的关于你的信息' : 'What Lumi knows about you'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
          ) : (
            <span className="text-xs text-gray-500">
              {memories.length > 0 ? (
                isZh ? `${memories.length} 条记忆` : `${memories.length} memories`
              ) : (
                isZh ? '暂无记忆' : 'No memories'
              )}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 flex items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-gray-400 text-xl"></i>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && memories.length === 0 && (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fa-solid fa-brain text-gray-400"></i>
            </div>
            <p className="text-sm text-gray-500">
              {isZh
                ? 'Lumi 还没有记住关于你的信息。和 Lumi 多聊聊，它会逐渐了解你！'
                : "Lumi hasn't learned anything about you yet. Chat more with Lumi and it will remember!"}
            </p>
          </div>
        )}

        {/* Memory List by Tag */}
        {!isLoading && memories.length > 0 && (
          <div className="max-h-[500px] overflow-y-auto">
            {/* PREF memories first (AI preferences - always loaded) */}
            {groupedMemories['PREF'] && groupedMemories['PREF'].length > 0 && (
              <div className="border-b border-gray-100">
                <div className="px-4 py-2 bg-purple-50 flex items-center gap-2">
                  <i className={`fa-solid ${TAG_CONFIG['PREF'].icon} ${TAG_CONFIG['PREF'].textColor} text-xs`}></i>
                  <span className="text-xs font-medium text-purple-700">
                    {isZh ? TAG_CONFIG['PREF'].labelZh : TAG_CONFIG['PREF'].label}
                    <span className="text-purple-400 ml-1">({groupedMemories['PREF'].length})</span>
                  </span>
                  <span className="text-xs text-purple-400 ml-auto">
                    {isZh ? '通用 - 始终加载' : 'Universal - Always loaded'}
                  </span>
                </div>
                {groupedMemories['PREF'].map(memory => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    onDelete={handleDelete}
                    isDeleting={deletingId === memory.id}
                    isZh={isZh}
                  />
                ))}
              </div>
            )}

            {/* Other memories by tag */}
            {(['EMO', 'PROC', 'SOMA', 'SAB'] as const).map(tag => {
              const tagMemories = groupedMemories[tag];
              if (!tagMemories || tagMemories.length === 0) return null;

              const config = TAG_CONFIG[tag];
              return (
                <div key={tag} className="border-b border-gray-100 last:border-b-0">
                  <div className={`px-4 py-2 ${config.bgColor} flex items-center gap-2`}>
                    <i className={`fa-solid ${config.icon} ${config.textColor} text-xs`}></i>
                    <span className={`text-xs font-medium ${config.textColor.replace('text-', 'text-').replace('500', '700')}`}>
                      {isZh ? config.labelZh : config.label}
                      <span className="opacity-60 ml-1">({tagMemories.length})</span>
                    </span>
                  </div>
                  {tagMemories.map(memory => (
                    <MemoryItem
                      key={memory.id}
                      memory={memory}
                      onDelete={handleDelete}
                      isDeleting={deletingId === memory.id}
                      isZh={isZh}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Info Footer */}
        {!isLoading && memories.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-circle-info text-gray-400 mt-0.5 text-xs"></i>
              <p className="text-xs text-gray-500">
                {isZh
                  ? '这些记忆帮助 Lumi 更好地理解你。你可以删除任何不想让 Lumi 记住的内容。'
                  : 'These memories help Lumi understand you better. You can delete anything you don\'t want Lumi to remember.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Single memory item component
 */
function MemoryItem({
  memory,
  onDelete,
  isDeleting,
  isZh
}: {
  memory: Memory;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  isZh: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = () => {
    if (showConfirm) {
      onDelete(memory.id);
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      // Auto-hide confirm after 3 seconds
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">
            {memory.content}
          </p>
          {memory.task_name && (
            <p className="text-xs text-gray-400 mt-1">
              <i className="fa-solid fa-tag mr-1"></i>
              {memory.task_name}
            </p>
          )}
        </div>
        <button
          onClick={handleDeleteClick}
          disabled={isDeleting}
          className={`flex-none p-1.5 rounded-lg transition-all ${
            showConfirm
              ? 'bg-red-100 text-red-600'
              : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50'
          }`}
        >
          {isDeleting ? (
            <i className="fa-solid fa-spinner fa-spin text-xs"></i>
          ) : showConfirm ? (
            <span className="text-xs font-medium px-1">
              {isZh ? '确认?' : 'Sure?'}
            </span>
          ) : (
            <i className="fa-solid fa-trash text-xs"></i>
          )}
        </button>
      </div>
    </div>
  );
}
