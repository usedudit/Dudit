"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Portal from "../Portal"
import { CloseIcon, SparklesIcon, CheckIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { Button } from "@/components/reusable/Button"

interface NcmSuggestion {
  ncm: string
  description: string
  confidence: "alto" | "médio" | "baixo"
  reasoning: string
  taxData: {
    nacionalFederal: number
    importadosFederal: number
    estadual: number
    municipal: number
  } | null
  hasCest: boolean
  cestCount: number
  inDatabase: boolean
}

interface NcmSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  suggestions: NcmSuggestion[]
  onSelect: (suggestion: NcmSuggestion) => void
  isLoading?: boolean
}

const ConcentricCircles: React.FC = () => (
  <svg
    width="256"
    height="256"
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-border dark:text-dark-border/50 pointer-events-none"
  >
    <defs>
      <radialGradient
        id="radial-mask-gradient-ncm"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(128 128) rotate(90) scale(128)"
      >
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </radialGradient>
      <mask id="radial-mask-ncm" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
        <rect width="256" height="256" fill="url(#radial-mask-gradient-ncm)" />
      </mask>
    </defs>
    <g mask="url(#radial-mask-ncm)">
      <circle cx="128" cy="128" r="32" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="64" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="96" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="128" stroke="currentColor" strokeWidth="1" />
    </g>
  </svg>
)

export default function NcmSelectionModal({
  isOpen,
  onClose,
  suggestions,
  onSelect,
  isLoading = false,
}: NcmSelectionModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const safeSuggestions = suggestions || []

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    } else {
      setIsAnimating(false)
    }
  }, [isOpen])

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(onClose, 200)
  }

  const handleSelect = (suggestion: NcmSuggestion) => {
    setIsAnimating(false)
    setTimeout(() => onSelect(suggestion), 200)
  }

  const getConfidenceBadge = (confidence: string) => {
    const styles = {
      alto: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
      médio: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
      baixo: "bg-red-100 dark:bg-red-900/30 text-brand-red dark:text-red-400",
    }
    return styles[confidence as keyof typeof styles] || styles.baixo
  }

  if (!isOpen) return null

  if (isMobile) {
    return (
      <BottomSheet isOpen={isAnimating} onClose={handleClose}>
        <div className="flex flex-col gap-4 pt-0 pb-4 relative">
          <div className="relative flex shrink-0 items-center justify-center h-12 w-12 rounded-full bg-brand-blue-light dark:bg-brand-blue/30 mb-2 mx-auto">
            <SparklesIcon className="h-6 w-6 text-brand-blue-dark dark:text-brand-blue" />
          </div>
          <div className="z-10 flex flex-col gap-1 text-center">
            <h3 className="text-lg font-semibold text-brand-dark dark:text-dark-heading">Selecione o NCM Correto</h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              A IA encontrou {safeSuggestions.length} possíveis códigos NCM. Selecione o mais adequado.
            </p>
          </div>
          <div className="z-10 w-full space-y-3 max-h-96 overflow-y-auto">
            {safeSuggestions.map((suggestion) => (
              <div
                key={suggestion.ncm}
                className="border border-brand-border dark:border-dark-border rounded-lg p-4 hover:border-brand-blue dark:hover:border-brand-blue transition-colors bg-white dark:bg-dark-surface"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-base font-semibold text-brand-dark dark:text-dark-heading">
                        {suggestion.ncm}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getConfidenceBadge(suggestion.confidence)}`}
                      >
                        {suggestion.confidence}
                      </span>
                      {suggestion.hasCest && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          {suggestion.cestCount} CEST
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-2">
                      {suggestion.description}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body italic">
                      {suggestion.reasoning}
                    </p>

                    {suggestion.taxData && (
                      <div className="mt-3 pt-3 border-t border-brand-border dark:border-dark-border grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Fed. Nacional:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.nacionalFederal}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Fed. Importado:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.importadosFederal}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Estadual:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.estadual}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Municipal:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.municipal}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Button onClick={() => handleSelect(suggestion)} className="w-full mt-3">
                  <CheckIcon className="w-4 h-4 mr-2" />
                  Selecionar
                </Button>
              </div>
            ))}
          </div>
          <div className="z-10 w-full pt-4">
            <Button variant="outline" onClick={handleClose} className="w-full bg-transparent">
              Cancelar
            </Button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
          onClick={handleClose}
        ></div>
        <div
          className={`relative bg-white dark:bg-dark-surface rounded-2xl shadow-lg w-full max-w-3xl max-h-[85vh] transition-all duration-200 ease-out flex flex-col overflow-hidden ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        >
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading z-10"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
          <div className="flex flex-col gap-4 px-6 pt-6 relative">
            <div className="relative w-max">
              <ConcentricCircles />
              <div className="relative flex shrink-0 items-center justify-center h-12 w-12 rounded-full bg-brand-blue-light dark:bg-brand-blue/30">
                <SparklesIcon className="h-6 w-6 text-brand-blue-dark dark:text-brand-blue" />
              </div>
            </div>
            <div className="z-10 flex flex-col gap-0.5">
              <h3 className="text-md font-semibold text-brand-dark dark:text-dark-heading">Selecione o NCM Correto</h3>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                A IA encontrou {safeSuggestions.length} possíveis códigos NCM para este produto. Selecione o mais
                adequado.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
            {safeSuggestions.map((suggestion) => (
              <div
                key={suggestion.ncm}
                className="border border-brand-border dark:border-dark-border rounded-lg p-4 hover:border-brand-blue dark:hover:border-brand-blue transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-lg font-semibold text-brand-dark dark:text-dark-heading">
                        {suggestion.ncm}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getConfidenceBadge(suggestion.confidence)}`}
                      >
                        Confiança: {suggestion.confidence}
                      </span>
                      {suggestion.hasCest && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          {suggestion.cestCount} CEST disponível{suggestion.cestCount > 1 ? "eis" : ""}
                        </span>
                      )}
                      {!suggestion.inDatabase && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 dark:bg-orange-900/30 text-brand-orange dark:text-orange-400">
                          Não encontrado no banco
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-2">
                      {suggestion.description}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body italic">
                      {suggestion.reasoning}
                    </p>

                    {suggestion.taxData && (
                      <div className="mt-3 pt-3 border-t border-brand-border dark:border-dark-border grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Federal Nacional:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.nacionalFederal}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Federal Importado:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.importadosFederal}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Estadual:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.estadual}%
                          </span>
                        </div>
                        <div>
                          <span className="text-brand-inactive-text dark:text-dark-body">Municipal:</span>{" "}
                          <span className="font-medium text-brand-dark dark:text-dark-heading">
                            {suggestion.taxData.municipal}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => handleSelect(suggestion)} className="ml-4 shrink-0">
                    <CheckIcon className="w-4 h-4 mr-1" />
                    Selecionar
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="z-10 flex flex-1 flex-col gap-3 p-6 pt-4 border-t border-brand-border dark:border-dark-border">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
