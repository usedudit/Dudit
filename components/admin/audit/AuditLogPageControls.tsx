"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger, Input } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    ShieldIcon,
    UserIcon,
    StoreIcon,
    PackageIcon,
    FilterIcon,
    SearchIcon,
    SettingsIcon
} from "@/lib/icons"
import type { AuditLogStats } from "@/app/actions/admin/audit-logs"

interface AuditLogPageControlsProps {
    activeTab: string
    setActiveTab: (val: string) => void
    search: string
    onSearchChange: (val: string) => void
    onOpenFilter: () => void
    hasActiveFilters: boolean
    hasData: boolean
    stats?: AuditLogStats
}

const AuditLogPageControls = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    hasActiveFilters,
    hasData,
    stats,
}: AuditLogPageControlsProps) => {
    return (
        <div className="flex flex-col gap-4 px-4 md:px-8 mb-6">
            {/* Desktop and Mobile Tabs */}
            <div className="w-full overflow-x-auto hide-scrollbar">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0 w-max min-w-full">
                        <TabsTrigger
                            value="all"
                            icon={ShieldIcon}
                            badge={stats && <TabCountBadge count={stats.total} variant="gray" />}
                        >
                            Todos
                        </TabsTrigger>
                        <TabsTrigger
                            value="user"
                            icon={UserIcon}
                            badge={stats && <TabCountBadge count={stats.user} variant="blue" />}
                        >
                            Usuário
                        </TabsTrigger>
                        <TabsTrigger
                            value="partner"
                            icon={StoreIcon}
                            badge={stats && <TabCountBadge count={stats.partner} variant="green" />}
                        >
                            Parceiro
                        </TabsTrigger>
                        <TabsTrigger
                            value="product"
                            icon={PackageIcon}
                            badge={stats && <TabCountBadge count={stats.product} variant="yellow" />}
                        >
                            Produto
                        </TabsTrigger>
                        <TabsTrigger
                            value="system"
                            icon={SettingsIcon}
                            badge={stats && <TabCountBadge count={stats.system} variant="red" />}
                        >
                            Sistema
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <div className="w-full sm:w-96">
                    <Input
                        placeholder="Buscar por e-mail de admin ou ID de alvo..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        variant="full-rounded"
                        className="h-[42px]"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    />
                </div>

                {(hasData || hasActiveFilters) && (
                    <Button
                        variant={hasActiveFilters ? "default" : "outline"}
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros
                    </Button>
                )}
            </div>
        </div>
    )
}

export default AuditLogPageControls

