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
    className="group flex items-center gap-4 p-5 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-dark-border/90 transition-all cursor-pointer h-full"
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

// ─── Sub-page header ──────────────────────────────────────────────────────────

export const SubPageHeader = ({
  title,
  description,
  onBack,
}: {
  title: string
  description: string
  onBack: () => void
}) => (
  <div className="flex items-center gap-4 mb-8">
    <button
      type="button"
      onClick={onBack}
      className="h-10 w-10 p-0 rounded-full border border-brand-border dark:border-dark-border flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border/60 transition-colors flex-shrink-0"
    >
      <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
    </button>
    <div>
      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-tight">{title}</h2>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body">{description}</p>
    </div>
  </div>
)
