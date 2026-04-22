"use client"

import React, { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, SparklesIcon, TagIcon, TrashIcon } from "@/lib/icons"
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

function SectionList({
  title,
  items,
  emptyText,
}: {
  title: string
  items: string[]
  emptyText: string
}) {
  return (
    <section className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant="gray" icon={null}>
              {item}
            </Badge>
          ))}
        </div>
      )}
    </section>
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
  const [activeTab, setActiveTab] = useState("overview")

  const statCards = useMemo(
    () => [
      { label: "Desconto", value: getCouponPrimaryMeta(coupon) },
      { label: "Uso", value: getCouponUsageSummary(coupon) },
      { label: "Escopo", value: getCouponApplyScopeLabel(coupon.apply_scope) },
      { label: "Clientes", value: getCouponCustomerScopeLabel(coupon.customer_scope) },
    ],
    [coupon],
  )

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
              <div className="hidden md:flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0">
                    <ChevronLeftIcon className="w-5 h-5" />
                  </Button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading truncate">{coupon.code}</h1>
                      <Badge variant={getCouponStatusVariant(coupon)}>{getCouponStatusLabel(coupon)}</Badge>
                      {coupon.is_automatic && (
                        <Badge variant="blue" icon={<SparklesIcon />}>
                          Automatico
                        </Badge>
                      )}
                    </div>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">{getCouponPrimaryMeta(coupon)}</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <Button variant="outline" onClick={() => onToggleStatus(coupon)}>
                    {coupon.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button variant="outline" onClick={() => onEdit(coupon)}>
                    <EditIcon className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => onDelete(coupon)} className="w-10 h-10 p-0">
                    <TrashIcon className="w-4 h-4 text-brand-red-dark" />
                  </Button>
                </div>
              </div>

              <div className="w-full md:mt-4">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="overview">Visao geral</TabsTrigger>
                  <TabsTrigger value="scope">Escopo</TabsTrigger>
                  <TabsTrigger value="rules">Regras</TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 max-w-[1300px] mx-auto w-full pb-28 md:pb-8">
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
              <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {statCards.map((card) => (
                    <div key={card.label} className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-4">
                      <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-2">{card.label}</p>
                      <p className="font-bold text-brand-dark dark:text-dark-heading leading-tight">{card.value}</p>
                    </div>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <TabsContent value="overview" className="mt-0">
                    <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <section className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo operacional</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Validade</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{getCouponValiditySummary(coupon)}</p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Aplicacao</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{getCouponApplyScopeLabel(coupon.apply_scope)}</p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Clientes</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{getCouponCustomerScopeLabel(coupon.customer_scope)}</p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Usos realizados</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{getCouponUsageCount(coupon)}</p>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Regras aplicadas</h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Valor minimo do carrinho</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number(coupon.min_cart_value || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Combinacao</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{coupon.allow_combination ? "Permitida" : "Bloqueada"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Primeira compra</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{coupon.first_purchase_only ? "Sim" : "Nao"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Teto do desconto</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                              {coupon.max_discount_value != null ? `R$ ${Number(coupon.max_discount_value).toFixed(2)}` : "Sem teto"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Limite por cliente</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                              {coupon.usage_per_customer != null ? coupon.usage_per_customer : "Nao definido"}
                            </span>
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="scope" className="mt-0">
                    <motion.div key="scope" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      {isLoadingRelations ? (
                        <div className="rounded-2xl border border-brand-border dark:border-dark-border p-8 flex items-center justify-center">
                          <ThreeDotsLoader />
                        </div>
                      ) : (
                        <>
                          <SectionList
                            title="Categorias vinculadas"
                            items={relations.categories}
                            emptyText="Este cupom nao esta restrito por categorias."
                          />
                          <SectionList
                            title="Produtos vinculados"
                            items={relations.products.map((item) => item.name)}
                            emptyText="Nenhum produto especifico vinculado."
                          />
                          <SectionList
                            title="Servicos vinculados"
                            items={relations.services.map((item) => item.name)}
                            emptyText="Nenhum servico especifico vinculado."
                          />
                          <SectionList
                            title="Clientes vinculados"
                            items={relations.customers.map((item) => item.name)}
                            emptyText="O cupom vale para toda a base de clientes."
                          />
                        </>
                      )}
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="rules" className="mt-0">
                    <motion.div key="rules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <section className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Disponibilidade</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Inicio</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{coupon.starts_at || "Sem inicio"}</p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Fim</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{coupon.ends_at || "Sem fim"}</p>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Consumo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Uso total</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">
                              {coupon.usage_limit != null ? coupon.usage_limit : "Ilimitado"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Por cliente</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">
                              {coupon.usage_per_customer != null ? coupon.usage_per_customer : "Livre"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-brand-gray/40 dark:bg-dark-border/20 p-4">
                            <p className="text-brand-inactive-text dark:text-dark-body mb-1">Ja usado</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading">{getCouponUsageCount(coupon)}</p>
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  </TabsContent>
                </AnimatePresence>
              </div>

              <aside className="col-span-12 lg:col-span-4">
                <div className="lg:sticky lg:top-24 space-y-5">
                  <div className="rounded-3xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <TagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cupom</p>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading">{coupon.code}</h3>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponStatusLabel(coupon)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Automatico</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{coupon.is_automatic ? "Sim" : "Nao"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Catalogo vinculado</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                          {relations.products.length + relations.services.length + relations.categories.length || "Completo"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
                    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Acoes rapidas</h3>
                    <div className="space-y-3">
                      <Button onClick={() => onEdit(coupon)} className="w-full">
                        <EditIcon className="w-4 h-4 mr-2" />
                        Editar cupom
                      </Button>
                      <Button variant="outline" onClick={() => onToggleStatus(coupon)} className="w-full">
                        {coupon.is_active ? "Desativar cupom" : "Ativar cupom"}
                      </Button>
                      <Button variant="ghost" onClick={() => onDelete(coupon)} className="w-full text-brand-red-dark">
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Excluir cupom
                      </Button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </Tabs>

        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3">
          <Button variant="outline" onClick={() => onToggleStatus(coupon)} className="flex-1">
            {coupon.is_active ? "Desativar" : "Ativar"}
          </Button>
          <Button onClick={() => onEdit(coupon)} className="flex-1">
            Editar
          </Button>
        </div>
      </div>
    </FadeIn>
  )
}
