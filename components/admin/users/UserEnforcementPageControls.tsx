"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    UserIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    StoreIcon,
    FilterIcon
} from "@/lib/icons"
import type { AdminUserStats } from "@/app/actions/admin/enforcement"

interface UserEnforcementPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
    tabCounts?: AdminUserStats
    onOpenFilter?: () => void
}

const UserEnforcementPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab,
    tabCounts,
    onOpenFilter,
}: UserEnforcementPageControlsProps) => {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="all"
                            icon={UserIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.total} variant="gray" />}
                        >
                            Todos
                        </TabsTrigger>
                        <TabsTrigger
                            value="active"
                            icon={CheckCircleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="green" />}
                        >
                            Ativos
                        </TabsTrigger>
                        <TabsTrigger
                            value="banned"
                            icon={AlertCircleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.banned} variant="red" />}
                        >
                            Banidos
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                <div className="w-full sm:w-96">
                    <Input
                        placeholder="Buscar por nome, telefone ou CPF..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        variant="full-rounded"
                        className="h-[42px]"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    />
                </div>

                {onOpenFilter && (
                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros
                    </Button>
                )}
            </div>
        </>
    )
}

export default UserEnforcementPageControls

