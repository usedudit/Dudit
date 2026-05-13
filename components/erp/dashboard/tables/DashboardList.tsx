import type { DashboardListItem } from "@/lib/data/dashboard"
import { Badge } from "@/components/reusable"
import { cn } from "@/lib/utils"

const badgeVariant = (tone?: DashboardListItem["tone"]) => {
  if (tone === "green") return "green"
  if (tone === "red") return "red"
  if (tone === "orange") return "orange"
  if (tone === "blue") return "blue"
  return "gray"
}

export function DashboardList({ items, empty = "Sem registros." }: { items: DashboardListItem[]; empty?: string }) {
  if (!items.length) {
    return <div className="p-6 text-sm font-medium text-brand-inactive-text dark:text-dark-body">{empty}</div>
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-left">
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group bg-white transition-colors hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-dark-border/10">
              <td className="border-b border-brand-border p-3 pl-5 last:border-0 dark:border-dark-border">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-brand-dark dark:text-dark-heading">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-brand-inactive-text dark:text-dark-body">{item.subtitle || item.meta || "-"}</p>
                </div>
              </td>
              <td className="hidden border-b border-brand-border p-3 dark:border-dark-border sm:table-cell">
                {item.meta ? <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body">{item.meta}</span> : null}
              </td>
              <td className="border-b border-brand-border p-3 pr-5 text-right dark:border-dark-border">
                {item.value ? (
                  <span className={cn("text-[13px] font-bold tabular-nums", item.tone === "green" && "text-brand-green", item.tone === "red" && "text-brand-red")}>{item.value}</span>
                ) : (
                  <Badge variant={badgeVariant(item.tone)} className="text-[10px]">{item.tone || "info"}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
