import React from "react"

type InfoCardColor = "orange" | "green" | "gray" | "blue" | "red" | "yellow" | "purple"

interface InfoCardProps {
  title?: string
  message: React.ReactNode
  color?: InfoCardColor
  className?: string
}

const colorMap: Record<InfoCardColor, { bg: string; text: string; bar: string; border: string }> = {
  orange: {
    bg: "bg-brand-orange/10",
    text: "text-brand-orange",
    bar: "bg-brand-orange",
    border: "border-brand-border"
  },
  green: {
    bg: "bg-brand-green/10",
    text: "text-brand-green",
    bar: "bg-brand-green",
    border: "border-brand-border"
  },
  gray: {
    bg: "bg-brand-gray dark:bg-brand-border/50",
    text: "text-brand-dark dark:text-dark-heading",
    bar: "bg-brand-border dark:bg-dark-border/50",
    border: "border-brand-border dark:border-dark-border"
  },
  red: {
    bg: "bg-brand-red/10 dark:bg-brand-red-light",
    text: "text-brand-red",
    bar: "bg-brand-red",
    border: "border-brand-border"
  },
  yellow: {
    bg: "bg-brand-yellow/10",
    text: "text-brand-yellow",
    bar: "bg-brand-yellow",
    border: "border-brand-border"
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    bar: "bg-blue-600",
    border: "border-brand-border"
  },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-600",
    bar: "bg-purple-600",
    border: "border-brand-border"
  },
}

export function InfoCard({ title, message, color = "orange", className = "" }: InfoCardProps) {
  const c = colorMap[color]
  return (
    <div className={`${c.bg} ${c.border} rounded-lg px-4 py-3 flex gap-3 items-start ${className} border`}>
      <div className={`${c.bar} w-1 rounded-full self-stretch shrink-0 min-h-5`} />
      <div>
        {title && <p className={`text-sm font-bold mb-0.5 ${c.text}`}>{title}</p>}
        <p className={`text-sm ${c.text}`}>{message}</p>
      </div>
    </div>
  )
}