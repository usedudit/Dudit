"use client"

import { Tabs, TabsList, TabsTrigger, Input, Button } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable"
import { SearchIcon, FilterIcon, GridIcon, ListIcon, PlusIcon } from "@/lib/icons"

interface BillingPageControlsProps {
    activeTab: string
    onTabChange: (tab: string) => void
    searchValue: string
    onSearchChange: (value: string) => void
    viewMode: "grid" | "list"
    onViewModeChange: (mode: "grid" | "list") => void
    tabs: Array<{ key: string; label: string; count?: number; icon?: any }>
    onAdd?: () => void
    onFilter?: () => void
}

export function BillingPageControls({
    activeTab,
    onTabChange,
    searchValue,
    onSearchChange,
    viewMode,
    onViewModeChange,
    tabs,
    onAdd,
    onFilter,
}: BillingPageControlsProps) {
    return (
        <div className="flex flex-col">
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={onTabChange}>
                    <TabsList className="px-0">
                        {tabs.map((tab) => (
                            <TabsTrigger
                                key={tab.key}
                                value={tab.key}
                                icon={tab.icon}
                                badge={tab.count !== undefined ? <TabCountBadge count={tab.count} /> : undefined}
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                <div className="w-full md:hidden">
                    <Input
                        placeholder="Buscar..."
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        prefix={<SearchIcon />}
                    />
                </div>

                <div className="hidden md:flex items-center gap-3 w-full">
                    <div className="w-80">
                        <Input
                            placeholder="Buscar..."
                            value={searchValue}
                            onChange={(e) => onSearchChange(e.target.value)}
                            prefix={<SearchIcon />}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {onFilter && (
                        <Button variant="outline" leftIcon={<FilterIcon />} onClick={onFilter}>
                            Filtros
                        </Button>
                    )}

                    <div className="border rounded-full p-1 h-[42px] flex items-center">
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`p-2 rounded-full transition-colors ${viewMode === "list" ? "bg-brand-gray dark:bg-dark-border" : "text-brand-inactive-text hover:text-brand-dark"}`}
                        >
                            <ListIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("grid")}
                            className={`p-2 rounded-full transition-colors ${viewMode === "grid" ? "bg-brand-gray dark:bg-dark-border" : "text-brand-inactive-text hover:text-brand-dark"}`}
                        >
                            <GridIcon className="w-4 h-4" />
                        </button>
                    </div>

                    {onAdd && (
                        <Button variant="default" leftIcon={<PlusIcon />} onClick={onAdd}>
                            Nova
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
