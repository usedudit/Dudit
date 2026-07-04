"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable"
import { useRouter } from "next/navigation"

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
  title: string
  columns: TableColumn[]
  data: TableRow[]
  emptyMessage?: string
  maxRows?: number
  detailHref?: string
  detailLabel?: string
  className?: string
}

export function ReportTableCard({
  title,
  columns,
  data,
  emptyMessage = "Nenhum dado disponível.",
  maxRows = 6,
  detailHref,
  detailLabel = "Ver Detalhes",
  className,
}: ReportTableCardProps) {
  const router = useRouter()
  const rows = data.slice(0, maxRows)

  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
      className
    )}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
        {data.length === 0 && (
          <span className="text-sm font-medium text-brand-inactive-text">{emptyMessage}</span>
        )}
      </div>

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
                        "pb-3 text-[13px] font-semibold text-brand-inactive-text",
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
                    className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[60px]"
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

          {detailHref && rows.length >= maxRows && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(detailHref)}
              >
                {detailLabel}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{emptyMessage}</span>
        </div>
      )}
    </div>
  )
}
