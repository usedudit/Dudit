"use client"

import React, { useState, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button, InfoCard } from "@/components/reusable"
import { CheckCircleIcon, ChevronLeftIcon } from "@/lib/icons"
import { disconnectMercadoPagoAction } from "@/app/actions/mercadopago"
import { generateOAuthState } from "@/lib/security/oauth-state"
import { FadeIn } from "@/components/animations/FadeIn"

// ─── Integration Card (same style as IntegrationsPage.tsx) ───────────────────

export const IntegrationCard = ({
  name,
  description,
  status,
  colorClass,
  icon: Icon,
  children,
}: {
  name: string
  description: string
  status: "connected" | "disconnected"
  colorClass: string
  icon: any
  children: React.ReactNode
}) => (
  <div className="border border-brand-border dark:border-dark-border rounded-xl p-5 flex flex-col h-full bg-white dark:bg-dark-surface hover:shadow-sm transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${colorClass}`}>
        <Icon size={24} />
      </div>
      {status === "connected" ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircleIcon size={12} />
          Conectado
        </span>
      ) : (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          Desconectado
        </span>
      )}
    </div>
    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-2">{name}</h3>
    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-6 flex-1">{description}</p>
    {children}
  </div>
)

// ─── Mercado Pago icon ────────────────────────────────────────────────────────

export const MercadoPagoIcon = () => (
  <svg viewBox="0 0 48 48" width="24" height="24" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="24" fill="white" fillOpacity="0.2" />
    <path
      d="M24 10C16.268 10 10 16.268 10 24c0 7.732 6.268 14 14 14 7.732 0 14-6.268 14-14 0-7.732-6.268-14-14-14zm6.5 16.5h-5v5h-3v-5h-5v-3h5v-5h3v5h5v3z"
      fill="white"
    />
  </svg>
)

export const IntegrationsSubPage = ({
  partner,
  mpConnected,
  onBack,
}: {
  partner: any
  mpConnected: boolean
  onBack: () => void
}) => {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)

  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const handleConnect = async () => {
    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")

    if (!clientId) {
      alert("Mercado Pago não configurado. Entre em contato com o suporte.")
      return
    }

    if (!appUrl) {
      alert("URL da aplicação não configurada.")
      return
    }

    setIsLoading(true)
    try {
      const signedState = await generateOAuthState(partner.id, partner.user_id)
      const redirectUri = `${appUrl}/api/mercadopago/oauth/callback`

      const authUrl = `https://auth.mercadopago.com.br/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${encodeURIComponent(signedState)}&redirect_uri=${encodeURIComponent(redirectUri)}`

      window.location.href = authUrl
    } catch (err) {
      alert("Erro ao iniciar conexão com Mercado Pago. Tente novamente.")
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Tem certeza que deseja desconectar sua conta do Mercado Pago? Você não poderá mais receber pagamentos online.",
      )
    ) {
      return
    }

    setIsLoading(true)
    const result = await disconnectMercadoPagoAction()

    if (result.error) {
      alert(`Erro: ${result.error}`)
    }
    setIsLoading(false)
  }

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

          {/* Sticky Header */}
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

              {/* Back button — desktop only */}
              <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </div>

              {/* Title row */}
              <div className="hidden md:flex items-start justify-between pb-4">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                    <span className="truncate">Integrações</span>
                  </h1>

                  <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                    Conecte sua loja com ferramentas externas e meios de pagamento.
                  </div>
                </div>

                {/* Desktop action buttons */}
                <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                  <Button variant="outline" onClick={onBack} className="px-5 h-[42px]">
                    Voltar
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto">
            {searchParams.get("mp_connected") === "true" && (
              <InfoCard
                message="Mercado Pago conectado com sucesso! Agora você pode receber pagamentos online."
                color="green"
                className="mb-6"
              />
            )}

            {searchParams.get("mp_error") && (
              <InfoCard
                message={`Erro ao conectar Mercado Pago: ${searchParams.get("mp_error")}`}
                color="red"
                className="mb-6"
              />
            )}

            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Pagamentos</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <IntegrationCard
                name="Mercado Pago"
                description="Conecte sua conta para receber pagamentos online com split automático. Aceite cartões, PIX e boleto."
                status={mpConnected ? "connected" : "disconnected"}
                colorClass="bg-blue-500"
                icon={MercadoPagoIcon}
              >
                {mpConnected ? (
                  <Button variant="destructive" onClick={handleDisconnect} isLoading={isLoading}>
                    Desconectar Mercado Pago
                  </Button>
                ) : (
                  <Button onClick={handleConnect} className="w-full">
                    Conectar com Mercado Pago
                  </Button>
                )}
              </IntegrationCard>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Action Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 h-[48px] font-bold"
          >
            Voltar
          </Button>
        </div>
      </div>
    </FadeIn>
  )
}
