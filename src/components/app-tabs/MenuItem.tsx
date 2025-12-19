/**
 * 菜单项按钮，支持破坏性高亮与副标题。
 *
 * @param {object} props - 组件入参
 * @param {string} props.icon - 图标类名
 * @param {string} props.label - 主标题
 * @param {string} [props.sub] - 可选副标题徽标
 * @param {boolean} [props.isDestructive=false] - 是否使用红色警示样式
 * @param {() => void} [props.onClick] - 点击回调
 */
export const MenuItem = ({ 
    icon, 
    label, 
    sub, 
    isDestructive = false,
    onClick 
}: { 
    icon: string, 
    label: string, 
    sub?: string, 
    isDestructive?: boolean,
    onClick?: () => void
}) => (
    <button 
        onClick={onClick}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group"
    >
        <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDestructive ? 'bg-red-50 text-red-500 group-hover:bg-red-100' : 'bg-brand-blue/10 text-brand-blue group-hover:bg-brand-blue/20'}`}>
                <i className={icon}></i>
            </div>
            <span className={`font-medium ${isDestructive ? 'text-red-500' : 'text-gray-700'}`}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
            {sub && <span className="text-xs text-green-500 font-medium bg-green-50 px-2 py-0.5 rounded-full">{sub}</span>}
            <i className="fa-solid fa-chevron-right text-gray-300 text-xs group-hover:text-gray-400"></i>
        </div>
    </button>
);
