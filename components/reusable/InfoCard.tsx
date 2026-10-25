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

const colorMap: Record<InfoCardColor, { bg: string; text: string; bar: string; border: string }> = {
  orange: {
    bg: "bg-[#fff7ed] dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-300/80",
    bar: "bg-orange-500",
    border: "border-orange-100 dark:border-orange-900/30"
  },
  green: {
    bg: "bg-[#ecfdf5] dark:bg-emerald-900/20",
    text: "text-emerald-900 dark:text-emerald-100",
    bar: "bg-emerald-500",
    border: "border-emerald-100 dark:border-emerald-900/30"
  },
  gray: {
    bg: "bg-brand-gray dark:bg-brand-border/50",
    text: "text-brand-dark dark:text-dark-heading",
    bar: "bg-brand-border dark:bg-dark-border/50",
    border: "border-gray-200 dark:border-dark-border"
  },
  red: {
    bg: "bg-red-50 dark:bg-red-900/10",
    text: "text-red-700 dark:text-red-300/80",
    bar: "bg-red-400",
    border: "border-red-100 dark:border-red-900/30"
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-900/10",
    text: "text-yellow-900 dark:text-yellow-300/80",
    bar: "bg-yellow-500",
    border: "border-yellow-100 dark:border-yellow-900/30"
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-300/80",
    bar: "bg-blue-500",
    border: "border-blue-100 dark:border-blue-900/30"
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-900/10",
    text: "text-purple-700 dark:text-purple-300/80",
    bar: "bg-purple-500",
    border: "border-purple-100 dark:border-purple-900/30"
  },
}

export function InfoCard({ title, message, color = "orange", className = "", rightElement, bottomElement }: InfoCardProps) {
  const c = colorMap[color]
  return (
    <div className={`${c.bg} ${c.border} rounded-lg px-4 py-3 flex flex-col gap-3 ${className} border`}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-3 items-start flex-1">
          <div className={`${c.bar} w-1 rounded-full self-stretch shrink-0 min-h-5`} />
          <div className="flex-1">
            {title && <p className={`text-sm font-bold mb-0.5 ${c.text}`}>{title}</p>}
            <p className={`text-sm ${c.text}`}>{message}</p>
          </div>
        </div>
        {rightElement && (
          <div className="shrink-0 flex items-center justify-start sm:justify-end self-start sm:self-center pl-4 sm:pl-2">
            {rightElement}
          </div>
        )}
      </div>
      {bottomElement && (
        <div className="shrink-0 flex items-center justify-start">
          {bottomElement}
        </div>
      )}
    </div>
  )
}