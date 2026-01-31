import React from 'react';

interface SecondaryPageHeaderProps {
  title: string;
  onBack: () => void;
}

/**
 * 二级页面通用 Header 组件
 * 包含返回按钮和居中标题，适配 iPhone 安全区域
 * 使用 sticky 定位确保在二级页面内固定在顶部
 */
export const SecondaryPageHeader: React.FC<SecondaryPageHeaderProps> = ({ title, onBack }) => {
  return (
    <div className="sticky top-0 bg-white shadow-sm px-4 pt-[59px] pb-4 flex items-center z-[300]">
      <button
        onClick={onBack}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
      >
        <i className="fa-solid fa-arrow-left text-gray-600"></i>
      </button>
      <h2 className="flex-1 text-center font-bold text-lg text-gray-800 mr-10">
        {title}
      </h2>
    </div>
  );
};
