"use client"

import { memo } from "react"
import { SearchIcon, UserIcon, ClockIcon, ChevronRightIcon, DashboardIcon } from "@/lib/icons"
import { Input, Tabs, TabsList, TabsTrigger, ListItem } from "@/components/reusable"
import type { PDVCustomer } from "@/lib/types/pdv"

type TeamMember = {
  id: string
  fullName?: string | null
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
}: Props) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Input
            label=""
            placeholder="Buscar produtos..."
            value={search}
            variant="full-rounded"
            onChange={(e: any) => onSearchChange(e.target.value)}
            prefix={<SearchIcon size={18} className="shrink-0 text-brand-inactive-text" />}
            className="mb-0 border-transparent bg-transparent"
          />
        </div>

        <div className="flex-none flex items-center gap-2">
          {isMobile ? (
            <>
              <button
                onClick={onOpenCategorySheet}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-gray text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text"
              >
                <DashboardIcon size={18} />
              </button>
              <button onClick={onOpenCustomerSheet} className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-gray text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text">
                <UserIcon size={18} />
              </button>
              <button onClick={onOpenSellerSheet} className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-gray text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text">
                <ClockIcon size={18} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <ListItem
                onClick={onOpenCustomerSheet}
                className="min-w-[220px] gap-4 border-none bg-transparent p-3 hover:bg-brand-gray/40 dark:hover:bg-dark-border/30"
                left={
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gray dark:bg-dark-border/50">
                    {selectedCustomerId ? (
                      <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        {customers.find((customer) => customer.id === selectedCustomerId)?.name.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <UserIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                    )}
                  </div>
                }
                title="Cliente"
                description={selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId)?.name : "Consumidor Final"}
                titleClassName="mb-1 text-base font-bold text-brand-dark dark:text-dark-heading"
                descriptionClassName="max-w-[160px] truncate text-sm text-brand-inactive-text dark:text-dark-body"
                showChevron
              />

              <ListItem
                onClick={onOpenSellerSheet}
                className="min-w-[220px] gap-4 border-none bg-transparent p-3 hover:bg-brand-gray/40 dark:hover:bg-dark-border/30"
                left={
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gray dark:bg-dark-border/50">
                    <ClockIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                  </div>
                }
                title="Vendedor"
                description={selectedSellerId ? teamMembers.find((member) => member.id === selectedSellerId)?.fullName || "Selecionar" : "Selecionar"}
                titleClassName="mb-1 text-base font-bold text-brand-dark dark:text-dark-heading"
                descriptionClassName="max-w-[160px] truncate text-sm text-brand-inactive-text dark:text-dark-body"
                showChevron
              />
            </div>
          )}
        </div>
      </div>

      {!isMobile && (
        <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mb-6 border-b border-brand-border dark:border-dark-border">
          <TabsList className="w-full border-b-0 px-0">
            {categories.map((category) => (
              <TabsTrigger key={category} value={category}>
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </>
  )
})

export default POSHeader
