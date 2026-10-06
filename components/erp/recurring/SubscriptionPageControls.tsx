"use client"

import React from "react"
import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
  SearchIcon,
  GridIcon,
  ListIcon,
  Users,
  CheckCircleIcon,
  CancelCircleIcon,
  BlockedIcon,
  ClockIcon,
  AlertTriangleIcon
} from "@/lib/icons"
import type { RecurringSubscriptionStatusFilter } from "@/lib/types/recurring"

interface SubscriptionPageControlsProps {
  statusFilter: RecurringSubscriptionStatusFilter
  setStatusFilter: (status: RecurringSubscriptionStatusFilter) => void
  search: string
  onSearchChange: (value: string) => void
  viewMode: "list" | "grid"
  onViewModeChange: (mode: "list" | "grid") => void
  tabCounts?: {
    all: number
    active: number
    paused: number
    pending: number
    delinquent: number
    awaiting_restock: number
    cancelled: number
  }
}

export const SubscriptionPageControls: React.FC<SubscriptionPageControlsProps> = ({
  statusFilter,
  setStatusFilter,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  tabCounts
}) => {
  return (
    <>
      {/* Tabs */}
      <div className="mb-6">
        <Tabs value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
          <TabsList className="px-0">
            <TabsTrigger value="all" icon={Users} badge={tabCounts && <TabCountBadge count={tabCounts.all} variant="gray" />}>
              Todas
            </TabsTrigger>
            <TabsTrigger value="active" icon={CheckCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="green" />}>
              Ativas
            </TabsTrigger>
            <TabsTrigger value="paused" icon={CancelCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.paused} variant="yellow" />}>
              Pausadas
            </TabsTrigger>
            <TabsTrigger value="pending" icon={ClockIcon} badge={tabCounts && <TabCountBadge count={tabCounts.pending} variant="blue" />}>
              Aguardando Cobrança
            </TabsTrigger>
            <TabsTrigger value="delinquent" icon={AlertTriangleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.delinquent} variant="red" />}>
              Com Pendência
            </TabsTrigger>
            <TabsTrigger value="awaiting_restock" icon={BlockedIcon} badge={tabCounts && <TabCountBadge count={tabCounts.awaiting_restock} variant="orange" />}>
              Sem Estoque
            </TabsTrigger>
            <TabsTrigger value="cancelled" icon={BlockedIcon} badge={tabCounts && <TabCountBadge count={tabCounts.cancelled} variant="red" />}>
              Canceladas
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none">
        {/* Mobile Controls */}
        <div className="md:hidden flex items-center gap-2 w-full">
          <div className="flex-1 min-w-0">
            <Input
              name="search"
              placeholder="Buscar por notas..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-[42px] w-full"
              variant="full-rounded"
              prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
            />
          </div>
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center w-full gap-4">
          <div className="w-80">
            <Input
              name="search"
              placeholder="Buscar assinaturas..."
              prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-[42px]"
              variant="full-rounded"
            />
          </div>

          <div className="flex-1" />

          {/* View Toggles */}
          <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
            <button
              onClick={() => onViewModeChange("list")}
              className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
            >
              <ListIcon className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
            >
              <GridIcon className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default SubscriptionPageControls
