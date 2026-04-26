"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { SearchIcon, PlusIcon, StarIcon, ChartIcon, GridIcon } from "@/lib/icons"

type Tab = "Metas" | "Ranking" | "Resumo"

export default function GoalsPageControls(props: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  search: string
  onSearchChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <>
      <div className="mb-6 px-4 md:px-8">
        <Tabs value={props.activeTab} onValueChange={(val) => props.onTabChange(val as Tab)}>
          <TabsList className="px-0">
            <TabsTrigger value="Metas" icon={StarIcon}>Metas</TabsTrigger>
            <TabsTrigger value="Ranking" icon={ChartIcon}>Ranking</TabsTrigger>
            <TabsTrigger value="Resumo" icon={GridIcon}>Resumo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 px-4 md:px-8">
        <div className="w-full md:w-80">
          <Input
            name="search-goals"
            placeholder="Buscar metas..."
            value={props.search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            className="h-[42px]"
            variant="full-rounded"
            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
            label=""
          />
        </div>

        <Button onClick={props.onCreate}>
          <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
          Nova meta
        </Button>
      </div>
    </>
  )
}
