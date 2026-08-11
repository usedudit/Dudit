"use client"

import DefaultModal from "@/components/reusable/DefaultModal"
import { Check } from "lucide-react"

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"

interface ExplorarSortBottomSheetProps {
    isOpen: boolean
    onClose: () => void
    sortBy: SortOption
    onSortChange: (val: SortOption) => void
    sortOptions: { value: SortOption; label: string }[]
}

export function ExplorarSortBottomSheet({
    isOpen,
    onClose,
    sortBy,
    onSortChange,
    sortOptions,
}: ExplorarSortBottomSheetProps) {
    return (
        <DefaultModal isOpen={isOpen} onClose={onClose} title="Ordenar" maxWidth="sm">
            <div className="space-y-2">
                {sortOptions.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => {
                            onSortChange(option.value)
                            onClose()
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${sortBy === option.value
                            ? "bg-[#ecfdf5] text-brand-green"
                            : "text-brand-dark hover:bg-gray-50"
                            }`}
                    >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                            <Check className="h-4 w-4" />
                        )}
                    </button>
                ))}
            </div>
        </DefaultModal>
    )
}
