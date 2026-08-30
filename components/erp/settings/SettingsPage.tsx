"use client"

import React, { useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, ListItem } from "@/components/reusable"
import {
  Store,
  LinkIcon,
  Users,
  CreditCardIcon,
  MoneyIcon,
  TagIcon,
  PackageReceiveIcon,
  CadastrosIcon,
  ShoppingCartIcon,
  MotorbikeIcon,
} from "@/lib/icons"

import { BusinessDataSubPage } from "./BusinessDataSubPage"
import { ShowcaseSubPage } from "./ShowcaseSubPage"
import { IntegrationsSubPage } from "./IntegrationsSubPage"
import { TeamSubPage } from "./TeamSubPage"
import { SubscriptionSubPage } from "./SubscriptionSubPage"
import { PaymentsPage } from "./PaymentsPage"
import { ReturnPolicySubPage } from "./ReturnPolicySubPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { DeliverySettingsSubPage } from "./DeliverySettingsSubPage"
import { SalesSettingsSubPage } from "./SalesSettingsSubPage"
import { ReceiptSettingsSubPage } from "./ReceiptSettingsSubPage"
import { CommissionsSubPage } from "./CommissionsSubPage"
import { SystemResourcesSubPage } from "./SystemResourcesSubPage"
import type { PartnerRole } from "@/lib/permissions/types"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { useSidebar } from "@/lib/sidebar-context"
import { usePermissions } from "@/lib/permission-context"
import { useStore } from "@/lib/store-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { isSystemResourceActive } from "@/lib/system-resources"

interface SettingsTabsProps {
  partner: any
  paymentMethods: any[]
  role?: PartnerRole
}

type ActivePage =
  | "home"
  | "business-data"
  | "integrations"
  | "team"
  | "subscription"
  | "sales-settings"
  | "receipts"
  | "payment-methods"
  | "comissao"
  | "trocas"
  | "vitrine"
  | "delivery"
  | "resources"

