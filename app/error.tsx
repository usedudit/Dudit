"use client"

import { useEffect } from "react"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { InfoCard } from "@/components/reusable/InfoCard"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col min-h-screen">
      <MarketplaceHeader />

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 mt-20 md:mt-32">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <IconPlaceholder
            placeholderType="image"
            imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
            imageAlt="Erro"
            title="Ops! Algo deu errado por aqui"
            subtitle="Algo inesperado aconteceu. Tente novamente em alguns instantes."
            itemButton={{
              text: "Voltar para o início",
              action: "/"
            }}
          />

          <div className="w-full mt-12 max-w-lg">
            <InfoCard
              color="red"
              title="Detalhes do erro"
              message={
                <div className="flex flex-col gap-1">
                  <p className="text-xs break-all">
                    {error.message || "Erro desconhecido"}
                  </p>
                  {error.digest && (
                    <p className="text-[10px] opacity-70">
                      ID: {error.digest}
                    </p>
                  )}
                </div>
              }
            />
          </div>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  )
}
