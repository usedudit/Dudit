"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Checkbox, ActionsDropdown } from "@/components/reusable"

export interface ReportListColumn {
  id: string
  label: string
  align?: "left" | "center" | "right"
  width?: string
}

interface ReportListCardProps {
  title: string
  icon?: React.ElementType
  columns: ReportListColumn[]
  data: any[]
  renderCell: (colId: string, row: any) => React.ReactNode
  onRowClick?: (row: any) => void
  emptyMessage?: string
  className?: string
}

export function ReportListCard({
  title,
  icon: Icon,
  columns,
  data,
  renderCell,
  onRowClick,
  emptyMessage = "Nenhum dado disponível.",
  className,
}: ReportListCardProps) {
  const [selection, setSelection] = useState<Set<string>>(new Set())

  const allSelected = data.length > 0 && data.every((row) => selection.has(row.id))

  const toggleAll = (checked: boolean | "indeterminate") => {
    if (checked) setSelection(new Set(data.map((row) => row.id)))
    else setSelection(new Set())
  }

  const toggleRow = (id: string) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection(next)
  }

  return (
    <div
      className={cn(
        "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
        className
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          {Icon && (
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
            </div>
          )}
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
        </div>
      </div>

      {data.length > 0 ? (
        <div className="w-full overflow-hidden rounded-xl relative">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[640px]">
              <thead>
                <tr className="bg-brand-gray dark:bg-dark-border/50">
                  <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      className="bg-white dark:bg-dark-background"
                    />
                  </th>
                  {columns.map((col, idx) => (
                    <th
                      key={col.id}
                      className={cn(
                        "py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.align !== "right" && col.align !== "center" && "text-left",
                        idx === columns.length - 1 && "rounded-r-lg"
                      )}
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      <div
                        className={cn(
                          "relative flex items-center",
                          col.align === "right" && "justify-end",
                          col.align === "center" && "justify-center",
                          col.align !== "right" && col.align !== "center" && "justify-start"
                        )}
                      >
                        {col.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    <td
                      className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selection.has(row.id)}
                        onCheckedChange={() => toggleRow(row.id)}
                      />
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          "p-2 border-b border-brand-border dark:border-dark-border",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.align !== "right" && col.align !== "center" && "text-left"
                        )}
                        style={{ width: col.width, minWidth: col.width }}
                        onClick={col.id === "actions" ? (e) => e.stopPropagation() : undefined}
                      >
                        <div
                          className={cn(
                            "flex items-center w-full min-w-0",
                            col.align === "right" && "justify-end",
                            col.align === "center" && "justify-center",
                            col.align !== "right" && col.align !== "center" && "justify-start"
                          )}
                        >
                          {col.id === "actions" ? (
                            <div className="flex justify-center action-btn">
                              <ActionsDropdown
                                onView={onRowClick ? () => onRowClick(row) : undefined}
                              />
                            </div>
                          ) : (
                            renderCell(col.id, row)
                          )}
                        </div>
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
            {emptyMessage}
          </span>
        </div>
      )}
    </div>
  )
}
