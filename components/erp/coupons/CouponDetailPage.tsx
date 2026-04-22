"use client"

import React, { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ActionsDropdown, Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  CouponRelations,
  CouponRow,
  getCouponApplyScopeLabel,
  getCouponCustomerScopeLabel,
  getCouponPrimaryMeta,
  getCouponStatusLabel,
  getCouponStatusVariant,
  getCouponUsageCount,
  getCouponUsageSummary,
  getCouponValiditySummary,
} from "@/lib/types/coupon"

const SidebarCard = ({
  children,
  hasTopStrip = true,
}: {
  children: React.ReactNode
  hasTopStrip?: boolean
}) => (
  <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
    {children}
  </div>
)

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start text-[14px] gap-4">
      <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
      <div className="text-right text-brand-dark dark:text-dark-heading font-bold text-sm">{value}</div>
    </div>
  )
}

export default function CouponDetailPage({
  coupon,
  relations,
  onBack,
  onEdit,
  onDelete,
  onToggleStatus,
  isLoadingRelations,
}: {
  coupon: CouponRow
  relations: CouponRelations
  onBack: () => void
  onEdit: (coupon: CouponRow) => void
  onDelete: (coupon: CouponRow) => void
  onToggleStatus: (coupon: CouponRow) => void
  isLoadingRelations: boolean
}) {
  const [activeTab, setActiveTab] = useState("summary")

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
              <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </div>

              <div className="hidden md:flex items-start justify-between">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3">
                    <span className="truncate">{coupon.code}</span>
                    <Badge variant={getCouponStatusVariant(coupon)}>{getCouponStatusLabel(coupon)}</Badge>
                  </h1>

                  <div className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    {getCouponPrimaryMeta(coupon)}
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                  <ActionsDropdown
                    onEdit={() => onEdit(coupon)}
                    onCancel={() => onToggleStatus(coupon)}
                    cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
                    onDelete={() => onDelete(coupon)}
                  />
                  <Button onClick={() => onEdit(coupon)} className="whitespace-nowrap">
                    <EditIcon className="w-[18px] h-[18px] mr-2" />
                    Editar cupom
                  </Button>
                </div>
              </div>

              <div className="w-full md:mt-4">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="summary">Resumo</TabsTrigger>
                  <TabsTrigger value="scope">Escopo</TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8">
            <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
              <AnimatePresence mode="wait">
                <TabsContent value="summary" className="mt-0" key="summary">
                  <FadeIn className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Detalhes do cupom</h3>
                        <div className="space-y-3">
                          <KeyValueRow label="Tipo de desconto" value={getCouponPrimaryMeta(coupon)} />
                          <KeyValueRow label="Aplicar a" value={getCouponApplyScopeLabel(coupon.apply_scope)} />
                          <KeyValueRow label="Escopo de clientes" value={getCouponCustomerScopeLabel(coupon.customer_scope)} />
                          <KeyValueRow label="Validade" value={getCouponValiditySummary(coupon)} />
                          <KeyValueRow label="Uso" value={getCouponUsageSummary(coupon)} />
                        </div>
                      </section>

                      <div className="border-t border-brand-border dark:border-dark-border my-8 w-full" />

                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Regras configuradas</h3>
                        <div className="space-y-3">
                          <KeyValueRow label="Valor minimo do carrinho" value={`R$ ${Number(coupon.min_cart_value || 0).toFixed(2)}`} />
                          <KeyValueRow label="Combinacao" value={coupon.allow_combination ? "Permitida" : "Bloqueada"} />
                          <KeyValueRow label="Desconto maximo" value={coupon.max_discount_value != null ? `R$ ${Number(coupon.max_discount_value).toFixed(2)}` : "Nao definido"} />
                          <KeyValueRow label="Limite total" value={coupon.usage_limit != null ? coupon.usage_limit : "Ilimitado"} />
                          <KeyValueRow label="Por cliente" value={coupon.usage_per_customer != null ? coupon.usage_per_customer : coupon.first_purchase_only ? "Primeira compra" : "Livre"} />
                        </div>
                      </section>
                    </div>

                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                      <SidebarCard>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Status do cupom</h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                            <Badge variant={getCouponStatusVariant(coupon)}>{getCouponStatusLabel(coupon)}</Badge>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Automatico</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{coupon.is_automatic ? "Sim" : "Nao"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Usos realizados</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponUsageCount(coupon)}</span>
                          </div>
                        </div>
                      </SidebarCard>

                      <SidebarCard>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Aplicacao</h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Produtos</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{relations.products.length}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Servicos</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{relations.services.length}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Categorias</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{relations.categories.length}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Clientes</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{relations.customers.length}</span>
                          </div>
                        </div>
                      </SidebarCard>
                    </div>
                  </FadeIn>
                </TabsContent>

                <TabsContent value="scope" className="mt-0" key="scope">
                  <FadeIn className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                      {isLoadingRelations ? (
                        <div className="flex items-center justify-center py-16">
                          <ThreeDotsLoader />
                        </div>
                      ) : (
                        <div className="space-y-8">
                          <section>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Categorias vinculadas</h3>
                            <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.categories.length > 0 ? relations.categories.join(", ") : "Nenhuma categoria especifica vinculada."}</p>
                          </section>

                          <div className="border-t border-brand-border dark:border-dark-border w-full" />

                          <section>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Produtos vinculados</h3>
                            <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.products.length > 0 ? relations.products.map((item) => item.name).join(", ") : "Nenhum produto especifico vinculado."}</p>
                          </section>

                          <div className="border-t border-brand-border dark:border-dark-border w-full" />

                          <section>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Servicos vinculados</h3>
                            <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.services.length > 0 ? relations.services.map((item) => item.name).join(", ") : "Nenhum servico especifico vinculado."}</p>
                          </section>

                          <div className="border-t border-brand-border dark:border-dark-border w-full" />

                          <section>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Clientes vinculados</h3>
                            <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.customers.length > 0 ? relations.customers.map((item) => item.name).join(", ") : "O cupom vale para toda a base de clientes."}</p>
                          </section>
                        </div>
                      )}
                    </div>

                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                      <SidebarCard>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo do escopo</h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Aplicacao</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponApplyScopeLabel(coupon.apply_scope)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Clientes</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponCustomerScopeLabel(coupon.customer_scope)}</span>
                          </div>
                        </div>
                      </SidebarCard>
                    </div>
                  </FadeIn>
                </TabsContent>
              </AnimatePresence>
            </div>
          </div>
        </Tabs>

        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
          <ActionsDropdown
            onEdit={() => onEdit(coupon)}
            onCancel={() => onToggleStatus(coupon)}
            cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
            onDelete={() => onDelete(coupon)}
            trigger={
              <Button variant="outline" className="flex-1">
                Opcoes
              </Button>
            }
          />
          <Button onClick={() => onEdit(coupon)} className="flex-1">
            Editar
          </Button>
        </div>
      </div>
    </FadeIn>
  )
}
