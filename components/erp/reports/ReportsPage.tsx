"use client"

import React, { useState, useMemo } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { OperationsTab } from "@/components/erp/dashboard/widgets/OperationsTab"
import {
  GridIcon,
  AnalyticsIcon,
  PackageIcon,
  WrenchIcon,
  TruckIcon,
  FileTextIcon,
  MoneyIcon,
  Users,
  MegaphoneIcon,
  AwardIcon,
  ReturnIcon,
} from "@/lib/icons"
import type {
  ProductsDashboardData,
  ServicesDashboardData,
  FinancialDashboardData,
  OperationsDashboardData,
  Metric,
} from "@/lib/data/dashboard"

type TabId = "visao-geral" | "vendas" | "produtos" | "servicos" | "entregas" | "ordens-servico" | "financeiro" | "clientes" | "marketing" | "produtividade" | "trocas"

interface TabDefinition {
  id: TabId
  label: string
  icon: React.ElementType
}

const REPORT_TABS: TabDefinition[] = [
  { id: "visao-geral",   label: "Visão Geral",     icon: GridIcon },
  { id: "vendas",        label: "Vendas",           icon: AnalyticsIcon },
  { id: "produtos",      label: "Produtos",         icon: PackageIcon },
  { id: "servicos",      label: "Serviços",         icon: WrenchIcon },
  { id: "entregas",      label: "Entregas",         icon: TruckIcon },
  { id: "ordens-servico",label: "Ordens de Serviço",icon: FileTextIcon },
  { id: "financeiro",    label: "Financeiro",       icon: MoneyIcon },
  { id: "clientes",      label: "Clientes",         icon: Users },
  { id: "marketing",     label: "Marketing",        icon: MegaphoneIcon },
  { id: "produtividade", label: "Produtividade",    icon: AwardIcon },
  { id: "trocas",        label: "Trocas/Devoluções", icon: ReturnIcon },
]

interface ReportsPageProps {
  sells: string[]
  productsData: ProductsDashboardData | null
  servicesData: ServicesDashboardData | null
  financialData: FinancialDashboardData | null
  operationsData: OperationsDashboardData | null
}

export function ReportsPage({
  sells,
  productsData,
  servicesData,
  financialData,
  operationsData,
}: ReportsPageProps) {
  const sellsProducts = sells.includes("products")
  const sellsServices = sells.includes("services")

  const availableTabs = useMemo(() => {
    return REPORT_TABS.filter((tab) => {
      switch (tab.id) {
        case "produtos":
        case "vendas":
        case "marketing":
          return sellsProducts && productsData !== null
        case "servicos":
        case "ordens-servico":
          return sellsServices && servicesData !== null
        case "entregas":
          return operationsData !== null
        case "financeiro":
          return financialData !== null
        default:
          return true
      }
    })
  }, [sellsProducts, sellsServices, productsData, servicesData, financialData, operationsData])

  const initialTab = availableTabs.length > 0 ? availableTabs[0].id : ""
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  if (availableTabs.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
          Nenhum relatório disponível para seu perfil.
        </span>
      </div>
    )
  }

  return (
    <Tabs defaultValue={initialTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-8">
        {availableTabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} icon={tab.icon}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Visão Geral */}
      <TabsContent value="visao-geral">
        <GeneralOverviewSection
          sells={sells}
          productsData={productsData}
          servicesData={servicesData}
          financialData={financialData}
          operationsData={operationsData}
        />
      </TabsContent>

      {/* Vendas */}
      <TabsContent value="vendas">
        <SalesSection productsData={productsData} />
      </TabsContent>

      {/* Produtos */}
      {productsData && (
        <TabsContent value="produtos">
          <ProductsTab data={productsData} />
        </TabsContent>
      )}

      {/* Serviços */}
      {servicesData && (
        <TabsContent value="servicos">
          <ServicesTab data={servicesData} />
        </TabsContent>
      )}

      {/* Entregas */}
      {operationsData && (
        <TabsContent value="entregas">
          <OperationsTab data={operationsData} />
        </TabsContent>
      )}

      {/* Ordens de Serviço */}
      <TabsContent value="ordens-servico">
        <ServiceOrdersSection servicesData={servicesData} />
      </TabsContent>

      {/* Financeiro */}
      {financialData && (
        <TabsContent value="financeiro">
          <FinancialTab data={financialData} />
        </TabsContent>
      )}

      {/* Clientes */}
      <TabsContent value="clientes">
        <CustomersSection />
      </TabsContent>

      {/* Marketing */}
      <TabsContent value="marketing">
        <MarketingSection />
      </TabsContent>

      {/* Produtividade */}
      <TabsContent value="produtividade">
        <ProductivitySection />
      </TabsContent>

      {/* Trocas/Devoluções */}
      <TabsContent value="trocas">
        <ReturnsSection />
      </TabsContent>
    </Tabs>
  )
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border">
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-3">{title}</h3>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body">{description}</p>
    </div>
  )
}

