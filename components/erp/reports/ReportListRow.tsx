"use client"

import React from "react"
import type { ElementType } from "react"
import { motion } from "framer-motion"

export interface ReportListColumn {
  id: string
  label: string
  align: "left" | "center" | "right"
  width?: string
  minWidth?: string
  primary?: boolean
}

export interface ReportListRowData {
  id: string
  [key: string]: React.ReactNode
}

export default function ReportListRow({
  row,
  columns,
  icon: Icon,
}: {
  row: ReportListRowData
  columns: ReportListColumn[]
  icon: ElementType
}) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background"
    >
      {columns.map((column, index) => (
        <td
          key={column.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${index === 0 ? "pl-6" : ""} ${
            column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
          }`}
          style={{ width: column.width, minWidth: column.minWidth }}
        >
          <div className={`flex items-center w-full min-w-0 ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start"}`}>
            {column.primary ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                  <Icon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </div>
                <div className="flex min-w-0 flex-col text-left">
                  <span className="mb-0.5 truncate font-bold text-[13px] text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>
                  {row.detail != null && <span className="truncate text-xs font-medium text-brand-inactive-text dark:text-dark-body">{row.detail}</span>}
                </div>
              </div>
            ) : (
              <span className="text-[13px] text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>
            )}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}
