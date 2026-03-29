import React from "react"

type InfoCardColor = "orange" | "green" | "gray" | "blue" | "red" | "yellow"

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
    border: "border-brand-orange"
  },
  green: {
    bg: "bg-brand-green/10",
    text: "text-brand-green",
    bar: "bg-brand-green",
    border: "border-brand-green"
  },
  gray: {
    bg: "bg-brand-gray dark:bg-brand-gray/50",
    text: "text-brand-dark dark:text-dark-heading",
    bar: "bg-brand-border dark:bg-brand-gray/50",
    border: "border-brand-border/50 dark:border-dark-border/50"
  },
  red: {
    bg: "bg-brand-red/10",
    text: "text-brand-red",
    bar: "bg-brand-red",
    border: "border-brand-red"
  },
  yellow: {
    bg: "bg-brand-yellow/10",
    text: "text-brand-yellow",
    bar: "bg-brand-yellow",
    border: "border-brand-yellow"
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    bar: "bg-blue-600",
    border: "border-blue-600"
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