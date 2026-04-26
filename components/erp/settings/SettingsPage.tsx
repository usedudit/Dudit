"use client"

import React, { useState } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
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
  ChevronLeftIcon
} from "@/lib/icons"

import { SettingsCard } from "./SettingsCard"
import { BusinessDataSubPage } from "./BusinessDataSubPage"
import { IntegrationsSubPage } from "./IntegrationsSubPage"
import { TeamSubPage } from "./TeamSubPage"
import { SubscriptionSubPage } from "./SubscriptionSubPage"
import { PaymentMethodsSubPage } from "./payments/PaymentMethodsSubPage"
import { SimpleSettingsSubPage } from "./SimpleSettingsSubPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { DeliverySettingsSubPage } from "./DeliverySettingsSubPage"
import { CommissionsSubPage } from "./CommissionsSubPage"

interface SettingsTabsProps {
  partner: any
  paymentMethods: any[]
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
  | "os"
  | "mensagens"
  | "delivery"

export function SettingsTabs({ partner, paymentMethods }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const [activePage, setActivePage] = useState<ActivePage>("home")
  const [activeTab, setActiveTab] = useState("empresa")
  const [mpConnected] = useState(!!partner.mp_user_id)

  const PAGE_TO_SLUG: Record<string, string> = {
    "business-data": "dados-do-negocio",
    "team": "equipe-e-acessos",
    "subscription": "assinatura",
    "payment-methods": "formas-de-pagamento",
    "crediario": "crediario",
    "comissao": "comissao",
    "recibo": "recibo-devolucao",
    "vitrine": "vitrine",
    "os": "os",
    "mensagens": "modelos-de-mensagens",
    "delivery": "entrega",
    "integrations": "integracoes",
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

  const businessInfo = typeof partner.business_info === "string"
    ? JSON.parse(partner.business_info)
    : (partner.business_info || { sells: ["products"], channels: ["online"] })

  const showOS = businessInfo?.sells?.includes("services")
  const showVitrine = businessInfo?.channels?.includes("online")

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
                    Configurações da empresa
                  </TabsTrigger>
                  <TabsTrigger value="vendas">
                    Configurações de vendas
                  </TabsTrigger>
                  <TabsTrigger value="adicionais">
                    Configurações adicionais
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                  <AnimatePresence mode="wait">
                    <TabsContent value="empresa" key="empresa" className="mt-0 focus-visible:outline-none">
                      {activeTab === "empresa" && (
                        <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          <SettingsCard
                            icon={Store}
                            title="Dados do Negócio"
                            description="Gerencie informações da empresa, endereço e contatos comerciais."
                            onClick={() => setActivePage("business-data")}
                          />
                          <SettingsCard
                            icon={Users}
                            title="Equipe e Acessos"
                            description="Convide membros, defina funções e gerencie permissões de acesso."
                            onClick={() => setActivePage("team")}
                          />
                          <SettingsCard
                            icon={CreditCardIcon}
                            title="Minha Assinatura"
                            description="Visualize seu plano atual, faturas e métodos de pagamento."
                            onClick={() => setActivePage("subscription")}
                          />
                        </FadeIn>
                      )}
                    </TabsContent>

                    <TabsContent value="vendas" key="vendas" className="mt-0 focus-visible:outline-none">
                      {activeTab === "vendas" && (
                        <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          <SettingsCard
                            icon={MoneyIcon}
                            title="Formas de Pagamentos"
                            description="Configure os métodos de pagamento aceitos e as taxas de operadoras."
                            onClick={() => setActivePage("payment-methods")}
                          />
                          <SettingsCard
                            icon={CreditCardIcon}
                            title="Crediário"
                            description="Gerencie as regras de parcelamento e limites para vendas no fiado."
                            onClick={() => setActivePage("crediario")}
                          />
                          <SettingsCard
                            icon={TagIcon}
                            title="Comissão"
                            description="Defina regras de comissão para vendedores e entregadores."
                            onClick={() => setActivePage("comissao")}
                          />
                          <SettingsCard
                            icon={PackageReceiveIcon}
                            title="Recibo/Devolução"
                            description="Personalize o cabeçalho do recibo e políticas de trocas."
                            onClick={() => setActivePage("recibo")}
                          />
                        </FadeIn>
                      )}
                    </TabsContent>

                    <TabsContent value="adicionais" key="adicionais" className="mt-0 focus-visible:outline-none">
                      {activeTab === "adicionais" && (
                        <FadeIn className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {showVitrine && (
                            <SettingsCard
                              icon={Store}
                              title="Minha Vitrine"
                              description="Configure o link, cores e produtos visíveis no seu catálogo online."
                              onClick={() => setActivePage("vitrine")}
                            />
                          )}
                          {showOS && (
                            <SettingsCard
                              icon={WrenchIcon}
                              title="Configurar O.S"
                              description="Personalize campos, status e o layout das ordens de serviço."
                              onClick={() => setActivePage("os")}
                            />
                          )}
                          <SettingsCard
                            icon={MailIcon}
                            title="Modelos de Mensagens"
                            description="Crie templates automáticos para envio via WhatsApp ou E-mail."
                            onClick={() => setActivePage("mensagens")}
                          />
                          <SettingsCard
                            icon={PackageReceiveIcon}
                            title="Entrega"
                            description="Configure taxas e regras de entrega."
                            onClick={() => setActivePage("delivery")}
                          />
                          <SettingsCard
                            icon={LinkIcon}
                            title="Integrações"
                            description="Conecte-se com ferramentas externas, marketplaces e ERPs."
                            onClick={() => setActivePage("integrations")}
                          />
                        </FadeIn>
                      )}
                    </TabsContent>
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
              onBack={() => setActivePage("home")}
            />
          )}

          {activePage === "integrations" && (
            <IntegrationsSubPage
              key="integrations"
              partner={partner}
              mpConnected={mpConnected}
              onBack={() => setActivePage("home")}
            />
          )}

          {activePage === "team" && <TeamSubPage key="team" partnerId={partner.id} onBack={() => setActivePage("home")} />}
          {activePage === "subscription" && <SubscriptionSubPage key="subscription" onBack={() => setActivePage("home")} />}
          {activePage === "crediario" && <SimpleSettingsSubPage key="crediario" title="Crediário" onBack={() => setActivePage("home")} />}
          {activePage === "comissao" && <CommissionsSubPage key="comissao" partnerId={partner.id} onBack={() => setActivePage("home")} />}
          {activePage === "recibo" && <SimpleSettingsSubPage key="recibo" title="Recibo/Devolução" onBack={() => setActivePage("home")} />}
          {activePage === "vitrine" && <SimpleSettingsSubPage key="vitrine" title="Minha Vitrine" onBack={() => setActivePage("home")} />}
          {activePage === "os" && <SimpleSettingsSubPage key="os" title="Configuração de O.S" onBack={() => setActivePage("home")} />}
          {activePage === "mensagens" && <SimpleSettingsSubPage key="mensagens" title="Modelos de Mensagens" onBack={() => setActivePage("home")} />}
          {activePage === "delivery" && <DeliverySettingsSubPage key="delivery" partnerId={partner.id} onBack={() => setActivePage("home")} />}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}
