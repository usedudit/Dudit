"use client"

import { Button, IconPlaceholder, InfoCard } from "@/components/reusable"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"

interface CheckoutErrorScreenProps {
  message?: string | null
  onRetry: () => void
}

export function CheckoutErrorScreen({ message, onRetry }: CheckoutErrorScreenProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-dark-surface">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <IconPlaceholder
          placeholderType="image"
          imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
          imageAlt="Erro"
          title="Ops! Algo deu errado por aqui"
          subtitle="Algo inesperado aconteceu. Tente novamente em alguns instantes."
        />

        {message && (
          <div className="w-full max-w-md mb-6">
            <InfoCard message={message} color="red" />
          </div>
        )}

        <div className="w-full max-w-md flex flex-col gap-4">
          <Button onClick={onRetry} className="w-full h-12">
            Voltar e tentar novamente
          </Button>
        </div>
      </div>

      <MarketplaceFooter />
    </div>
  )
}
