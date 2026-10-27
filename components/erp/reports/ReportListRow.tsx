"use client"

import React from "react"
import type { ElementType } from "react"
import { motion } from "framer-motion"
import { Badge, type BadgeVariant } from "@/components/reusable"

export interface ReportListColumn {
  id: string
  label: string
  align: "left" | "center" | "right"
  width?: string
  minWidth?: string
  primary?: boolean
  format?: "badge" | "currency" | "inflow" | "outflow" | "moneyByDirection"
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
  const getStatusVariant = (value: unknown): BadgeVariant => {
    const status = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ")
    if (/inativ|arquivad|encerrad|pausad/.test(status)) return "gray"
    if (/cancel|rejeit|recus|falh|bloque|vencid|inadimpl|devolvid/.test(status)) return "red"
    if (/pend|aguard|analise|atras|parcial|estoque|prepar/.test(status)) return "orange"
    if (/andamento|transito|iniciado/.test(status)) return "cyan"
    if (/pago|recebid|conclu|entregue|aprovad|ativo|confirmad|resolvid|visivel|normal/.test(status)) return "green"
    return "gray"
  }

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
                  {column.format === "badge" ? <Badge variant={getStatusVariant(row[column.id])} className="w-fit whitespace-nowrap">{row[column.id] ?? "-"}</Badge> : <span className="mb-0.5 truncate font-bold text-[13px] text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>}
                  {row.detail != null && <span className="truncate text-xs font-medium text-brand-inactive-text dark:text-dark-body">{row.detail}</span>}
                </div>
              </div>
            ) : column.format === "badge" ? (
              <Badge variant={getStatusVariant(row[column.id])} className="w-fit whitespace-nowrap">
                {row[column.id] ?? "-"}
              </Badge>
            ) : column.format === "currency" ? (
              <span className="whitespace-nowrap text-[13px] font-bold text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>
            ) : column.format === "inflow" ? (
              <span className="whitespace-nowrap text-[13px] font-bold text-brand-green">+ {row[column.id] ?? "-"}</span>
            ) : column.format === "outflow" ? (
              <span className="whitespace-nowrap text-[13px] font-bold text-brand-red">- {row[column.id] ?? "-"}</span>
            ) : column.format === "moneyByDirection" ? (
              <span className={`whitespace-nowrap text-[13px] font-bold ${row.direction === "in" ? "text-brand-green" : row.direction === "out" ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                {row.direction === "in" ? "+ " : row.direction === "out" ? "- " : ""}{row[column.id] ?? "-"}
              </span>
            ) : (
              <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{row[column.id] ?? "-"}</span>
            )}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}
