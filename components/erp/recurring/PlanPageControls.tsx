"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
  SearchIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  Users,
  CheckCircleIcon,
  CancelCircleIcon,
  BlockedIcon,
  ArchiveIcon
} from "@/lib/icons"

interface PlanPageControlsProps {
  activeTab: "Todos" | "Ativo" | "Inativo" | "Arquivado"
  setActiveTab: (tab: "Todos" | "Ativo" | "Inativo" | "Arquivado") => void
  search: string
  onSearchChange: (value: string) => void
  onAddPlan: () => void
  viewMode: "list" | "grid"
  onViewModeChange: (mode: "list" | "grid") => void
  canManage: boolean
  tabCounts?: { Todos: number; Ativo: number; Inativo: number; Arquivado: number }
}

export const PlanPageControls: React.FC<PlanPageControlsProps> = ({
  activeTab,
  setActiveTab,
  search,
  onSearchChange,
  onAddPlan,
  viewMode,
  onViewModeChange,
  canManage,
  tabCounts
}) => {
  return (
    <>
      {/* Tabs */}
      <div className="mb-6 px-4 md:px-8">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
          <TabsList className="px-0">
            <TabsTrigger value="Todos" icon={Users} badge={tabCounts && <TabCountBadge count={tabCounts.Todos} variant="gray" />}>
              Todos
            </TabsTrigger>
            <TabsTrigger value="Ativo" icon={CheckCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Ativo} variant="green" />}>
              Ativos
            </TabsTrigger>
            <TabsTrigger value="Inativo" icon={CancelCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Inativo} variant="gray" />}>
              Inativos
            </TabsTrigger>
            <TabsTrigger value="Arquivado" icon={ArchiveIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Arquivado} variant="orange" />}>
              Arquivados
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
        {/* Mobile Controls */}
        <div className="md:hidden flex items-center gap-2 w-full">
          <div className="flex-1 min-w-0">
            <Input
              name="search"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-[42px] w-full"
              variant="full-rounded"
              prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
            />
          </div>
          {canManage && (
            <Button
              onClick={onAddPlan}
              className="w-[42px] h-[42px] p-0 flex items-center justify-center"
              leftIcon={<PlusIcon size={18} />}
            />
          )}
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center w-full gap-4">
          <div className="w-80">
            <Input
              name="search"
              placeholder="Buscar planos..."
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

export default PlanPageControls
