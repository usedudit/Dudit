"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    SearchIcon,
    UserIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    FilterIcon
} from "@/lib/icons"

interface UserEnforcementPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
    hasData?: boolean
}

const UserEnforcementPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab,
    hasData = true
}: UserEnforcementPageControlsProps) => {

    const tabs = [
        { value: "all", label: "Todos", icon: UserIcon },
        { value: "active", label: "Ativos", icon: CheckCircleIcon },
        { value: "banned", label: "Banidos", icon: AlertCircleIcon },
    ] as const

    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        {tabs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                icon={tab.icon}
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            label=""
                        />
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar usuários ou lojas..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                label=""
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default UserEnforcementPageControls
