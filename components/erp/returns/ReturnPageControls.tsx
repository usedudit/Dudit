import React from "react"
import { Button, Input } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { SearchIcon, FilterIcon, GridIcon, ListIcon, PlusIcon, Settings2Icon, ExportFileIcon } from "@/lib/icons"

interface ReturnPageControlsProps {
    search: string
    onSearchChange: (v: string) => void
    onOpenFilter: () => void
    onAdd?: () => void
    onExport?: () => void
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    addDisabled?: boolean
}

export default function ReturnPageControls({
    search,
    onSearchChange,
    onOpenFilter,
    onAdd,
    onExport,
    viewMode,
    onViewModeChange,
    addDisabled = false,
}: ReturnPageControlsProps) {
    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
            {/* Mobile View */}
            <div className="md:hidden flex items-center gap-2 w-full">
                <div className="flex-1">
                    <Input
                        name="search"
                        placeholder="Buscar devoluções..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        variant="full-rounded"
                        label=""
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    />
                </div>
                <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0">
                    <FilterIcon className="w-4 h-4" />
                </Button>
                <Dropdown
                    trigger={
                        <Button variant="outline" className="w-[42px] h-[42px] p-0">
                            <Settings2Icon className="w-4 h-4" />
                        </Button>
                    }
                    align="right"
                    showChevron={false}
                    className="w-fit"
                >
                    {onExport && (
                        <DropdownItem onClick={onExport}>
                            <ExportFileIcon size={14} /> Exportar
                        </DropdownItem>
                    )}
                </Dropdown>
                {onAdd && (
                    <Button onClick={onAdd} disabled={addDisabled} className="w-[42px] h-[42px] p-0 rounded-full">
                        <PlusIcon className="w-5 h-5" />
                    </Button>
                )}
            </div>

            {/* Desktop View */}
            <div className="hidden md:flex items-center w-full gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="w-80">
                        <Input
                            name="search"
                            placeholder="Buscar por ID, pedido ou cliente..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            variant="full-rounded"
                            label=""
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button variant="outline" onClick={onOpenFilter} leftIcon={<FilterIcon size={18} />}>
                        Filtros
                    </Button>
                </div>
                <div className="flex-1" />
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border" : "text-gray-400"}`}
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border" : "text-gray-400"}`}
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    )
}
