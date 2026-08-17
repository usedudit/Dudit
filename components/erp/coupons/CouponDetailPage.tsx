"use client"

import React, { useState, useCallback, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ActionsDropdown, Badge, Button, FormSection, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useSidebar } from "@/lib/sidebar-context"
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

const SidebarCard = ({ title, children, className = "", hasTopStrip = true }: { title?: React.ReactNode; children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <>
        {/* Desktop: card */}
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
            {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
            {children}
        </div>
        {/* Mobile/Tablet: FormSection */}
        <FormSection title={title} hasSeparator className="lg:hidden">
            {children}
        </FormSection>
    </>
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
    onShare,
    isLoadingRelations,
}: {
    coupon: CouponRow
    relations: CouponRelations
    onBack: () => void
    onEdit: (coupon: CouponRow) => void
    onDelete: (coupon: CouponRow) => void
    onToggleStatus: (coupon: CouponRow) => void
    onShare?: (coupon: CouponRow) => void
    isLoadingRelations: boolean
}) {
    const [activeTab, setActiveTab] = useState("summary")

    const handleBack = useCallback(() => onBack(), [onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        setHeaderOverride({
            title: coupon?.code || "Detalhes do cupom",
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [coupon?.code, handleBack, setHeaderOverride])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                            <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
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
                                        onShare={onShare ? () => onShare(coupon) : undefined}
                                    />
                                    <Button onClick={() => onEdit(coupon)} className="whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
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
                                            <FormSection title="Detalhes do cupom" className="mb-8">
                                                <div className="space-y-3">
                                                    <KeyValueRow label="Tipo de desconto" value={getCouponPrimaryMeta(coupon)} />
                                                    <KeyValueRow label="Aplicar a" value={getCouponApplyScopeLabel(coupon.apply_scope)} />
                                                    <KeyValueRow label="Escopo de clientes" value={getCouponCustomerScopeLabel(coupon.customer_scope)} />
                                                    <KeyValueRow label="Validade" value={getCouponValiditySummary(coupon)} />
                                                    <KeyValueRow label="Uso" value={getCouponUsageSummary(coupon)} />
                                                </div>
                                            </FormSection>

                                            <FormSection hasSeparator title="Regras configuradas">
                                                <div className="space-y-3">
                                                    <KeyValueRow label="Valor mínimo do pedido" value={`R$ ${Number(coupon.min_cart_value || 0).toFixed(2)}`} />
                                                    <KeyValueRow label="Combinação" value={coupon.allow_combination ? "Permitida" : "Bloqueada"} />
                                                    <KeyValueRow label="Desconto máximo" value={coupon.max_discount_value != null ? `R$ ${Number(coupon.max_discount_value).toFixed(2)}` : "Não definido"} />
                                                    <KeyValueRow label="Limite total" value={coupon.usage_limit != null ? coupon.usage_limit : "Ilimitado"} />
                                                    <KeyValueRow label="Por cliente" value={coupon.usage_per_customer != null ? coupon.usage_per_customer : coupon.first_purchase_only ? "Primeira compra" : "Livre"} />
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                            <SidebarCard title="Status do cupom">
                                                <div className="space-y-3 text-sm">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                                                        <Badge variant={getCouponStatusVariant(coupon)}>{getCouponStatusLabel(coupon)}</Badge>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Automático</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{coupon.is_automatic ? "Sim" : "Não"}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Usos realizados</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponUsageCount(coupon)}</span>
                                                    </div>
                                                </div>
                                            </SidebarCard>

                                            <SidebarCard title="Aplicação">
                                                <div className="space-y-3 text-sm">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Produtos</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {coupon.apply_scope === "all" ? "Todos" : coupon.apply_scope === "products" ? relations.products.length : 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Serviços</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {coupon.apply_scope === "all" ? "Todos" : coupon.apply_scope === "services" ? relations.services.length : 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Categorias</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {coupon.apply_scope === "all" ? "Todas" : coupon.apply_scope === "categories" ? relations.categories.length : 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Clientes</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {coupon.customer_scope === "all" ? "Todos" : relations.customers.length}
                                                        </span>
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
                                                    <FormSection title="Categorias vinculadas">
                                                        <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.categories.length > 0 ? relations.categories.map((item) => item.name).join(", ") : "Este cupom vale para todas as categorias."}</p>
                                                    </FormSection>

                                                    <FormSection hasSeparator title="Produtos vinculados">
                                                        <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.products.length > 0 ? relations.products.map((item) => item.name).join(", ") : "Este cupom vale para todos os produtos."}</p>
                                                    </FormSection>

                                                    <FormSection hasSeparator title="Serviços vinculados">
                                                        <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.services.length > 0 ? relations.services.map((item) => item.name).join(", ") : "Este cupom vale para todos os serviços."}</p>
                                                    </FormSection>

                                                    <FormSection hasSeparator title="Clientes vinculados">
                                                        <p className="text-sm text-brand-dark dark:text-dark-heading">{relations.customers.length > 0 ? relations.customers.map((item) => item.name).join(", ") : "Este cupom vale para todos os clientes."}</p>
                                                    </FormSection>
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                            <SidebarCard title="Resumo do escopo">
                                                <div className="space-y-3 text-sm">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-brand-inactive-text dark:text-dark-body">Aplicação</span>
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

                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <ActionsDropdown
                        onEdit={() => onEdit(coupon)}
                        onCancel={() => onToggleStatus(coupon)}
                        cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
                        onDelete={() => onDelete(coupon)}
                        onShare={onShare ? () => onShare(coupon) : undefined}
                        trigger={
                            <Button variant="outline" className="flex-1">
                                Opções
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
