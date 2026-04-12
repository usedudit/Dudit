"use client"

import React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/reusable"
import { ChevronLeftIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"

interface SimpleSettingsSubPageProps {
  title: string
  description?: string
  onBack: () => void
}

export function SimpleSettingsSubPage({ title, description, onBack }: SimpleSettingsSubPageProps) {
  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 py-6 flex items-center justify-between">
            {/* Back button - desktop only */}
            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500`}>
              <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>

            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading truncate">
                {title}
              </h1>
              {description && (
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                  {description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onBack}>
                Voltar
              </Button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-3 md:px-6 py-12 max-w-[1300px] mx-auto flex flex-col items-center justify-center text-center">
          <div className="w-48 h-48 mb-8 bg-brand-gray dark:bg-dark-surface rounded-full flex items-center justify-center">
            <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Em construção" className="w-32 h-32 object-contain" />
          </div>
          <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Em breve!</h2>
          <p className="text-brand-inactive-text dark:text-dark-body max-w-md">
            Estamos trabalhando para trazer as configurações de <strong>{title.toLowerCase()}</strong> para você.
            Em breve esta funcionalidade estará disponível.
          </p>
        </div>
      </div>
    </FadeIn>
  )
}
