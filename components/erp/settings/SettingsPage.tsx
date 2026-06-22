"use client"

import React, { useState } from "react"
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
  WrenchIcon,
  MailIcon,
  CadastrosIcon,
} from "@/lib/icons"

import { BusinessDataSubPage } from "./BusinessDataSubPage"
import { ShowcaseSubPage } from "./ShowcaseSubPage"
import { IntegrationsSubPage } from "./IntegrationsSubPage"
import { TeamSubPage } from "./TeamSubPage"
import { SubscriptionSubPage } from "./SubscriptionSubPage"
import { PaymentMethodsSubPage } from "./payments/PaymentMethodsSubPage"
import { SimpleSettingsSubPage } from "./SimpleSettingsSubPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { DeliverySettingsSubPage } from "./DeliverySettingsSubPage"
import { ServiceCheckoutSettingsSubPage } from "./ServiceCheckoutSettingsSubPage"
import { CommissionsSubPage } from "./CommissionsSubPage"
import { SystemResourcesSubPage } from "./SystemResourcesSubPage"
import type { PartnerRole } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { useSidebar } from "@/lib/sidebar-context"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { isSystemResourceActive } from "@/lib/system-resources"

interface SettingsTabsProps {
  partner: any
  paymentMethods: any[]
  role: PartnerRole
}

type ActivePage =
  | "home"
  | "business-data"
  | "integrations"
  | "team"
  | "subscription"
  | "payment-methods"
  | "crediario"
  | "comissao"
  | "recibo"
  | "vitrine"
  | "delivery"
  | "service-checkout"
  | "resources"

