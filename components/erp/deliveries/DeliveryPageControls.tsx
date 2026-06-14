import React from "react"
import { Button, Input } from "@/components/reusable"
import { SearchIcon, FilterIcon, GridIcon, ListIcon, PlusIcon, ColumnsIcon } from "@/lib/icons"

interface DeliveryPageControlsProps {
    search: string
    onSearchChange: (v: string) => void
    onOpenFilter: () => void
    onAdd: () => void
    viewMode: "list" | "grid" | "kanban"
    onViewModeChange: (mode: "list" | "grid" | "kanban") => void
    addDisabled?: boolean
}

export default function DeliveryPageControls({
    search,
    onSearchChange,
    onOpenFilter,
    onAdd,
    viewMode,
    onViewModeChange,
    addDisabled = false,
}: DeliveryPageControlsProps) {
    return (
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
                <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0"><FilterIcon className="w-4 h-4" /></Button>
                <Button onClick={onAdd} disabled={addDisabled} className="w-[42px] h-[42px] p-0 rounded-full"><PlusIcon className="w-5 h-5" /></Button>
            </div>

            <div className="hidden md:flex items-center w-full gap-4">
                <div className="flex items-center gap-3 shrink-0">
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
                <div className="flex-1" />
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button onClick={() => onViewModeChange("kanban")} className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "kanban" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400"}`} title="Visualização em Kanban">
                        <ColumnsIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button onClick={() => onViewModeChange("list")} className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400"}`} title="Visualização em Lista">
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button onClick={() => onViewModeChange("grid")} className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400"}`} title="Visualização em Grade">
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    )
}
