"use client"

import React from "react"
import { SearchIcon, PlusIcon, FilterIcon } from "@/lib/icons"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"

interface CadastrosPageControlsProps {
    activeTab: "categories" | "subcategories" | "brands" | "locations"
    setActiveTab: (tab: any) => void
    search: string
    onSearchChange: (val: string) => void
    onAdd: () => void
    statusFilter: "all" | "active" | "inactive"
    setStatusFilter: (filter: "all" | "active" | "inactive") => void
}

const CadastrosPageControls = React.memo(({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onAdd,
    statusFilter,
    setStatusFilter
}: CadastrosPageControlsProps) => {
    return (
        <div className="flex flex-col gap-6 mb-8 px-4 md:px-8 flex-none">
            {/* Tabs Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border dark:border-dark-border pb-px">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                    <TabsList className="bg-transparent p-0 gap-8 h-12 overflow-x-auto hide-scrollbar whitespace-nowrap">
                        <TabsTrigger 
                            value="categories" 
                            className="text-[15px] font-bold px-0 bg-transparent border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading rounded-none transition-all duration-300 h-full"
                        >
                            Categorias
                        </TabsTrigger>
                        <TabsTrigger 
                            value="subcategories" 
                            className="text-[15px] font-bold px-0 bg-transparent border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading rounded-none transition-all duration-300 h-full"
                        >
                            Subcategorias
                        </TabsTrigger>
                        <TabsTrigger 
                            value="brands" 
                            className="text-[15px] font-bold px-0 bg-transparent border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading rounded-none transition-all duration-300 h-full"
                        >
                            Marcas
                        </TabsTrigger>
                        <TabsTrigger 
                            value="locations" 
                            className="text-[15px] font-bold px-0 bg-transparent border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading rounded-none transition-all duration-300 h-full"
                        >
                            Localizações
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-3 md:pb-px">
                    <Button onClick={onAdd} className="h-10 px-5 gap-2">
                        <PlusIcon className="w-4 h-4" />
                        <span>Novo Cadastro</span>
                    </Button>
                </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="relative flex-1 group">
                    <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text dark:text-dark-body group-focus-within:text-brand-green transition-colors" />
                    <Input
                        placeholder={`Buscar ${activeTab === 'categories' ? 'categoria' : activeTab === 'brands' ? 'marca' : activeTab === 'subcategories' ? 'subcategoria' : 'localização'}...`}
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 h-11 bg-brand-gray border-none dark:bg-dark-border/50 focus:bg-white dark:focus:bg-dark-background transition-all duration-300 rounded-xl"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <Dropdown
                        align="right"
                        trigger={
                            <Button variant="outline" className="h-11 px-4 gap-2 border-brand-border dark:border-dark-border bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/50 text-[14px] font-medium transition-all duration-300 rounded-xl">
                                <FilterIcon className="w-4 h-4" />
                                <span>{statusFilter === 'all' ? 'Todos Status' : statusFilter === 'active' ? 'Ativos' : 'Inativos'}</span>
                            </Button>
                        }
                    >
                        <DropdownItem onClick={() => setStatusFilter("all")}>Todos Status</DropdownItem>
                        <DropdownItem onClick={() => setStatusFilter("active")}>Somente Ativos</DropdownItem>
                        <DropdownItem onClick={() => setStatusFilter("inactive")}>Somente Inativos</DropdownItem>
                    </Dropdown>
                </div>
            </div>
        </div>
    )
})

CadastrosPageControls.displayName = "CadastrosPageControls"

export default CadastrosPageControls
