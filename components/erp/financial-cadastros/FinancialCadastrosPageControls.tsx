import React from "react"
import { Button, Input } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { SearchIcon, PlusIcon, Package, SubcategoryIcon, MoneyIcon, UserIcon } from "@/lib/icons"

export type FinancialCadastrosTab = "categories" | "subcategories" | "accounts" | "contacts"

interface FinancialCadastrosPageControlsProps {
    activeTab: FinancialCadastrosTab
    setActiveTab: (tab: FinancialCadastrosTab) => void
    search: string
    onSearchChange: (value: string) => void
    onAdd: () => void
}

const FinancialCadastrosPageControls: React.FC<FinancialCadastrosPageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onAdd,
}) => {
    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as FinancialCadastrosTab)}>
                    <TabsList className="px-0">
                        <TabsTrigger value="categories" icon={Package}>
                            Categorias
                        </TabsTrigger>
                        <TabsTrigger value="subcategories" icon={SubcategoryIcon}>
                            Subcategorias
                        </TabsTrigger>
                        <TabsTrigger value="accounts" icon={MoneyIcon}>
                            Contas
                        </TabsTrigger>
                        <TabsTrigger value="contacts" icon={UserIcon}>
                            Contatos
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-none px-4 md:px-8">
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={
                                <SearchIcon size={18} className="text-brand-inactive-text shrink-0" />
                            }
                            label=""
                        />
                    </div>
                    <div className="flex-none flex items-center gap-2">
                        <Button
                            onClick={onAdd}
                            leftIcon={<PlusIcon size={18} />}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                        >
                        </Button>
                    </div>
                </div>

                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={
                                    <SearchIcon size={18} className="text-brand-inactive-text shrink-0" />
                                }
                                label=""
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0" />
                </div>
            </div>
        </>
    )
}

export default FinancialCadastrosPageControls
