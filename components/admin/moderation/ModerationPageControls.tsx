"use client"

import React from "react"
import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    SearchIcon,
    ClockIcon,
    AlertTriangleIcon,
    ImageOffIcon,
    AllProductsIcon,
} from "@/lib/icons"

interface ModerationPageControlsProps {
    statusFilter: string
    setStatusFilter: (status: string) => void
    search: string
    onSearchChange: (value: string) => void
}

const ModerationPageControls: React.FC<ModerationPageControlsProps> = ({
    statusFilter,
    setStatusFilter,
    search,
    onSearchChange
}) => {

    const FILTERS = [
        { value: "all", label: "Todos", icon: AllProductsIcon },
        { value: "pending_moderation", label: "Pendentes", icon: ClockIcon },
        { value: "flagged", label: "Flagged", icon: AlertTriangleIcon },
        { value: "needs_images", label: "Sem imagens", icon: ImageOffIcon },
    ] as const

    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                >
                    <TabsList className="px-0">
                        {FILTERS.map(f => (
                            <TabsTrigger key={f.value} value={f.value} icon={f.icon}>
                                {f.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 md:px-8 mb-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="w-full md:w-80">
                        <Input
                            name="search"
                            placeholder="Buscar por título do produto..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px]"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            label=""
                        />
                    </div>
                </div>
            </div>
        </>
    )
}

export default ModerationPageControls
