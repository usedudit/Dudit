"use client"

import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    SearchIcon,
    UserIcon,
    CheckCircleIcon,
    AlertCircleIcon
} from "@/lib/icons"

interface UserEnforcementPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
}

const UserEnforcementPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab
}: UserEnforcementPageControlsProps) => {

    const tabs = [
        { value: "all", label: "Todos", icon: UserIcon },
        { value: "active", label: "Ativos", icon: CheckCircleIcon },
        { value: "banned", label: "Banidos", icon: AlertCircleIcon },
    ] as const

    return (
        <div className="flex flex-col gap-6 mb-6 px-4 md:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs de Status */}
                <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full md:w-auto">
                    <TabsList className="bg-brand-gray/50 dark:bg-dark-border/30 p-1 h-11">
                        {tabs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="flex items-center gap-2 px-4 h-9 data-[state=active]:bg-white dark:data-[state=active]:bg-dark-surface data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading data-[state=active]:shadow-sm transition-all rounded-md"
                            >
                                <tab.icon size={16} className={statusTab === tab.value ? "text-brand-green" : "text-brand-inactive-text"} />
                                <span className="text-[13px] font-bold whitespace-nowrap">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* Barra de Busca */}
                <div className="w-full md:w-80">
                    <Input
                        name="search"
                        placeholder="Buscar por nome ou loja..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-[42px]"
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        label=""
                    />
                </div>
            </div>
        </div>
    )
}

export default UserEnforcementPageControls