export function SettingsTabs({ partner, paymentMethods, role }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const [activePage, setActivePage] = useState<ActivePage>("home")
  const [activeTab, setActiveTab] = useState("empresa")
  const pendingUrlSyncRef = useRef(false)
  const [mpConnected] = useState(!!partner.mp_user_id)
  const { setHeaderOverride } = useSidebar()
  const { planSlug, canRbac } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const { selectedStore } = useStore()

  const PAGE_TO_SLUG: Record<string, string> = {
    "business-data": "dados-do-negocio",
    "team": "equipe-e-acessos",
    "subscription": "assinatura",
    "sales-settings": "vendas-gerais",
    "receipts": "recibos-impressao",
    "payment-methods": "formas-de-pagamento",
    "comissao": "comissao",
    "trocas": "trocas-devolucoes",
    "vitrine": "vitrine",
    "delivery": "entrega",
    "integrations": "integracoes",
    "resources": "gerenciar-recursos",
  }

  const SLUG_TO_PAGE: Record<string, ActivePage> = {
    ...Object.entries(PAGE_TO_SLUG).reduce(
      (acc, [page, slug]) => ({ ...acc, [slug]: page as ActivePage }),
      {} as Record<string, ActivePage>
    ),
    "recibo-devolucao": "trocas", // Legacy fallback compatibility
    "configuracoes-sistema": "receipts", // Legacy fallback compatibility
    "entregas": "delivery", // Legacy fallback compatibility
  }

  const navigateToSubpage = (page: ActivePage) => {
    setActivePage(page)
    const slug = PAGE_TO_SLUG[page] || (page === "home" ? "" : page)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (slug) {
        url.searchParams.set("tab", slug)
        window.history.pushState(null, "", url.toString())
      } else {
        url.searchParams.delete("tab")
        window.history.pushState(null, "", url.toString())
      }
    }
  }

  const handleCategoryTabChange = (tab: string) => {
    setActiveTab(tab)
    if (activePage === "home" && typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      window.history.replaceState(null, "", url.toString())
    }
  }

  // Handle popstate for browser back / forward navigation
  React.useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get("tab")
      if (!tab) {
        setActivePage("home")
        return
      }

      if (SLUG_TO_PAGE[tab]) {
        setActivePage(SLUG_TO_PAGE[tab])
        if (["business-data", "team", "subscription"].includes(SLUG_TO_PAGE[tab])) {
          setActiveTab("empresa")
        } else if (["sales-settings", "receipts", "payment-methods", "comissao", "trocas"].includes(SLUG_TO_PAGE[tab])) {
          setActiveTab("vendas")
        } else {
          setActiveTab("adicionais")
        }
      } else if (["empresa", "vendas", "adicionais"].includes(tab)) {
        setActiveTab(tab)
        setActivePage("home")
      } else {
        setActivePage("home")
      }
    }

    // Initial check from current window URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get("tab")
      if (tab && SLUG_TO_PAGE[tab]) {
        setActivePage(SLUG_TO_PAGE[tab])
        if (["business-data", "team", "subscription"].includes(SLUG_TO_PAGE[tab])) {
          setActiveTab("empresa")
        } else if (["sales-settings", "receipts", "payment-methods", "comissao", "trocas"].includes(SLUG_TO_PAGE[tab])) {
          setActiveTab("vendas")
        } else {
          setActiveTab("adicionais")
        }
      } else if (tab && ["empresa", "vendas", "adicionais"].includes(tab)) {
        setActiveTab(tab)
        setActivePage("home")
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  React.useEffect(() => {
    if (activePage !== "home") {
      const titles: Partial<Record<ActivePage, string>> = {
        "business-data": "Dados do Negócio",
        "integrations": "Integrações",
        "team": "Equipe e Acessos",
        "subscription": "Minha Assinatura",
        "sales-settings": "Configurações de Vendas",
        "receipts": "Recibos e Impressão",
        "payment-methods": "Formas de Pagamentos",
        "comissao": "Comissão",
        "trocas": "Trocas e Devoluções",
        "vitrine": "Minha Vitrine",
        "delivery": "Logística e Entrega",
        "resources": "Gerenciar Recursos",
        "home": "Configurações"
      }
      setHeaderOverride({
        title: titles[activePage] || "Configurações",
        onBack: () => navigateToSubpage("home"),
        isSubPage: true
      })
    } else {
      setHeaderOverride(null)
    }
    return () => {
      setHeaderOverride(null)
    }
  }, [activePage, setHeaderOverride])

  const businessInfo = normalizeBusinessInfo(partner.business_info)

  const isDesapego = businessInfo.mode === "desapego"
  const isQuick = businessInfo.mode === "quick" || businessInfo.mode === "showcase"
  const isDeliveriesResourceActive = isSystemResourceActive(businessInfo, "deliveries")
  const isTeamResourceActive = isSystemResourceActive(businessInfo, "team")

  const showVitrine = canRbac("settings.settings_vitrine") && isSystemResourceActive(businessInfo, "showcase")
  const canAccessSubscription = canRbac("settings.settings_plan")
  const canAccessIntegrations = canRbac("settings.settings_integrations") && !isDesapego
  const canAccessCommissions = canRbac("settings.settings_comissions") && !isDesapego && !isQuick
  const canAccessTeam = canRbac("settings.settings_team") && !isDesapego && !isQuick
  const canAccessPayments = canRbac("settings.settings_payments") && !isDesapego
  const canAccessReturns = canRbac("settings.settings_returns") && !isDesapego && !isQuick
  const canAccessDelivery = canRbac("settings.settings_delivery") && !isDesapego
  const canAccessSalesSettings = canRbac("settings.settings_negocio") && !isDesapego
  const canAccessReceipts = canRbac("settings.settings_messages") && !isDesapego
  const canAccessBusinessData = canRbac("settings.settings_negocio") && !isDesapego
  const canAccessResources = canRbac("settings.settings_resources") && !isDesapego
  const hasAdditionalSettings = canAccessResources || canAccessIntegrations
  const teamPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const paymentsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const commissionsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const deliveryPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const integrationsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")

  React.useEffect(() => {
    if (activePage === "subscription" && !canAccessSubscription) setActivePage("home")
    if (activePage === "integrations" && !canAccessIntegrations) setActivePage("home")
    if (activePage === "sales-settings" && !canAccessSalesSettings) setActivePage("home")
    if (activePage === "receipts" && !canAccessReceipts) setActivePage("home")
    if (activePage === "comissao" && !canAccessCommissions) setActivePage("home")
    if (activePage === "team" && !canAccessTeam) setActivePage("home")
    if (activePage === "payment-methods" && !canAccessPayments) setActivePage("home")
    if (activePage === "trocas" && !canAccessReturns) setActivePage("home")
    if (activePage === "business-data" && !canAccessBusinessData) setActivePage("home")
    if (activePage === "resources" && !canAccessResources) setActivePage("home")
  }, [activePage, canAccessSubscription, canAccessIntegrations, canAccessSalesSettings, canAccessReceipts, canAccessCommissions, canAccessTeam, canAccessPayments, canAccessReturns, canAccessBusinessData, canAccessResources])

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activePage === "home" && (
            <FadeIn key="home" className="flex flex-col h-full overflow-hidden">
              <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                <div className="flex flex-col gap-2 pt-1">
                  <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                    Configurações do negócio
                  </h1>
                  <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    Gerencie todas as definições da sua empresa e vendas
                  </p>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={handleCategoryTabChange} className="flex flex-col h-full px-4 md:px-8">
                {!isDesapego && (
                  <TabsList className="bg-transparent p-0 gap-8 w-full justify-start border-b border-brand-border dark:border-dark-border mb-8">
                    <TabsTrigger value="empresa">
                      Configurações do negócio
                    </TabsTrigger>
                    <TabsTrigger value="vendas">
                      Configurações de vendas
                    </TabsTrigger>
                    {hasAdditionalSettings && (
                      <TabsTrigger value="adicionais">
                        Configurações adicionais
                      </TabsTrigger>
                    )}
                  </TabsList>
                )}

                <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                  <AnimatePresence mode="wait">
                    <TabsContent value="empresa" key="empresa" className="mt-0 focus-visible:outline-none">
                      {activeTab === "empresa" && (
                        <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {canAccessBusinessData && (
                            <ListItem
                              icon={Store}
                              title="Dados do Negócio"
                              description="Gerencie informações da empresa, endereço e contatos comerciais."
                              onClick={() => navigateToSubpage("business-data")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {showVitrine && (
                            <ListItem
                              icon={Store}
                              title="Minha Vitrine"
                              description={isDesapego ? "Personalize banner, logo, status da vitrine e endereço." : "Personalize o banner, logo e o status de exibição da sua vitrine online."}
                              onClick={() => navigateToSubpage("vitrine")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {canAccessTeam && (
                            <ListItem
                              icon={Users}
                              title={teamPlanBlocked ? (
                                <span className="inline-flex items-center gap-2">
                                  Equipe e Acessos
                                  <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                </span>
                              ) : "Equipe e Acessos"}
                              description="Convide membros, defina funções e gerencie permissões de acesso."
                              onClick={() => teamPlanBlocked ? openPlanUpgrade("crescer") : navigateToSubpage("team")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {canAccessSubscription && (
                            <ListItem
                              icon={CreditCardIcon}
                              title="Minha Assinatura"
                              description="Visualize seu plano atual, faturas e métodos de pagamento."
                              onClick={() => navigateToSubpage("subscription")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                        </FadeIn>
                      )}
                    </TabsContent>

                    {!isDesapego && (
                      <TabsContent value="vendas" key="vendas" className="mt-0 focus-visible:outline-none">
                        {activeTab === "vendas" && (
                          <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {canAccessSalesSettings && (
                              <ListItem
                                icon={ShoppingCartIcon}
                                title="Configurações Gerais"
                                description="Margem de lucro, descontos, estoque, PDV e modelos de recibos."
                                onClick={() => navigateToSubpage("sales-settings")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessPayments && (
                              <ListItem
                                icon={MoneyIcon}
                                title={paymentsPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Formas de Pagamentos
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Formas de Pagamentos"}
                                description="Configure os métodos de pagamento aceitos e as taxas de operadoras."
                                onClick={() => navigateToSubpage("payment-methods")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessDelivery && (
                              <ListItem
                                icon={MotorbikeIcon}
                                title={deliveryPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Logística e Entrega
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Logística e Entrega"}
                                description="Configure taxas de entrega, raios de atendimento e horários."
                                onClick={() => navigateToSubpage("delivery")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessCommissions && (
                              <ListItem
                                icon={TagIcon}
                                title={commissionsPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Comissão
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Comissão"}
                                description="Defina regras de comissão para vendedores e entregadores."
                                onClick={() => navigateToSubpage("comissao")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessReturns && (
                              <ListItem
                                icon={PackageReceiveIcon}
                                title="Trocas e Devoluções"
                                description="Defina as políticas de troca e devoluções do seu negócio."
                                onClick={() => navigateToSubpage("trocas")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                          </FadeIn>
                        )}
                      </TabsContent>
                    )}

                    {!isDesapego && hasAdditionalSettings && (
                      <TabsContent value="adicionais" key="adicionais" className="mt-0 focus-visible:outline-none">
                        {activeTab === "adicionais" && (
                          <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {canAccessResources && (
                              <ListItem
                                icon={CadastrosIcon}
                                title="Gerenciar recursos"
                                description="Ative ou desative modulos do sistema para limpar o menu."
                                onClick={() => navigateToSubpage("resources")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessIntegrations && (
                              <ListItem
                                icon={LinkIcon}
                                title={integrationsPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Integrações
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Integrações"}
                                description="Conecte-se com plataformas externas e APIs de terceiros."
                                onClick={() => navigateToSubpage("integrations")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                          </FadeIn>
                        )}
                      </TabsContent>
                    )}
                  </AnimatePresence>
                </div>
              </Tabs>
            </FadeIn>
          )}

          {activePage === "business-data" && (
            <BusinessDataSubPage
              key={`business-data-${selectedStore?.id || 'default'}`}
              partner={partner}
              store={selectedStore}
              paymentMethods={paymentMethods}
              onBack={() => navigateToSubpage("home")}
            />
          )}

          {activePage === "sales-settings" && canAccessSalesSettings && (
            <SalesSettingsSubPage
              key="sales-settings"
              partnerId={partner.id}
              onBack={() => navigateToSubpage("home")}
            />
          )}

          {activePage === "receipts" && canAccessReceipts && (
            <ReceiptSettingsSubPage
              key="receipts"
              partnerId={partner.id}
              onBack={() => navigateToSubpage("home")}
            />
          )}

          {activePage === "payment-methods" && (
            <PaymentsPage
              key="payment-methods"
              partner={partner}
              paymentMethods={paymentMethods}
              onBack={() => navigateToSubpage("home")}
              planGate={paymentsPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined}
              storeId={selectedStore?.id}
            />
          )}

          {activePage === "integrations" && canAccessIntegrations && (
            <IntegrationsSubPage
              key="integrations"
              partner={partner}
              mpConnected={mpConnected}
              onBack={() => navigateToSubpage("home")}
            />
          )}

          {activePage === "team" && <TeamSubPage key="team" partnerId={partner.id} onBack={() => navigateToSubpage("home")} teamPlanBlocked={teamPlanBlocked} />}
          {activePage === "subscription" && canAccessSubscription && <SubscriptionSubPage key="subscription" partnerId={partner.id} onBack={() => navigateToSubpage("home")} />}
          {activePage === "comissao" && canAccessCommissions && <CommissionsSubPage key="comissao" partnerId={partner.id} onBack={() => navigateToSubpage("home")} planGate={commissionsPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined} />}
          {activePage === "trocas" && <ReturnPolicySubPage key="trocas" partnerId={partner.id} onBack={() => navigateToSubpage("home")} />}
          {activePage === "vitrine" && selectedStore && <ShowcaseSubPage key="vitrine" store={selectedStore} partnerId={partner.id} onBack={() => navigateToSubpage("home")} />}
          {activePage === "delivery" && <DeliverySettingsSubPage key="delivery" partnerId={partner.id} storeId={selectedStore?.id} onBack={() => navigateToSubpage("home")} planGate={deliveryPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined} />}
          {activePage === "resources" && <SystemResourcesSubPage key="resources" businessInfo={businessInfo} planSlug={planSlug} onBack={() => navigateToSubpage("home")} />}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}
