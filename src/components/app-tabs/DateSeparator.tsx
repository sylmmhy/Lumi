import React from 'react';

interface DateSeparatorProps {
  date: string; // Format: "Aug 11/2025" or similar
}

/**
 * DateSeparator component - displays a date divider line with centered date label
 * Matching the Figma design at node 1151-1333
 */
export const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  return (
    <div className="relative flex items-center justify-center py-4">
      {/* Horizontal line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

      {/* Date label in the center */}
      <div className="relative bg-neutral-100 px-2 py-1 rounded-[3px]">
        <span
          className="text-[#413f2b] text-[10px] font-bold italic leading-tight whitespace-nowrap"
          style={{ fontFamily: "'Sansita', sans-serif" }}
        >
          {date}
        </span>
      </div>
    </div>
  );
};
