import React from "react"
import { Button, Input } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
    SearchIcon,
    PlusIcon,
    Package,
    SubcategoryIcon,
    TagIcon,
    MapsIcon,
} from "@/lib/icons"

interface CadastrosPageControlsProps {
    activeTab: "categories" | "subcategories" | "brands" | "locations"
    setActiveTab: (tab: "categories" | "subcategories" | "brands" | "locations") => void
    search: string
    onSearchChange: (value: string) => void
    onAdd: () => void
}

const CadastrosPageControls: React.FC<CadastrosPageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onAdd,
}) => {
    // Exact layout from ProductPageControls
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => setActiveTab(val as any)}
                >
                    <TabsList className="px-0">
                        <TabsTrigger value="categories" icon={Package}>
                            Categorias
                        </TabsTrigger>
                        <TabsTrigger value="subcategories" icon={SubcategoryIcon}>
                            Subcategorias
                        </TabsTrigger>
                        <TabsTrigger value="brands" icon={TagIcon}>
                            Marcas
                        </TabsTrigger>
                        <TabsTrigger value="locations" icon={MapsIcon}>
                            Localização
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-none px-4 md:px-8">

                {/* MOBILE CONTROLS ROW - Exactly like ProductPageControls */}
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
                                <SearchIcon
                                    size={18}
                                    className="text-brand-inactive-text shrink-0"
                                />
                            }
                            label=""
                        />
                    </div>
                    <div className="flex-none flex items-center gap-2">
                        <Button
                            onClick={onAdd}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green hover:bg-brand-green/90 text-white shadow-sm shadow-brand-green/20"
                        >
                            <PlusIcon size={18} />
                        </Button>
                    </div>
                </div>

                {/* DESKTOP CONTROLS - Exactly like ProductPageControls */}
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
                                    <SearchIcon
                                        size={18}
                                        className="text-brand-inactive-text shrink-0"
                                    />
                                }
                                label=""
                            />
                        </div>
                    </div>

                    {/* Spacer to push other icons to the right if needed, matching desktop alignment */}
                    <div className="flex-1 min-w-0" />
                </div>
            </div>
        </>
    )
}

export default CadastrosPageControls
