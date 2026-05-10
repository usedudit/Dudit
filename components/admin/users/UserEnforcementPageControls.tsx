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
        <>
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

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 md:px-8 mb-4">
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
        </>
    )
}

export default UserEnforcementPageControls