function GeneralOverviewSection({
  sells,
  productsData,
  servicesData,
  financialData,
  operationsData,
}: {
  sells: string[]
  productsData: ProductsDashboardData | null
  servicesData: ServicesDashboardData | null
  financialData: FinancialDashboardData | null
  operationsData: OperationsDashboardData | null
}) {
  const metrics: Metric[] = []
  if (financialData?.metrics) metrics.push(...financialData.metrics.slice(0, 3))
  if (productsData?.metrics) metrics.push(...productsData.metrics.slice(0, 2))
  if (servicesData?.metrics) metrics.push(...servicesData.metrics.slice(0, 1))
  if (operationsData?.metrics) metrics.push(...operationsData.metrics.slice(0, 2))

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.slice(0, 8).map((metric, i) => (
          <div
            key={i}
            className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border"
          >
            <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">
              {metric.title}
            </span>
            <div className="text-[28px] font-bold text-brand-dark dark:text-dark-heading tracking-tight mt-1">
              {metric.value}
            </div>
            {metric.trend && (
              <span className={`text-xs font-semibold mt-2 inline-block ${
                metric.tone === "green" ? "text-brand-green" :
                metric.tone === "red" ? "text-[#cc4745]" :
                "text-brand-inactive-text"
              }`}>
                {metric.trend}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Indicadores Rápidos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {productsData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Produtos ativos</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {productsData.metrics.find(m => m.title.includes("ativos"))?.value || "-"}
              </div>
            </div>
          )}
          {servicesData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Agendamentos hoje</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {servicesData.metrics.find(m => m.title.includes("hoje"))?.value || "-"}
              </div>
            </div>
          )}
          {financialData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Saldo atual</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {financialData.metrics.find(m => m.title.includes("Saldo"))?.value || "-"}
              </div>
            </div>
          )}
          {operationsData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Entregas pendentes</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {operationsData.metrics.find(m => m.title.includes("pendentes"))?.value || "-"}
              </div>
            </div>
          )}
        </div>
      </div>

      <SectionPlaceholder
        title="Análise Completa"
        description="Acesse as abas específicas para análises detalhadas de cada área do seu negócio."
      />
    </div>
  )
}

function SalesSection({ productsData }: { productsData: ProductsDashboardData | null }) {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {productsData ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {productsData.metrics.slice(0, 3).map((metric, i) => (
              <div key={i} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">{metric.title}</span>
                <div className="text-[28px] font-bold text-brand-dark dark:text-dark-heading tracking-tight mt-1">{metric.value}</div>
                {metric.trend && <span className="text-xs font-semibold mt-2 inline-block text-brand-inactive-text">{metric.trend}</span>}
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Resumo de Vendas</h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-6">
              Os dados de vendas consolidados estão disponíveis nas abas Produtos e Serviços.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-[16px] border border-brand-border dark:border-dark-border">
                <div className="text-[13px] font-semibold text-brand-inactive-text">Produtos</div>
                <div className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-1">
                  {productsData.metrics[0]?.value || "R$ 0,00"}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <SectionPlaceholder
          title="Módulo de Vendas"
          description="Ative o módulo de produtos para visualizar relatórios de vendas."
        />
      )}
    </div>
  )
}

function ServiceOrdersSection({ servicesData }: { servicesData: ServicesDashboardData | null }) {
  const todayAppts = servicesData?.todayAppointments || []

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {servicesData ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {servicesData.metrics.slice(0, 6).map((metric, i) => (
              <div key={i} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">{metric.title}</span>
                <div className="text-[28px] font-bold text-brand-dark dark:text-dark-heading tracking-tight mt-1">{metric.value}</div>
                {metric.detail && <span className="text-xs text-brand-inactive-text mt-1 inline-block">{metric.detail}</span>}
              </div>
            ))}
          </div>
          {todayAppts.length > 0 && (
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Ordens de Serviço de Hoje</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap min-w-[400px]">
                  <thead>
                    <tr className="border-b border-brand-border dark:border-dark-border">
                      <th className="pb-3 text-[13px] font-semibold text-brand-inactive-text">Cliente</th>
                      <th className="pb-3 text-[13px] font-semibold text-brand-inactive-text">Serviço</th>
                      <th className="pb-3 text-[13px] font-semibold text-brand-inactive-text">Horário</th>
                      <th className="pb-3 text-[13px] font-semibold text-brand-inactive-text">Profissional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayAppts.slice(0, 8).map((item) => (
                      <tr key={item.id} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[60px]">
                        <td className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">{item.title}</td>
                        <td className="text-[14px] text-brand-inactive-text">{item.subtitle}</td>
                        <td className="text-[14px] text-brand-inactive-text">{item.meta}</td>
                        <td className="text-[14px] text-brand-dark dark:text-dark-heading">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <SectionPlaceholder
          title="Ordens de Serviço"
          description="Ative o módulo de serviços para acompanhar as ordens de serviço."
        />
      )}
    </div>
  )
}

function CustomersSection() {
  return (
    <SectionPlaceholder
      title="Relatórios de Clientes"
      description="Análise de clientes, recência, frequência e valor (RFV) — disponível em breve. Acesse a lista completa de clientes em Clientes &gt; Lista."
    />
  )
}

function MarketingSection() {
  return (
    <SectionPlaceholder
      title="Relatórios de Marketing"
      description="Desempenho de campanhas, cupons e canais de aquisição — disponível em breve. Gerencie seus cupons em Marketing &gt; Cupons."
    />
  )
}

function ProductivitySection() {
  return (
    <SectionPlaceholder
      title="Relatórios de Produtividade"
      description="Desempenho da equipe, metas e comissões. Acesse os relatórios completos em Produtividade na barra lateral."
    />
  )
}

function ReturnsSection() {
  return (
    <SectionPlaceholder
      title="Relatórios de Trocas e Devoluções"
      description="Taxa de devolução, motivos e impacto financeiro — disponível em breve. Gerencie devoluções em Vendas &gt; Devoluções."
    />
  )
}
