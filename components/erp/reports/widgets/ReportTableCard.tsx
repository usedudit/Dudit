"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable"
import { useRouter } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"

export interface TableColumn {
  key: string
  header: string
  render?: (value: any, row: any) => React.ReactNode
  className?: string
  align?: "left" | "right" | "center"
}

export interface TableRow {
  id: string
  [key: string]: any
}

interface ReportTableCardProps {
  title?: string
  columns: TableColumn[]
  data: TableRow[]
  emptyMessage?: React.ReactNode
  pageSize?: number
  detailHref?: string
  detailLabel?: string
  onRowClick?: (row: TableRow) => void
  className?: string
  icon?: React.ElementType
}

export function ReportTableCard({
  title,
  columns,
  data,
  emptyMessage = "Nenhum dado disponível.",
  pageSize = 6,
  detailHref,
  detailLabel = "Ver Detalhes",
  onRowClick,
  className,
  icon: Icon
}: ReportTableCardProps) {
  const router = useRouter()
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(data.length / pageSize)
  const rows = data.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div>
      {(title || data.length > 0) && (
        <div className={cn("flex items-center", title ? "justify-between mb-6" : "justify-end mb-4")}>
          {title &&
            (Icon ? (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                  <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                </div>
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
              </div>
            ) : (
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
            ))}
          {data.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">
                {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.length)} de {data.length}
              </span>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap min-w-[400px]">
              <thead>
                <tr className="border-b border-brand-border dark:border-dark-border">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "pb-3 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className
                      )}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-brand-border dark:border-dark-border last:border-b-0 h-[60px]",
                      onRowClick && "cursor-pointer hover:bg-brand-green-light/30 dark:hover:bg-dark-border/20 transition-colors"
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "text-[14px] text-brand-dark dark:text-dark-heading",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.className
                        )}
                      >
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {totalPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    <ChevronLeftIcon size={16} />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={cn(
                        "h-8 w-8 rounded-full text-[13px] font-bold transition-colors",
                        i === page
                          ? "bg-brand-green text-white"
                          : "text-brand-inactive-text hover:bg-brand-green-light dark:hover:bg-dark-border/40"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  >
                    <ChevronRightIcon size={16} />
                  </Button>
                </>
              )}
            </div>
            {detailHref && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(detailHref)}
              >
                {detailLabel}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          {typeof emptyMessage === "string" ? (
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{emptyMessage}</span>
          ) : (
            emptyMessage
          )}
        </div>
      )}
    </div>
  )
}
