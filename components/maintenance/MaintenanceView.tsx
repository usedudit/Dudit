"use client"

import { useState } from "react"
import { InfoCard } from "@/components/reusable"
import type { MaintenanceConfig } from "@/lib/system/types"

interface MaintenanceViewProps {
  initialConfig?: Partial<MaintenanceConfig>
}

export function MaintenanceView({ initialConfig }: MaintenanceViewProps) {
  const [message] = useState(
    initialConfig?.message ||
    "Estamos realizando uma manutenção programada para trazer melhorias na plataforma Dudit. Voltaremos em breve!"
  )
  const [estimatedEnd] = useState<string | null>(initialConfig?.estimated_end || null)

  const formatEstimatedEnd = (iso: string) => {
    const d = new Date(iso)
    const date = d.toLocaleDateString("pt-BR")
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    return `Retorno previsto para ${date} às ${time}`
  }

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background transition-colors duration-300">
      <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
        <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
          <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </a>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 mt-20 md:mt-32">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <img
            src="https://img.dudit.com.br/static/mascots/Manutencao.png"
            alt="Manutenção"
            className="w-72 h-72 mb-4 object-contain"
          />

          <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2 text-center">
            Estamos em manutenção
          </h1>

          <p className="text-brand-inactive-text dark:text-dark-body max-w-sm text-center">
            {message}
          </p>

          {estimatedEnd && (
            <InfoCard
              title="Previsão estimada de retorno"
              message={formatEstimatedEnd(estimatedEnd)}
              color="gray"
              className="mt-6"
            />
          )}
        </div>
      </main>

      <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark dark:bg-dark-surface">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
          <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
            © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os
            direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
