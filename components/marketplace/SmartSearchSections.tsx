"use client"

import React from "react"
import { Calendar, Clock, MapPin, Package, Sparkles, Truck } from "lucide-react"
import type { ParsedSearchIntent } from "@/lib/search/intent-parser"
import type { ProximityRingsResult } from "@/lib/search/proximity-rings"

interface SmartSearchIntentBannerProps {
  query: string
  searchIntent: ParsedSearchIntent | null
  nearbyCount: number
  regionalCount: number
  nationalShippingCount: number
}

/**
 * Faixa contextual leve exibida quando a busca detecta intenção em linguagem natural,
 * janela de horário/agendamento (serviços) ou anéis de proximidade/envio nacional.
 */
export const SmartSearchIntentBanner: React.FC<SmartSearchIntentBannerProps> = ({
  query,
  searchIntent,
  nearbyCount,
  regionalCount,
  nationalShippingCount,
}) => {
  if (!query || !searchIntent) return null

  const isServiceMode = searchIntent.intent === "service" || Boolean(searchIntent.timeWindow)
  const wasCleaned =
    searchIntent.cleanQuery &&
    searchIntent.cleanQuery.toLowerCase() !== query.trim().toLowerCase()
  const hasMultiRing = regionalCount > 0 || nationalShippingCount > 0

  if (!isServiceMode && !wasCleaned && !hasMultiRing && searchIntent.source === "rules") {
    return null
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-border/80 dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/20 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-brand-dark dark:text-dark-heading">
        {isServiceMode ? (
          <Calendar className="w-3.5 h-3.5 text-brand-green shrink-0" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-brand-green shrink-0" />
        )}
        <span className="font-medium">
          {isServiceMode ? (
            <>
              Modo serviço para <strong className="font-bold">{searchIntent.cleanQuery}</strong>
              {searchIntent.timeWindow ? (
                <>
                  {" "}
                  · <span className="text-brand-green font-semibold">{searchIntent.timeWindow.label}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              Buscando <strong className="font-bold">{searchIntent.cleanQuery}</strong> por proximidade
            </>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-brand-inactive-text dark:text-dark-body">
        {nearbyCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border px-2 py-0.5">
            <MapPin className="w-3 h-3 text-brand-green" />
            {nearbyCount} perto de você
          </span>
        )}
        {regionalCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border px-2 py-0.5">
            <Package className="w-3 h-3 text-brand-dark/70 dark:text-dark-body" />
            {regionalCount} na região
          </span>
        )}
        {nationalShippingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border px-2 py-0.5">
            <Truck className="w-3 h-3 text-brand-green" />
            {nationalShippingCount} enviam p/ seu CEP
          </span>
        )}
        {isServiceMode && searchIntent.timeWindow && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-green/10 text-brand-green font-medium px-2 py-0.5">
            <Clock className="w-3 h-3" />
            Agenda verificada
          </span>
        )}
      </div>
    </div>
  )
}

interface ProximityRingsSectionProps {
  rings: ProximityRingsResult<any> | null
  currentType: string
  renderDistantItem: (item: any) => React.ReactNode
  fallbackSellers: any[]
  fallbackItems: any[]
}

/**
 * Renderiza os resultados além da cidade atual em anéis claros:
 * 1. Cidades vizinhas / Região
 * 2. Enviam para o seu CEP (Brasil)
 * 3. Outras opções distantes (fallback)
 */
export const ProximityRingsSection: React.FC<ProximityRingsSectionProps> = ({
  rings,
  currentType,
  renderDistantItem,
  fallbackSellers,
  fallbackItems,
}) => {
  const showVitrines = currentType === "tudo" || currentType === "vitrines" || currentType === "negocios"

  if (!rings) {
    if (fallbackSellers.length === 0 && fallbackItems.length === 0) return null
    return (
      <div className="mt-12 pt-8 border-t border-brand-border dark:border-dark-border">
        <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-4">
          Um pouco mais distante do seu raio de busca
        </h2>

        {fallbackSellers.length > 0 && showVitrines && (
          <>
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Lojas e vitrines</h3>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
              {fallbackSellers.map((vitrine) => renderDistantItem(vitrine))}
            </div>
          </>
        )}

        {fallbackItems.length > 0 && (
          <>
            {fallbackSellers.length > 0 && <div className="h-px bg-brand-border dark:border-dark-border my-4" />}
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Produtos e serviços</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
              {fallbackItems.map((item) => renderDistantItem(item))}
            </div>
          </>
        )}
      </div>
    )
  }

  const regionalSellers = showVitrines ? rings.regionalSellers : []
  const otherSellers = showVitrines ? rings.otherDistantSellers : []

  const hasRegional = regionalSellers.length > 0 || rings.regional.length > 0
  const hasNational = rings.nationalShipping.length > 0
  const hasOther = otherSellers.length > 0 || rings.otherDistant.length > 0

  if (!hasRegional && !hasNational && !hasOther) return null

  return (
    <div className="mt-12 pt-8 border-t border-brand-border dark:border-dark-border space-y-10">
      {/* Anel 2: Cidades vizinhas / Região */}
      {hasRegional && (
        <section>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-brand-green shrink-0" />
            <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">
              Em cidades vizinhas e na sua região
            </h2>
          </div>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
            Lojas, produtos e profissionais próximos fora da sua cidade
          </p>

          {regionalSellers.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Lojas e vitrines</h3>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
                {regionalSellers.map((vitrine) => renderDistantItem(vitrine))}
              </div>
            </div>
          )}

          {rings.regional.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
              {rings.regional.map((item) => renderDistantItem(item))}
            </div>
          )}
        </section>
      )}

      {/* Anel 3: Vendedores nacionais com envio para o CEP */}
      {hasNational && (
        <section className={hasRegional ? "pt-6 border-t border-brand-border/60 dark:border-dark-border" : ""}>
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-brand-green shrink-0" />
            <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">
              Vendedores que enviam para o seu CEP
            </h2>
          </div>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
            Envio nacional por transportadora ou Correios
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
            {rings.nationalShipping.map((item) => renderDistantItem(item))}
          </div>
        </section>
      )}

      {/* Fallback: Outras opções distantes */}
      {hasOther && (
        <section className={hasRegional || hasNational ? "pt-6 border-t border-brand-border/60 dark:border-dark-border" : ""}>
          <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-4">
            Outras opções em todo o Brasil
          </h2>

          {otherSellers.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Lojas e vitrines</h3>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
                {otherSellers.map((vitrine) => renderDistantItem(vitrine))}
              </div>
            </div>
          )}

          {rings.otherDistant.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
              {rings.otherDistant.map((item) => renderDistantItem(item))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
