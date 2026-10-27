"use client"

import React from "react"

export interface ReportListColumn {
  id: string
  label: string
  align: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

export interface ReportListRowData {
  id: string
  [key: string]: React.ReactNode
}

export default function ReportListRow({
  row,
  columns,
}: {
  row: ReportListRowData
  columns: ReportListColumn[]
}) {
  return (
    <tr className="group transition-colors bg-white dark:bg-dark-background">
      {columns.map((column) => (
        <td
          key={column.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${
            column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
          }`}
          style={{ width: column.width, minWidth: column.minWidth }}
        >
          <div className={`flex items-center w-full min-w-0 ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start"}`}>
            <span className="text-[13px] text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>
          </div>
        </td>
      ))}
    </tr>
  )
}
