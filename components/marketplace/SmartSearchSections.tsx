"use client"

import React from "react"
import { Badge, FormSection, Tooltip } from "@/components/reusable"
import type { ParsedSearchIntent } from "@/lib/search/intent-parser"
import type { ProximityRingsResult } from "@/lib/search/proximity-rings"
import { SparklesIcon } from "@/lib/icons"

interface SmartSearchBadgeProps {
  query: string
  searchIntent: ParsedSearchIntent | null
  nearbyCount: number
  regionalCount: number
  nationalShippingCount: number
}

/**
 * Badge verde compacta (apenas ícone Sparkles) para a barra de filtros,
 * exibindo os detalhes da busca inteligente apenas no Tooltip ao passar o mouse.
 */
export const SmartSearchBadge: React.FC<SmartSearchBadgeProps> = ({
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

  const tooltipContent = (
    <div className="space-y-1.5 text-left">
      <div className="font-semibold">
        {isServiceMode ? (
          <>
            Busca inteligente · Modo serviço ({searchIntent.cleanQuery})
            {searchIntent.timeWindow ? ` · ${searchIntent.timeWindow.label}` : ""}
          </>
        ) : (
          <>Busca inteligente por proximidade ({searchIntent.cleanQuery})</>
        )}
      </div>
      <div className="opacity-85 space-y-0.5 text-[11px]">
        {nearbyCount > 0 && <div>• {nearbyCount} resultado(s) perto de você</div>}
        {regionalCount > 0 && <div>• {regionalCount} em cidades vizinhas</div>}
        {nationalShippingCount > 0 && <div>• {nationalShippingCount} enviam para o seu CEP</div>}
        {isServiceMode && searchIntent.timeWindow && (
          <div>• Horários futuros verificados na agenda</div>
        )}
      </div>
    </div>
  )

  return (
    <Tooltip text={tooltipContent}>
      <span
        tabIndex={0}
        aria-label="Detalhes da busca inteligente"
        className="inline-flex shrink-0 cursor-default outline-none"
      >
        <Badge variant="green" icon={<SparklesIcon />} className="w-7 h-7 p-1.5" />
      </span>
    </Tooltip>
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
        <FormSection title="Vendedores que enviam para o seu CEP" hasSeparator={hasRegional ? true : false}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
            {rings.nationalShipping.map((item) => renderDistantItem(item))}
          </div>
        </FormSection>
      )}

      {/* Fallback: Outras opções distantes */}
      {hasOther && (
        <FormSection title="Outras opções em todo o Brasil" hasSeparator={hasRegional || hasNational}>
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
        </FormSection>
      )}
    </div>
  )
}
