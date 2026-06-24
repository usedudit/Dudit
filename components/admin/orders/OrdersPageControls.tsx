"use client"

import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { SearchIcon, PackageIcon, CheckCircleIcon, CancelCircleIcon, ClockIcon } from "@/lib/icons"

interface OrdersPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
}

const tabs = [
    { value: "all", label: "Todos", icon: PackageIcon },
    { value: "pending", label: "Pendentes", icon: ClockIcon },
    { value: "delivered", label: "Entregues", icon: CheckCircleIcon },
    { value: "cancelled", label: "Cancelados", icon: CancelCircleIcon },
] as const

export default function OrdersPageControls({ search, setSearch, statusTab, setStatusTab }: OrdersPageControlsProps) {
    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        {tabs.map((tab) => (
                            <TabsTrigger key={tab.value} value={tab.value} icon={tab.icon}>
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                <Input
                    placeholder="Buscar por número do pedido..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    className="flex-1"
                    prefix={<SearchIcon size={18} />}
                />
            </div>
        </>
    )
}
