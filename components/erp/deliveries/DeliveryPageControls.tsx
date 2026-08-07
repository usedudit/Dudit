import React from "react"
import { Button, Input } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { SearchIcon, FilterIcon, PlusIcon, TruckIcon, BlockedIcon, SparklesIcon } from "@/lib/icons"

interface DeliveryPageControlsProps {
    activeTab: "active" | "closed"
    onActiveTabChange: (tab: "active" | "closed") => void
    search: string
    onSearchChange: (v: string) => void
    onOpenFilter: () => void
    onAdd: () => void
    onOpenSuggestions?: () => void
    canSmartSuggest?: boolean
    addDisabled?: boolean
    tabCounts?: { active: number; closed: number }
}

export default function DeliveryPageControls({
    activeTab,
    onActiveTabChange,
    search,
    onSearchChange,
    onOpenFilter,
    onAdd,
    onOpenSuggestions,
    canSmartSuggest = false,
    addDisabled = false,
    tabCounts,
}: DeliveryPageControlsProps) {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => onActiveTabChange(val as any)}
                >
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="active"
                            icon={TruckIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="blue" />}
                        >
                            Entregas Ativas
                        </TabsTrigger>
                        <TabsTrigger
                            value="closed"
                            icon={BlockedIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.closed} variant="gray" />}
                        >
                            Canceladas / Falhas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1">
                        <Input
                            name="search"
                            placeholder="Buscar entregas..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            variant="full-rounded"
                            label=""
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px]"><FilterIcon size={18} /></Button>
                    <Button onClick={onAdd} disabled={addDisabled} className="w-[42px] h-[42px]"><PlusIcon size={18} /></Button>
                </div>

                <div className="hidden md:flex items-center w-full gap-3">
                    <div className="w-80">
                        <Input
                            name="search"
                            placeholder="Buscar por pedido ou cliente..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            variant="full-rounded"
                            label=""
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button variant="outline" onClick={onOpenFilter} leftIcon={<FilterIcon size={18} />}>Filtros</Button>
                </div>
            </div>
        </>
    )
}