export function SettingsTabs({ partner, paymentMethods, role }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const [activePage, setActivePage] = useState<ActivePage>("home")
  const [activeTab, setActiveTab] = useState("empresa")
  const [mpConnected] = useState(!!partner.mp_user_id)
  const { setHeaderOverride } = useSidebar()
  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()

  const PAGE_TO_SLUG: Record<string, string> = {
    "business-data": "dados-do-negocio",
    "team": "equipe-e-acessos",
    "subscription": "assinatura",
    "payment-methods": "formas-de-pagamento",
    "crediario": "crediario",
    "comissao": "comissao",
    "recibo": "recibo-devolucao",
    "vitrine": "vitrine",
    "delivery": "entrega",
    "service-checkout": "servicos-checkout",
    "integrations": "integracoes",
    "resources": "gerenciar-recursos",
  }

  const SLUG_TO_PAGE: Record<string, ActivePage> = Object.entries(PAGE_TO_SLUG).reduce(
    (acc, [page, slug]) => ({ ...acc, [slug]: page as ActivePage }),
    {} as Record<string, ActivePage>
  )

  // Sync state from URL on mount
  React.useEffect(() => {
    const tab = searchParams.get("tab")
    if (!tab) return

    if (SLUG_TO_PAGE[tab]) {
      setActivePage(SLUG_TO_PAGE[tab])
      // Also set the correct category tab for when they go back
      if (["business-data", "team", "subscription"].includes(SLUG_TO_PAGE[tab])) {
        setActiveTab("empresa")
      } else if (["payment-methods", "crediario", "comissao", "recibo"].includes(SLUG_TO_PAGE[tab])) {
        setActiveTab("vendas")
      } else {
        setActiveTab("adicionais")
      }
    } else if (["empresa", "vendas", "adicionais"].includes(tab)) {
      setActiveTab(tab)
      setActivePage("home")
    }
  }, []) // Run once on mount

  // Sync URL from state changes
  React.useEffect(() => {
    const currentTab = searchParams.get("tab")
    let newTab = ""

    if (activePage !== "home") {
      newTab = PAGE_TO_SLUG[activePage] || activePage
    } else {
      newTab = activeTab
    }

    if (newTab !== currentTab) {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", newTab)
      window.history.replaceState(null, "", url.toString())
    }
  }, [activePage, activeTab, searchParams])

  React.useEffect(() => {
    if (activePage !== "home") {
      const titles: Partial<Record<ActivePage, string>> = {
        "business-data": "Dados do Negócio",
        "integrations": "Integrações",
        "team": "Equipe e Acessos",
        "subscription": "Minha Assinatura",
        "payment-methods": "Formas de Pagamentos",
        "crediario": "Crediário",
        "comissao": "Comissão",
        "recibo": "Recibo/Devolução",
        "vitrine": "Minha Vitrine",
        "delivery": "Logística e Entrega",
        "home": "Configurações"
      }
      setHeaderOverride({
        title: titles[activePage] || "Configurações",
        onBack: () => setActivePage("home"),
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

  const roleId = String(role || "DELIVERY").toLowerCase() as RoleId
  const isOwner = roleId === "owner"
  const isAdmin = roleId === "admin"
  const isManager = roleId === "manager"
  const isOwnerOrAdmin = isOwner || isAdmin
  const isOwnerAdminOrManager = isOwner || isAdmin || isManager

  const canAccessOS = businessInfo?.sells?.includes("services") && isOwnerAdminOrManager
  const showVitrine = isOwnerOrAdmin && isSystemResourceActive(businessInfo, "showcase")
  const isQuick = businessInfo.mode === "quick"
  const isDeliveriesResourceActive = isSystemResourceActive(businessInfo, "deliveries")
  const isTeamResourceActive = isSystemResourceActive(businessInfo, "team")
  const canAccessSubscription = isOwner
  const canAccessIntegrations = isOwner
  const canAccessCommissions = isOwnerOrAdmin
  const canAccessTeam = isOwnerOrAdmin
  const canAccessPayments = isOwnerOrAdmin
  const canAccessReturns = isOwnerAdminOrManager
  const canAccessDelivery = isOwnerOrAdmin
  const canAccessServiceCheckout = canAccessOS
  const canAccessBusinessData = isOwnerAdminOrManager
  const canAccessResources = isOwnerOrAdmin
  const teamPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const paymentsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const commissionsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const serviceCheckoutPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const deliveryPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
  const integrationsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")

  React.useEffect(() => {
    if (activePage === "subscription" && !canAccessSubscription) setActivePage("home")
    if (activePage === "integrations" && !canAccessIntegrations) setActivePage("home")
    if (activePage === "comissao" && !canAccessCommissions) setActivePage("home")
    if (activePage === "team" && !canAccessTeam) setActivePage("home")
    if (activePage === "payment-methods" && !canAccessPayments) setActivePage("home")
    if (activePage === "recibo" && !canAccessReturns) setActivePage("home")
    if (activePage === "business-data" && !canAccessBusinessData) setActivePage("home")
    if (activePage === "resources" && !canAccessResources) setActivePage("home")
  }, [activePage, canAccessSubscription, canAccessIntegrations, canAccessCommissions, canAccessTeam, canAccessPayments, canAccessReturns, canAccessBusinessData, canAccessResources])

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

              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full px-4 md:px-8">
                <TabsList className="bg-transparent p-0 gap-8 w-full justify-start border-b border-brand-border dark:border-dark-border mb-8">
                  <TabsTrigger value="empresa">
                    Configurações do negócio
                  </TabsTrigger>
                  {!isQuick && (
                    <TabsTrigger value="vendas">
                      Configurações de vendas
                    </TabsTrigger>
                  )}
                  {!isQuick && (
                    <TabsTrigger value="adicionais">
                      Configurações adicionais
                    </TabsTrigger>
                  )}
                </TabsList>

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
                              onClick={() => setActivePage("business-data")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {showVitrine && (
                            <ListItem
                              icon={Store}
                              title="Minha Vitrine"
                              description="Personalize o banner, logo e o status de exibição da sua vitrine online."
                              onClick={() => setActivePage("vitrine")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {!isQuick && canAccessTeam && isTeamResourceActive && (
                            <ListItem
                              icon={Users}
                              title={teamPlanBlocked ? (
                                <span className="inline-flex items-center gap-2">
                                  Equipe e Acessos
                                  <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                </span>
                              ) : "Equipe e Acessos"}
                              description="Convide membros, defina funções e gerencie permissões de acesso."
                              onClick={() => teamPlanBlocked ? openPlanUpgrade("crescer") : setActivePage("team")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                          {canAccessSubscription && (
                            <ListItem
                              icon={CreditCardIcon}
                              title="Minha Assinatura"
                              description="Visualize seu plano atual, faturas e métodos de pagamento."
                              onClick={() => setActivePage("subscription")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
                          )}
                        </FadeIn>
                      )}
                    </TabsContent>

                    {!isQuick && (
                      <TabsContent value="vendas" key="vendas" className="mt-0 focus-visible:outline-none">
                        {activeTab === "vendas" && (
                          <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                                onClick={() => setActivePage("payment-methods")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            <ListItem
                              icon={CreditCardIcon}
                              title="Crediário"
                              description="Gerencie as regras de parcelamento e limites para vendas no fiado."
                              onClick={() => setActivePage("crediario")}
                              showChevron
                              className="px-4 py-3 gap-4"
                            />
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
                                onClick={() => setActivePage("comissao")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessReturns && (
                              <ListItem
                                icon={PackageReceiveIcon}
                                title="Recibo/Devolução"
                                description="Personalize o cabeçalho do recibo e políticas de trocas."
                                onClick={() => setActivePage("recibo")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                          </FadeIn>
                        )}
                      </TabsContent>
                    )}

                    {!isQuick && (
                      <TabsContent value="adicionais" key="adicionais" className="mt-0 focus-visible:outline-none">
                        {activeTab === "adicionais" && (
                          <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {canAccessResources && (
                              <ListItem
                                icon={CadastrosIcon}
                                title="Gerenciar recursos"
                                description="Ative ou desative modulos do sistema para limpar o menu."
                                onClick={() => setActivePage("resources")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessServiceCheckout && (
                              <ListItem
                                icon={WrenchIcon}
                                title={serviceCheckoutPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Serviços — Checkout
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Serviços — Checkout"}
                                description="Entrada (sinal) e opções de pagamento na vitrine."
                                onClick={() => setActivePage("service-checkout")}
                                showChevron
                                className="px-4 py-3 gap-4"
                              />
                            )}
                            {canAccessDelivery && (
                              <ListItem
                                icon={PackageReceiveIcon}
                                title={deliveryPlanBlocked ? (
                                  <span className="inline-flex items-center gap-2">
                                    Logística e Entrega
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                  </span>
                                ) : "Logística e Entrega"}
                                description="Configure taxas de entrega, raios de atendimento e horários."
                                onClick={() => setActivePage("delivery")}
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
                                onClick={() => setActivePage("integrations")}
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
              key="business-data"
              partner={partner}
              paymentMethods={paymentMethods}
              onBack={() => setActivePage("home")}
            />
          )}

          {activePage === "payment-methods" && (
            <PaymentMethodsSubPage
              key="payment-methods"
              partner={partner}
              paymentMethods={paymentMethods}
              handleBack={() => setActivePage("home")}
              planGate={paymentsPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined}
            />
          )}

          {activePage === "integrations" && canAccessIntegrations && (
            <IntegrationsSubPage
              key="integrations"
              partner={partner}
              mpConnected={mpConnected}
              onBack={() => setActivePage("home")}
            />
          )}

          {activePage === "team" && <TeamSubPage key="team" partnerId={partner.id} onBack={() => setActivePage("home")} teamPlanBlocked={teamPlanBlocked} />}
          {activePage === "subscription" && canAccessSubscription && <SubscriptionSubPage key="subscription" onBack={() => setActivePage("home")} />}
          {activePage === "crediario" && <SimpleSettingsSubPage key="crediario" title="Crediário" onBack={() => setActivePage("home")} />}
          {activePage === "comissao" && canAccessCommissions && <CommissionsSubPage key="comissao" partnerId={partner.id} onBack={() => setActivePage("home")} planGate={commissionsPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined} />}
          {activePage === "recibo" && <SimpleSettingsSubPage key="recibo" title="Recibo/Devolução" onBack={() => setActivePage("home")} />}
          {activePage === "vitrine" && <ShowcaseSubPage key="vitrine" partner={partner} onBack={() => setActivePage("home")} />}
          {activePage === "delivery" && <DeliverySettingsSubPage key="delivery" partnerId={partner.id} onBack={() => setActivePage("home")} planGate={deliveryPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined} />}
          {activePage === "service-checkout" && canAccessServiceCheckout && (
            <ServiceCheckoutSettingsSubPage key="service-checkout" partnerId={partner.id} onBack={() => setActivePage("home")} planGate={serviceCheckoutPlanBlocked ? { requiredPlanSlug: "crescer" as const } : undefined} />
          )}
          {activePage === "resources" && <SystemResourcesSubPage key="resources" businessInfo={businessInfo} planSlug={planSlug} onBack={() => setActivePage("home")} />}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}
