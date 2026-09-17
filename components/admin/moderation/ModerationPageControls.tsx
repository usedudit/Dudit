"use client"

import React, { useMemo } from "react"
import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    PackageIcon,
    ClockIcon,
    AlertTriangleIcon,
    ImageOffIcon,
} from "@/lib/icons"
import type { ModerationItem } from "@/lib/admin/types"

interface ModerationPageControlsProps {
    statusFilter: string
    setStatusFilter: (status: string) => void
    search: string
    onSearchChange: (value: string) => void
    items: ModerationItem[]
}

const ModerationPageControls: React.FC<ModerationPageControlsProps> = ({
    statusFilter,
    setStatusFilter,
    search,
    onSearchChange,
    items,
}) => {
    const FILTERS = [
        { value: "all", label: "Todos", icon: PackageIcon },
        { value: "pending_moderation", label: "Pendentes", icon: ClockIcon },
        { value: "flagged", label: "Flagged", icon: AlertTriangleIcon },
        { value: "needs_images", label: "Sem imagens", icon: ImageOffIcon },
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
        }
    }, [items])

    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                >
                    <TabsList className="px-0">
                        {FILTERS.map(f => (
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
            <div className="flex flex-col md:flex-row items-center gap-3 w-full px-4 md:px-8 mb-4">
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
            </div>
        </>
    )
}

export default ModerationPageControls
