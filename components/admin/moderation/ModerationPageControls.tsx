"use client"

import React, { useMemo } from "react"
import { Input, Tabs, TabsList, TabsTrigger, Button } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    PackageIcon,
    ClockIcon,
    AlertTriangleIcon,
    ImageOffIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    ListIcon,
    GridIcon,
    FilterIcon,
} from "@/lib/icons"
import type { ModerationItem } from "@/lib/admin/types"

interface ModerationPageControlsProps {
    statusFilter: string
    setStatusFilter: (status: string) => void
    typeFilter: string
    setTypeFilter: (type: string) => void
    search: string
    onSearchChange: (value: string) => void
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    items: ModerationItem[]
}

const TYPE_OPTIONS = [
    { value: "all", label: "Todos os tipos" },
    { value: "product", label: "Produtos" },
    { value: "service", label: "Serviços" },
    { value: "recurring_plan", label: "Planos" },
    { value: "partner", label: "Perfis" },
    { value: "community_video", label: "Vídeos" },
]

export const ModerationPageControls: React.FC<ModerationPageControlsProps> = ({
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    search,
    onSearchChange,
    viewMode,
    onViewModeChange,
    items,
}) => {
    const STATUS_TABS = [
        { value: "all", label: "Todos", icon: PackageIcon },
        { value: "pending_moderation", label: "Pendentes", icon: ClockIcon },
        { value: "flagged", label: "Flagged", icon: AlertTriangleIcon },
        { value: "needs_images", label: "Sem imagens", icon: ImageOffIcon },
        { value: "approved", label: "Aprovados", icon: CheckCircleIcon },
        { value: "rejected", label: "Rejeitados", icon: CancelCircleIcon },
    ] as const

    const tabCounts = useMemo(() => {
        const counts: Record<string, number> = { all: items.length }
        for (const item of items) {
            counts[item.moderation_status] = (counts[item.moderation_status] || 0) + 1
        }
        return {
            all: items.length,
            pending_moderation: counts.pending_moderation || 0,
            flagged: counts.flagged || 0,
            needs_images: counts.needs_images || 0,
            approved: counts.approved || 0,
            rejected: counts.rejected || 0,
        }
    }, [items])

    const currentTypeLabel = TYPE_OPTIONS.find((t) => t.value === typeFilter)?.label || "Todos os tipos"

    return (
        <>
            {/* --- TABS DE STATUS --- */}
            <div className="mb-4 px-4 md:px-8">
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                    <TabsList className="px-0">
                        {STATUS_TABS.map((f) => (
                            <TabsTrigger
                                key={f.value}
                                value={f.value}
                                icon={f.icon}
                                badge={<TabCountBadge count={tabCounts[f.value as keyof typeof tabCounts] || 0} />}
                            >
                                {f.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 w-full px-4 md:px-8 mb-4">
                <div className="flex items-center gap-2.5 w-full md:w-auto flex-1">
                    {/* Search */}
                    <div className="w-full md:w-80">
                        <Input
                            name="search"
                            placeholder="Buscar por título, loja ou ID..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px]"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>

                    {/* Filtro de Tipo */}
                    <Dropdown
                        trigger={
                            <Button
                                variant="outline"
                                className="h-[42px] px-3 gap-2 shrink-0"
                                leftIcon={<FilterIcon size={16} />}
                            >
                                <span className="hidden sm:inline">{currentTypeLabel}</span>
                                <span className="sm:hidden">Tipo</span>
                            </Button>
                        }
                        align="left"
                        showChevron={false}
                        className="w-fit"
                    >
                        {TYPE_OPTIONS.map((opt) => (
                            <DropdownItem
                                key={opt.value}
                                onClick={() => setTypeFilter(opt.value)}
                                className={typeFilter === opt.value ? "font-bold text-brand-green" : ""}
                            >
                                {typeFilter === opt.value && (
                                    <CheckCircleIcon size={14} className="mr-2 text-brand-green" />
                                )}
                                {opt.label}
                            </DropdownItem>
                        ))}
                    </Dropdown>
                </div>

                {/* View Toggles (List vs Grid) */}
                <div className="hidden md:flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        type="button"
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                            viewMode === "list"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em Lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                            viewMode === "grid"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em Grade"
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </>
    )
}

export default ModerationPageControls
