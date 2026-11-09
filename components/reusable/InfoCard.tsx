import React from "react"

type InfoCardColor = "orange" | "green" | "gray" | "blue" | "red" | "yellow" | "purple"

interface InfoCardProps {
  title?: string
  message: React.ReactNode
  color?: InfoCardColor
  className?: string
  rightElement?: React.ReactNode
  bottomElement?: React.ReactNode
}

const colorMap: Record<
  InfoCardColor,
  { bg: string; text: string; bar: string; border: string; linkHover: string }
> = {
  orange: {
    bg: "bg-[#fff7ed] dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-300/80",
    bar: "bg-orange-500",
    border: "border-orange-100 dark:border-orange-900/30",
    linkHover: "hover:text-orange-800 dark:hover:text-orange-400",
  },
  green: {
    bg: "bg-[#ecfdf5] dark:bg-emerald-900/20",
    text: "text-emerald-900 dark:text-emerald-100",
    bar: "bg-emerald-500",
    border: "border-emerald-100 dark:border-emerald-900/30",
    linkHover: "hover:text-emerald-800 dark:hover:text-emerald-400",
  },
  gray: {
    bg: "bg-brand-gray dark:bg-brand-border/50",
    text: "text-brand-dark dark:text-dark-heading",
    bar: "bg-brand-border dark:bg-dark-border/50",
    border: "border-gray-200 dark:border-dark-border",
    linkHover: "hover:text-brand-dark/80 dark:hover:text-dark-heading/80",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-900/10",
    text: "text-red-700 dark:text-red-300/80",
    bar: "bg-red-400",
    border: "border-red-100 dark:border-red-900/30",
    linkHover: "hover:text-red-800 dark:hover:text-red-300",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-900/10",
    text: "text-yellow-900 dark:text-yellow-300/80",
    bar: "bg-yellow-500",
    border: "border-yellow-100 dark:border-yellow-900/30",
    linkHover: "hover:text-yellow-800 dark:hover:text-yellow-300",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-300/80",
    bar: "bg-blue-500",
    border: "border-blue-100 dark:border-blue-900/30",
    linkHover: "hover:text-blue-800 dark:hover:text-blue-400",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-900/10",
    text: "text-purple-700 dark:text-purple-300/80",
    bar: "bg-purple-500",
    border: "border-purple-100 dark:border-purple-900/30",
    linkHover: "hover:text-purple-800 dark:hover:text-purple-400",
  },
}

export function InfoCard({ title, message, color = "orange", className = "", rightElement, bottomElement }: InfoCardProps) {
  const c = colorMap[color]
  return (
    <div className={`${c.bg} ${c.border} rounded-lg flex flex-row gap-3 ${className} border`}>
      <div className={`${c.bar} w-1 rounded-full self-stretch shrink-0 min-h-5`} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex-1 min-w-0">
              {title && <p className={`text-sm font-bold mb-0.5 ${c.text}`}>{title}</p>}
              <p className={`text-sm ${c.text}`}>{message}</p>
            </div>
            {rightElement && (
              <div className="shrink-0 flex items-center justify-start sm:justify-end self-start sm:self-center pl-4 sm:pl-2">
                {rightElement}
              </div>
            )}
          </div>
        </div>
        {bottomElement && (
          // The wrapper carries the card text color so any link button placed
          // here automatically inherits the title color (no per-button color
          // classNames needed). The `hover:` shade dims slightly on hover.
          // Negative margins counteract the parent's px-4 py-3 to make bottomElement
          // extend to the card edges (no horizontal/bottom padding).
          <div
            data-infocard-bottom
            className={`shrink-0 flex items-center justify-start -mx-4 -mb-3 pt-2 ${c.text} ${c.linkHover}`}
          >
            {bottomElement}
          </div>
        )}
      </div>
    </div>
  )
}