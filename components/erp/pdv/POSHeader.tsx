"use client"

import { memo, useRef, useState, useEffect } from "react"
import { SearchIcon, UserIcon, IdentityCardIcon, CameraIcon } from "@/lib/icons"
import { Input, Tabs, TabsList, TabsTrigger, ListItem, Button } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { Lock, Unlock, Filter } from "lucide-react"
import type { PDVCustomer } from "@/lib/types/pdv"

type TeamMember = {
    id: string
    fullName?: string | null
    avatarUrl?: string | null
}

type Props = {
    isMobile: boolean
    search: string
    onSearchChange: (value: string) => void
    categories: string[]
    selectedCategory: string
    onCategoryChange: (value: string) => void
    mobileCategoryLabel: string
    onOpenCategorySheet: () => void
    selectedCustomerId?: string
    customers: PDVCustomer[]
    onOpenCustomerSheet: () => void
    selectedSellerId?: string
    teamMembers: TeamMember[]
    onOpenSellerSheet: () => void
    onScanBarcode?: (code: string) => void
    onOpenCamera?: () => void
    itemTypeTab: "product" | "service"
    onItemTypeTabChange: (value: "product" | "service") => void
    hasBothProductsAndServices: boolean
    onOpenTypeFilterModal?: () => void
}

const POSHeader = memo(function POSHeader({
    isMobile,
    search,
    onSearchChange,
    categories,
    selectedCategory,
    onCategoryChange,
    mobileCategoryLabel,
    onOpenCategorySheet,
    selectedCustomerId,
    customers,
    onOpenCustomerSheet,
    selectedSellerId,
    teamMembers,
    onOpenSellerSheet,
    onScanBarcode,
    onOpenCamera,
    itemTypeTab,
    onItemTypeTabChange,
    hasBothProductsAndServices,
    onOpenTypeFilterModal,
}: Props) {
    // Focus Lock State and Effect
    const [focusLock, setFocusLock] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (focusLock) {
            const interval = setInterval(() => {
                if (inputRef.current && document.activeElement !== inputRef.current) {
                    inputRef.current.focus()
                }
            }, 500)
            return () => clearInterval(interval)
        }
    }, [focusLock])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault()
            const scannedValue = search.trim()
            if (scannedValue && onScanBarcode) {
                onScanBarcode(scannedValue)
            }
        }
    }

    const focusLockSuffix = (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                setFocusLock(!focusLock)
                setTimeout(() => {
                    inputRef.current?.focus()
                }, 50)
            }}
            className={`p-1.5 rounded-full transition-colors flex items-center justify-center ${focusLock
                ? "text-brand-primary bg-brand-primary/15"
                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border"
                }`}
            title={focusLock ? "Foco Travado (para leitor de código de barras)" : "Ativar Foco Automático"}
        >
            {focusLock ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
    )

    const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)
    const selectedSeller = teamMembers.find((m) => m.id === selectedSellerId)

    return (
        <>
            <div className="mb-4 flex items-center gap-3">
                <div className="relative min-w-[200px] flex-1 flex items-center gap-2">
                    <Input
                        ref={inputRef}
                        label=""
                        placeholder="Buscar produtos..."
                        value={search}
                        variant="full-rounded"
                        onChange={(e: any) => onSearchChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        prefix={<SearchIcon size={18} className="shrink-0 text-brand-inactive-text" />}
                        suffix={focusLockSuffix}
                        className="mb-0 border-transparent bg-transparent flex-1"
                    />
                </div>

                <div className="flex-none flex items-center gap-2">
                    {isMobile ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={onOpenCamera}
                                className="w-[42px] h-[42px] p-0"
                            >
                                <CameraIcon className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                onClick={onOpenCustomerSheet}
                                className="w-[42px] h-[42px] p-0"
                            >
                                {selectedCustomerId ? (
                                    <UserProfileImage
                                        fullName={selectedCustomer?.name || "Cliente"}
                                        imageUrl={selectedCustomer?.avatar_url}
                                        className="w-10 h-10 text-xs"
                                    />
                                ) : (
                                    <UserIcon className="w-4 h-4" />
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={onOpenSellerSheet}
                                className="w-[42px] h-[42px] p-0"
                            >
                                {selectedSellerId ? (
                                    <UserProfileImage
                                        fullName={selectedSeller?.fullName || "Vendedor"}
                                        imageUrl={selectedSeller?.avatarUrl}
                                        className="w-10 h-10 text-xs"
                                    />
                                ) : (
                                    <IdentityCardIcon className="w-4 h-4" />
                                )}
                            </Button>
                        </>
                    ) : (
                        <div className="flex items-center gap-3">
                            <ListItem
                                onClick={onOpenCustomerSheet}
                                className="min-w-[220px] gap-3 border-none"
                                left={
                                    <UserProfileImage
                                        fullName={selectedCustomer?.name || "Consumidor Final"}
                                        imageUrl={selectedCustomer?.avatar_url}
                                        className="w-[42px] h-[42px] shrink-0 border border-brand-border dark:border-dark-border text-base"
                                    />
                                }
                                title="Cliente"
                                description={selectedCustomerId ? selectedCustomer?.name : "Consumidor Final"}
                                titleClassName="text-sm font-bold text-brand-dark dark:text-dark-heading"
                                descriptionClassName="max-w-[160px] truncate text-sm text-brand-inactive-text dark:text-dark-body leading-none"
                                showChevron
                            />

                            <ListItem
                                onClick={onOpenSellerSheet}
                                className="min-w-[220px] gap-3 border-none"
                                left={
                                    <UserProfileImage
                                        fullName={selectedSeller?.fullName || "Vendedor"}
                                        imageUrl={selectedSeller?.avatarUrl}
                                        className="w-[42px] h-[42px] shrink-0 border border-brand-border dark:border-dark-border text-base"
                                    />
                                }
                                title="Vendedor"
                                description={selectedSellerId ? selectedSeller?.fullName || "Selecionar" : "Selecionar"}
                                titleClassName="text-sm font-bold text-brand-dark dark:text-dark-heading"
                                descriptionClassName="max-w-[160px] truncate text-sm text-brand-inactive-text dark:text-dark-body leading-none"
                                showChevron
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 mb-6 border-b border-brand-border dark:border-dark-border">
                {onOpenTypeFilterModal && (
                    <div className="flex items-center gap-3 shrink-0 pb-2">
                        <button
                            type="button"
                            onClick={onOpenTypeFilterModal}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border transition-colors"
                            title="Escolher Produtos ou Serviços"
                        >
                            <Filter size={18} />
                        </button>
                        <div className="h-5 w-[1px] bg-brand-border dark:bg-dark-border" />
                    </div>
                )}

                <div className="flex-1 overflow-x-auto hide-scrollbar">
                    <Tabs value={selectedCategory} onValueChange={onCategoryChange}>
                        <TabsList className="w-full border-b-0 px-0 pb-0">
                            {categories.map((category) => (
                                <TabsTrigger key={category} value={category} className="pb-2">
                                    {category}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </div>
        </>
    )
})

export default POSHeader
