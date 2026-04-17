"use client"

import { memo } from "react"
import { SearchIcon, UserIcon, ClockIcon, ChevronRightIcon } from "@/lib/icons"
import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
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
                className="flex h-10 min-w-[112px] items-center justify-between rounded-full border border-brand-border bg-[#F5F6F7] px-3 text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text"
              >
                <span className="truncate text-sm font-bold">{mobileCategoryLabel}</span>
                <ChevronRightIcon size={16} />
              </button>
              <button onClick={onOpenCustomerSheet} className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-[#F5F6F7] text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text">
                <UserIcon size={18} />
              </button>
              <button onClick={onOpenSellerSheet} className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-[#F5F6F7] text-brand-dark dark:border-dark-border dark:bg-dark-gray dark:text-dark-text">
                <ClockIcon size={18} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-8">
              <button onClick={onOpenCustomerSheet} className="group flex items-center gap-3 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border">
                  {selectedCustomerId ? (
                    <span className="text-lg font-bold">
                      {customers.find((customer) => customer.id === selectedCustomerId)?.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <UserIcon size={20} />
                  )}
                </div>
                <div className="flex min-w-[100px] flex-col text-left">
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Cliente</span>
                  <span className="max-w-[150px] truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    {selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId)?.name : "Consumidor Final"}
                  </span>
                </div>
                <ChevronRightIcon size={16} className="text-brand-inactive-text transition-colors group-hover:text-brand-dark" />
              </button>

              <div className="h-10 w-[1px] bg-brand-border dark:bg-dark-border" />

              <button onClick={onOpenSellerSheet} className="group flex items-center gap-3 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border">
                  <ClockIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
                </div>
                <div className="flex min-w-[100px] flex-col text-left">
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Vendedor</span>
                  <span className="max-w-[150px] truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    {selectedSellerId ? teamMembers.find((member) => member.id === selectedSellerId)?.fullName : "Selecionar"}
                  </span>
                </div>
                <ChevronRightIcon size={16} className="text-brand-inactive-text transition-colors group-hover:text-brand-dark" />
              </button>
            </div>
          )}
        </div>
      </div>

      {!isMobile && (
        <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mb-6">
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
