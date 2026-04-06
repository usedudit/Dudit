"use client"

import type React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"

// ─── Settings Card (home screen) ─────────────────────────────────────────────

export const SettingsCard = ({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: any
  title: string
  description: string
  onClick?: () => void
}) => (
  <div
    onClick={onClick}
    className="group flex items-center gap-4 p-5 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-dark/90 transition-all cursor-pointer h-full"
  >
    <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
      <Icon size={20} className="text-brand-dark dark:text-dark-heading" />
    </div>
    <div className="flex-1">
      <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1">{title}</h3>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-tight">{description}</p>
    </div>
    <ChevronRightIcon
      size={18}
      className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors"
    />
  </div>
)