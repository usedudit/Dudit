"use client"

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
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                <Input
                    placeholder="Buscar usuários ou lojas..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    className="flex-1"
                    prefix={<SearchIcon size={18} />}
                />

                <Button
                    variant="outline"
                    className="w-full sm:w-auto h-11 px-6 rounded-full font-bold text-[14px] bg-white dark:bg-dark-surface"
                    leftIcon={<FilterIcon size={16} />}
                >
                    Filtros
                </Button>
            </div>
        </>
    )
}

export default UserEnforcementPageControls
