"use client"

import React, { useState } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/reusable"
import { Store, LinkIcon, Users, CreditCardIcon } from "@/lib/icons"

import { SettingsCard } from "./SettingsCard"
import { BusinessDataSubPage } from "./BusinessDataSubPage"
import { IntegrationsSubPage } from "./IntegrationsSubPage"
import { TeamSubPage } from "./TeamSubPage"
import { SubscriptionSubPage } from "./SubscriptionSubPage"

interface SettingsTabsProps {
  partner: any
  paymentMethods: any[]
}

type ActivePage = "home" | "business-data" | "integrations" | "team" | "subscription"

export function SettingsTabs({ partner, paymentMethods }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const [activePage, setActivePage] = useState<ActivePage>("home")
  const [mpConnected] = useState(!!partner.mp_user_id)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activePage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="w-full px-4 md:px-8"
      >
        {activePage === "home" && (
          <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col gap-2 pt-1">
              <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                Configurações da Loja
              </h1>
              <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                Gerencie as informações e configurações da sua loja
              </p>
            </div>
            <Button asChild variant="filled">
              <Link href="/erp/dashboard">Voltar</Link>
            </Button>
          </div>
        )}

        {activePage === "home" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <SettingsCard
              icon={Store}
              title="Dados do Negócio"
              description="Gerencie informações da empresa, endereço e contatos comerciais."
              onClick={() => setActivePage("business-data")}
            />
            <SettingsCard
              icon={LinkIcon}
              title="Integrações"
              description="Conecte-se com ferramentas externas, marketplaces e ERPs."
              onClick={() => setActivePage("integrations")}
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
          </motion.div>
        )}

        {activePage === "business-data" && (
          <BusinessDataSubPage
            partner={partner}
            paymentMethods={paymentMethods}
            onBack={() => setActivePage("home")}
          />
        )}

        {activePage === "integrations" && (
          <IntegrationsSubPage
            partner={partner}
            mpConnected={mpConnected}
            onBack={() => setActivePage("home")}
          />
        )}

        {activePage === "team" && <TeamSubPage partnerId={partner.id} onBack={() => setActivePage("home")} />}

        {activePage === "subscription" && <SubscriptionSubPage onBack={() => setActivePage("home")} />}
      </motion.div>
    </AnimatePresence>
  )
}
