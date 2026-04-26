import React from "react"

interface TooltipProps {
  text: React.ReactNode
  children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => (
  <div className="relative group/tooltip flex items-center justify-center">
    {children}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[240px] xs:max-w-xs p-2 bg-dark-surface dark:bg-white text-white text-xs text-center rounded-lg shadow-xl opacity-0 scale-95 origin-bottom group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 transition-all duration-300 pointer-events-none z-[100]">
      {text}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-dark-surface dark:border-t-white"></div>
    </div>
  </div>
)
