import { cn } from "@/lib/utils"

type TabCountBadgeVariant = "gray" | "green" | "yellow" | "red" | "blue" | "orange"

interface TabCountBadgeProps {
  count?: number
  value?: string
  variant?: TabCountBadgeVariant
}

const variantStyles: Record<TabCountBadgeVariant, string> = {
  gray: "bg-gray-100 text-gray-500 dark:bg-dark-border dark:text-dark-body",
  green: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  yellow: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400",
  blue: "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400",
  orange: "bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400",
}

export function TabCountBadge({ count, value, variant = "gray" }: TabCountBadgeProps) {
  return (
    <span
      className={cn(
        "ml-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full leading-none",
        variantStyles[variant]
      )}
    >
      {value ?? count}
    </span>
  )
}
