"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"

import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import {
  ActionsDropdown,
  Badge,
  Button,
  FormSection,
  IconPlaceholder,
  SidebarCard,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/reusable"
import { getRecurringPlanFormDataAction } from "@/app/actions/erp/recurring-plans"
import {
  getRecurringBillingModeLabel,
  getRecurringFrequencyLabel,
  getRecurringShippingModeLabel,
} from "@/lib/types/recurring"
import type { RecurringPlan } from "@/lib/types/recurring"
import { formatCurrency, formatFullDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useSidebar } from "@/lib/sidebar-context"
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"
import { ChevronLeftIcon, EditIcon, ThreeDotsIcon } from "@/lib/icons"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

type DetailTab = "general" | "items"

interface PlanDetailPageProps {
  partnerId: string
  plan: RecurringPlan
  onBack: () => void
  canManage: boolean
  onEdit: (plan: RecurringPlan) => void
  onShare?: (plan: RecurringPlan) => void
  onDelete?: (plan: RecurringPlan) => void
  /** Painel admin: carrega staff via action admin (service role). */
  loadFormData?: (
    partnerId: string,
  ) => Promise<{ success?: boolean; data?: { staff?: Array<{ id: string; display_name: string }> }; error?: string }>
  /** Painel admin: abas extras na TabsList do header (ex.: Comprador e Loja, Histórico & Auditoria). */
  extraTabs?: Array<{ value: string; label: React.ReactNode; content: React.ReactNode }>
  /** Painel admin: itens extras (ações de admin) no ActionsDropdown (desktop e mobile). */
  extraDropdownItems?: React.ReactNode
}

const SidebarRow = ({
  label,
  value,
  valueClassName = "",
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{label}</span>
    <span className={`text-sm font-semibold text-right text-brand-dark dark:text-dark-heading ${valueClassName}`}>
      {value}
    </span>
  </div>
)

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{label}</span>
    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading break-words min-w-0">{value}</span>
  </div>
)

const planStatusVariant = (status: string) => {
  if (status === "active") return "green" as const
  if (status === "inactive") return "orange" as const
  return "gray" as const
}

const planStatusLabel = (status: string) => {
  if (status === "active") return "Ativo"
  if (status === "inactive") return "Inativo"
  return "Arquivado"
}

const creditExpirationLabel = (policy?: string | null, days?: number | null) => {
  if (policy === "never") return "Nunca expira"
  if (policy === "fixed_days") return days != null ? `Dias fixos (${days} dias)` : "Dias fixos"
  return "Fim do ciclo"
}

export const PlanDetailPage: React.FC<PlanDetailPageProps> = ({
  partnerId,
  plan,
  onBack,
  canManage,
  onEdit,
  onShare,
  onDelete,
  loadFormData,
  extraTabs,
  extraDropdownItems,
}) => {
  const { setHeaderOverride } = useSidebar()
  const [activeTab, setActiveTab] = useState<string>("general")
  const [isScrolled, setIsScrolled] = useState(false)
  const [staff, setStaff] = useState<Array<{ id: string; display_name: string }>>([])

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  // Nomes dos profissionais para os itens de serviço
  useEffect(() => {
    let cancelled = false
    const loader = loadFormData ?? getRecurringPlanFormDataAction
    loader(partnerId)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setStaff(((res.data as any).staff || []) as Array<{ id: string; display_name: string }>)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [partnerId, loadFormData])

  const pageTitle = plan.name || "Plano"

  useEffect(() => {
    setHeaderOverride({ title: pageTitle, onBack, isSubPage: true })
    return () => setHeaderOverride(null)
  }, [pageTitle, onBack, setHeaderOverride])

  const items = plan.items || []
  const images = (plan.images || []).filter((img) => typeof img === "string" && !img.startsWith("data:"))
  const fulfillmentModes = useMemo(
    () =>
      normalizeFulfillmentModes(
        (plan.fulfillmentModes ?? plan.fulfillment_modes) as string[] | null | undefined,
        ["delivery", "pickup"],
      ),
    [plan.fulfillmentModes, plan.fulfillment_modes],
  )
  const billingMode = plan.billingMode || "manual"
  const shippingMode = plan.shippingMode || "included"
  const creditPolicy = plan.creditExpirationPolicy || "end_of_cycle"
  const creditDays = plan.creditExpirationDays ?? null

  const itemsTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + (Number(item.unitPrice ?? item.product?.price ?? item.service?.price ?? 0) || 0) * (item.quantity || 1),
        0,
      ),
    [items],
  )

  const hasDropdownContent =
    Boolean(onShare) || (canManage && Boolean(onDelete)) || Boolean(extraDropdownItems)
  const dropdown = hasDropdownContent ? (
    <ActionsDropdown
      onShare={onShare ? () => onShare(plan) : undefined}
      onDelete={canManage && onDelete ? () => onDelete(plan) : undefined}
    >
      {extraDropdownItems}
    </ActionsDropdown>
  ) : null

  if (!plan) return <ERPDetailLoading />

  return (
    <FadeIn className="h-full">
      <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto custom-scrollbar w-full relative pb-24 md:pb-8 scroll-smooth"
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-500 ease-in-out">
              <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                <div
                  className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}
                >
                  <Button
                    variant="filled"
                    onClick={onBack}
                    className="w-10 h-10 p-0 flex items-center justify-center"
                  >
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>

                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                  <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                    <h1
                      className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                    >
                      <span className="truncate">{pageTitle}</span>
                      <Badge variant={planStatusVariant(plan.status)} className="whitespace-nowrap">
                        {planStatusLabel(plan.status)}
                      </Badge>
                    </h1>
                    <div
                      className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                    >
                      {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)} • Início{" "}
                      {formatFullDate(plan.startDate)} •{" "}
                      {plan.endDate ? `Fim ${formatFullDate(plan.endDate)}` : "Sem prazo"}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                    {dropdown}
                    {canManage && (
                      <Button
                        className="whitespace-nowrap"
                        onClick={() => onEdit(plan)}
                        leftIcon={<EditIcon size={18} />}
                      >
                        Editar plano
                      </Button>
                    )}
                  </div>
                </div>

                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                  <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                    <TabsTrigger value="general">Dados gerais</TabsTrigger>
                    <TabsTrigger value="items">Itens do plano</TabsTrigger>
                    {extraTabs?.map((tab) => (
                      <TabsTrigger key={tab.value} value={tab.value}>
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
              <AnimatePresence mode="wait">
                {activeTab === "general" && (
                  <FadeIn key="general" className="block">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                        <FormSection title="Identificação do Plano" className="mb-8">
                          <div className="space-y-6">
                            {images.length > 0 && (
                              <div className="flex gap-4 overflow-x-auto pb-2">
                                {images.map((img, index) => (
                                  <div
                                    key={index}
                                    className="relative shrink-0 w-32 h-32 rounded-xl bg-brand-gray dark:bg-dark-border/50 border border-brand-border dark:border-dark-border overflow-hidden"
                                  >
                                    <img
                                      src={getR2ImageUrl(img, "medium")}
                                      alt={`${pageTitle} - imagem ${index + 1}`}
                                      loading="lazy"
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = PLACEHOLDER_IMAGE
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow label="Status" value={planStatusLabel(plan.status)} />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow
                                  label="Exibir no marketplace"
                                  value={plan.showInMarketplace ? "Sim" : "Não"}
                                />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow label="Criado em" value={formatFullDate(plan.createdAt)} />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow label="Atualizado em" value={formatFullDate(plan.updatedAt)} />
                              </div>
                              {plan.description && (
                                <div className="col-span-12">
                                  <InfoRow
                                    label="Descrição"
                                    value={<span className="whitespace-pre-wrap">{plan.description}</span>}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </FormSection>

                        <FormSection hasSeparator title="Ciclo e Recorrência">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Frequência"
                                value={getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Intervalo" value={`A cada ${plan.frequencyInterval || 1}`} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Data de Início" value={formatFullDate(plan.startDate)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Data de Fim"
                                value={plan.endDate ? formatFullDate(plan.endDate) : "Sem prazo"}
                              />
                            </div>
                          </div>
                        </FormSection>

                        <FormSection hasSeparator title="Cobrança e Créditos">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Modo de Cobrança" value={getRecurringBillingModeLabel(billingMode)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Validade dos Créditos" value={creditExpirationLabel(creditPolicy, creditDays)} />
                            </div>
                          </div>
                        </FormSection>

                        <FormSection hasSeparator title="Frete">
                          {fulfillmentModes.includes("delivery") ? (
                            <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow
                                  label="Como o cliente pode receber"
                                  value={fulfillmentModes
                                    .map((mode) => (mode === "delivery" ? "Entrega" : "Retirada"))
                                    .join(" e ")}
                                />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow
                                  label="Como cobrar o frete"
                                  value={getRecurringShippingModeLabel(shippingMode)}
                                />
                              </div>
                              {shippingMode === "flat" && (
                                <div className="col-span-12 md:col-span-6">
                                  <InfoRow
                                    label="Valor do frete"
                                    value={formatCurrency(Number(plan.shippingFlatAmount || 0))}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Este plano é somente para retirada no local: nenhuma cobrança de frete é feita e o
                              cliente não terá a opção de entrega.
                            </p>
                          )}
                        </FormSection>
                      </div>

                      {/* Sidebar */}
                      <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                        <SidebarCard hasSeparator hasTopStrip title="Resumo do Plano">
                          <div className="flex flex-col gap-3">
                            <SidebarRow
                              label="Valor por ciclo"
                              value={formatCurrency(itemsTotal)}
                              valueClassName="text-brand-primary"
                            />
                            <SidebarRow
                              label="Itens no plano"
                              value={items.length === 1 ? "1 item" : `${items.length} itens`}
                            />
                            <SidebarRow
                              label="Frequência"
                              value={getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
                            />
                            <SidebarRow label="Status" value={planStatusLabel(plan.status)} />
                          </div>
                        </SidebarCard>

                        <SidebarCard hasSeparator hasTopStrip title="Cobrança e Frete">
                          <div className="flex flex-col gap-3">
                            <SidebarRow label="Modo de Cobrança" value={getRecurringBillingModeLabel(billingMode)} />
                            <SidebarRow
                              label="Validade dos Créditos"
                              value={creditExpirationLabel(creditPolicy, creditDays)}
                            />
                            <SidebarRow
                              label="Modalidades"
                              value={fulfillmentModes
                                .map((mode) => (mode === "delivery" ? "Entrega" : "Retirada"))
                                .join(" e ")}
                            />
                            <SidebarRow
                              label="Frete"
                              value={
                                fulfillmentModes.includes("delivery")
                                  ? shippingMode === "flat"
                                    ? `${getRecurringShippingModeLabel(shippingMode)} (${formatCurrency(Number(plan.shippingFlatAmount || 0))})`
                                    : getRecurringShippingModeLabel(shippingMode)
                                  : "Somente retirada"
                              }
                            />
                          </div>
                        </SidebarCard>
                      </div>
                    </div>
                  </FadeIn>
                )}

                {activeTab === "items" && (
                  <FadeIn key="items" className="block">
                    {items.length ? (
                      <FormSection title="Itens do Plano">
                        <div className="space-y-4">
                          {items.map((item) => {
                            const itemImages = item.product ? item.product.images : item.service?.images
                            const imageSrc =
                              Array.isArray(itemImages) && itemImages.length
                                ? getR2ImageUrl(itemImages[0], "thumbnail")
                                : PLACEHOLDER_IMAGE
                            const staffName = item.staffPartnerUserId
                              ? staff.find((s) => s.id === item.staffPartnerUserId)?.display_name
                              : null
                            return (
                              <div key={item.id} className="flex items-start gap-4">
                                <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border">
                                  <img
                                    src={imageSrc}
                                    alt={item.product?.name || item.service?.name || "Item"}
                                    loading="lazy"
                                    className="w-full h-full object-cover rounded-full"
                                    onError={(e: any) => {
                                      e.target.src = PLACEHOLDER_IMAGE
                                    }}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1 gap-3">
                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                      {item.product?.name || item.service?.name || "Item"}
                                    </h4>
                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                      {item.unitPrice != null ? formatCurrency(item.unitPrice) : "Padrão"}
                                    </span>
                                  </div>
                                  <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                    {item.itemType === "product" ? "Produto" : "Serviço"}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs flex-wrap">
                                    <span className="text-brand-inactive-text dark:text-dark-body">
                                      Quantidade {item.quantity}
                                    </span>
                                    {item.itemType === "service" && staffName && (
                                      <>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          Profissional {staffName}
                                        </span>
                                      </>
                                    )}
                                    {item.preferredTime && (
                                      <>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          Horário {String(item.preferredTime).slice(0, 5)}
                                        </span>
                                      </>
                                    )}
                                    {item.durationMinutes ? (
                                      <>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          {item.durationMinutes} min
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </FormSection>
                    ) : (
                      <div className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Nenhum item"
                          title="Não há itens no plano"
                          subtitle="Adicione produtos ou serviços a este plano recorrente pela edição do plano."
                          itemButton={
                            canManage
                              ? { text: "Editar plano", action: () => onEdit(plan) }
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </FadeIn>
                )}

                {extraTabs?.map((tab) =>
                  activeTab === tab.value ? (
                    <FadeIn key={tab.value} className="block">
                      {tab.content}
                    </FadeIn>
                  ) : null,
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile Bottom Action Bar */}
          {canManage && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
              {hasDropdownContent && (
                <ActionsDropdown
                  trigger={
                    <Button
                      variant="outline"
                      className="flex-1"
                      leftIcon={<ThreeDotsIcon size={18} />}
                    >
                      Opções
                    </Button>
                  }
                  onShare={onShare ? () => onShare(plan) : undefined}
                  onDelete={canManage && onDelete ? () => onDelete(plan) : undefined}
                >
                  {extraDropdownItems}
                </ActionsDropdown>
              )}
              <Button
                className="flex-1 whitespace-nowrap"
                onClick={() => onEdit(plan)}
                leftIcon={<EditIcon size={18} />}
              >
                Editar plano
              </Button>
            </div>
          )}
        </Tabs>
      </div>
    </FadeIn>
  )
}

export default PlanDetailPage
