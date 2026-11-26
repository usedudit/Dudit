"use client"

import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from "react"
import { DefaultModal, ListItem, Input, RadioButton, Button, IconPlaceholder } from "@/components/reusable"
import { MapPin, Check, ChevronDown, Globe } from "lucide-react"
import { SearchIcon, XIcon } from "@/lib/icons"
import { getCitiesData } from "@/lib/data/cities-loader"
import { resolveCityAccentBatch } from "@/app/actions/marketplace/search"
import { ESTADO_MAP } from "./explorar-constants"
import { trackExplicitDemandAction } from "@/app/actions/admin/analytics"
import { trackEvent } from "@/lib/analytics"

function getStateFromCitySlug(citySlug: string | null | undefined): string {
    if (!citySlug || citySlug === "brasil") return "brasil"
    if (citySlug.startsWith("estado-")) return citySlug.replace("estado-", "").toLowerCase()
    const parts = citySlug.split("-")
    const uf = parts.pop()?.toLowerCase() || ""
    return uf.length === 2 ? uf : "brasil"
}

interface ExplorarCityModalProps {
    isOpen: boolean
    onClose: () => void
    selectedCitySlug: string | null
    formatCitySlug: (slug: string | null) => string
    onSelectCity: (citySlug: string | null) => void
    onRequestLocation: () => void
    onLoginClick: () => void
    isLoggedIn: boolean
    onAccentsResolved?: (resolved: Record<string, string>) => void
}

export const ExplorarCityModal = memo(function ExplorarCityModal({
    isOpen,
    onClose,
    selectedCitySlug,
    formatCitySlug,
    onSelectCity,
    onRequestLocation,
    onLoginClick,
    isLoggedIn,
    onAccentsResolved,
}: ExplorarCityModalProps) {
    const [showStateDropdown, setShowStateDropdown] = useState(false)
    const [selectedStateFilter, setSelectedStateFilter] = useState<string>(() => getStateFromCitySlug(selectedCitySlug))
    const [citySearchText, setCitySearchText] = useState("")
    const [citiesData, setCitiesData] = useState<string[]>([])
    const stateDropdownRef = useRef<HTMLDivElement>(null)
    const cityAccentFetchDoneRef = useRef(false)

    useEffect(() => {
        if (isOpen) {
            setSelectedStateFilter(getStateFromCitySlug(selectedCitySlug))
        } else {
            setShowStateDropdown(false)
            setCitySearchText("")
        }
    }, [isOpen, selectedCitySlug])

    useEffect(() => {
        if (!isOpen) return
        getCitiesData().then((cities) => {
            setCitiesData(cities)
            if (!cityAccentFetchDoneRef.current) {
                cityAccentFetchDoneRef.current = true
                resolveCityAccentBatch(cities.slice(0, 200)).then((resolved) => {
                    if (Object.keys(resolved).length > 0) {
                        onAccentsResolved?.(resolved)
                    }
                }).catch(() => { })
            }
        }).catch(() => { })
    }, [isOpen, onAccentsResolved])

    useEffect(() => {
        if (!showStateDropdown) return
        const handleClickOutside = (e: MouseEvent) => {
            if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
                setShowStateDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showStateDropdown])

    const filteredCitiesSuggestions = useMemo(() => {
        if (!citySearchText) return []
        const q = citySearchText
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[-\s]+/g, " ")
            .trim()
        return citiesData
            .filter((slug: string) => {
                if (selectedStateFilter !== "brasil") {
                    const cityState = slug.split("-").pop()?.toLowerCase()
                    if (cityState !== selectedStateFilter) return false
                }
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 5)
    }, [citySearchText, citiesData, selectedStateFilter])

    if (!isOpen) return null

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            maxWidth="md"
            hideHeader={true}
        >
            <div className="flex flex-col relative text-[#003229]">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                    title="Fechar"
                >
                    <XIcon size={16} />
                </button>

                {/* Header with gradient and mascot */}
                <div
                    className="h-[200px] rounded-2xl flex items-end justify-center mb-6 relative overflow-hidden"
                    style={{ background: "linear-gradient(180deg, #0d5e49 0%, var(--brand-dark) 100%)" }}
                >
                    <img
                        src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                        alt="Onde você está?"
                        className="w-48 h-auto object-contain transform translate-y-4"
                    />
                </div>

                <h4 className="text-xl font-bold text-brand-dark mb-4 text-center dark:text-dark-heading">Onde você está?</h4>
                <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed dark:text-dark-body">
                    Informe sua cidade para ver os produtos, vitrines e serviços pertinho de você.
                </p>

                <div className="space-y-4">
                    {/* Location scope selector: Brasil / Estado */}
                    <div className="relative" ref={stateDropdownRef}>
                        <button
                            onClick={() => setShowStateDropdown(!showStateDropdown)}
                            className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20 rounded-lg border border-brand-border dark:border-dark-border"
                        >
                            <span className="flex items-center gap-3">
                                {selectedStateFilter === "brasil" ? (
                                    <Globe className="w-4 h-4 text-brand-green" />
                                ) : (
                                    <MapPin className="w-4 h-4 text-brand-green" />
                                )}
                                <span>
                                    {selectedStateFilter === "brasil" ? "Brasil" : ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}
                                </span>
                            </span>
                            <ChevronDown className={`w-4 h-4 text-brand-inactive-text transition-transform ${showStateDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {showStateDropdown && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                <button
                                    onClick={() => {
                                        setSelectedStateFilter("brasil")
                                        setShowStateDropdown(false)
                                        setCitySearchText("")
                                        onSelectCity("brasil")
                                        onClose()
                                    }}
                                    className="w-full text-left px-4 py-3 flex items-center gap-3 text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                >
                                    <Globe className="w-4 h-4 text-brand-green" />
                                    <span>Brasil (todos os estados)</span>
                                    {selectedStateFilter === "brasil" && <Check className="w-4 h-4 text-brand-green ml-auto" />}
                                </button>
                                {Object.entries(ESTADO_MAP).map(([uf, name]) => (
                                    <button
                                        key={uf}
                                        onClick={() => {
                                            setSelectedStateFilter(uf)
                                            setShowStateDropdown(false)
                                            setCitySearchText("")
                                            onSelectCity(`estado-${uf}`)
                                            onClose()
                                        }}
                                        className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                    >
                                        <span className="flex items-center gap-3">
                                            <MapPin className="w-4 h-4 text-brand-green" />
                                            {name}
                                        </span>
                                        {selectedStateFilter === uf && <Check className="w-4 h-4 text-brand-green" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* City search - filters by selected state */}
                    <div className="relative">
                        <Input
                            placeholder={selectedStateFilter === "brasil" ? "Buscar por cidade... (ex: São Paulo, Bauru)" : `Buscar cidade em ${ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}...`}
                            value={citySearchText}
                            onChange={(e) => setCitySearchText(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                        {filteredCitiesSuggestions.length > 0 && (
                            <div className="flex flex-col gap-1 border-t pt-2">
                                {filteredCitiesSuggestions.map((slug) => (
                                    <button
                                        key={slug}
                                        onClick={() => {
                                            onSelectCity(slug)
                                            onClose()
                                        }}
                                        className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading"
                                    >
                                        <span>{formatCitySlug(slug)}</span>
                                        {selectedCitySlug === slug && <Check className="w-4 h-4 text-brand-green" />}
                                    </button>
                                ))}
                            </div>
                        )}
                        {citySearchText.trim().length >= 2 && filteredCitiesSuggestions.length === 0 && citiesData.length > 0 && (
                            <p className="text-center text-xs text-brand-inactive-text py-3">
                                Nenhuma cidade encontrada{selectedStateFilter !== "brasil" ? ` em ${ESTADO_MAP[selectedStateFilter]}` : ""}
                            </p>
                        )}
                    </div>

                    <Button
                        onClick={() => {
                            onRequestLocation()
                            onClose()
                        }}
                        variant="outline"
                        className="w-full"
                    >
                        <MapPin className="w-4 h-4" />
                        <span>Usar minha localização</span>
                    </Button>

                    {!isLoggedIn && (
                        <div className="text-center mt-8 pt-5 border-t border-brand-border dark:border-dark-border">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Já tem uma conta cadastrada com endereço salvo?
                            </p>
                            <Button
                                onClick={() => {
                                    onClose()
                                    onLoginClick()
                                }}
                                variant="link"
                                className="text-sm mt-1 inline-block"
                            >
                                Entrar na minha conta
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </DefaultModal>
    )
})

interface ExplorarDemandModalProps {
    isOpen: boolean
    onClose: () => void
    defaultTerm: string
    defaultType: "comprar" | "contratar" | "loja"
    selectedCitySlug: string | null
}

export const ExplorarDemandModal = memo(function ExplorarDemandModal({
    isOpen,
    onClose,
    defaultTerm,
    defaultType,
    selectedCitySlug,
}: ExplorarDemandModalProps) {
    const [selectedDemandType, setSelectedDemandType] = useState<string>(defaultType)
    const [demandTerm, setDemandTerm] = useState(defaultTerm)
    const [isSubmittingDemand, setIsSubmittingDemand] = useState(false)
    const [isThankYouOpen, setIsThankYouOpen] = useState(false)
    const isSubmittingDemandRef = useRef(false)

    useEffect(() => {
        if (!isOpen) return
        setDemandTerm(defaultTerm)
        setSelectedDemandType(defaultType)
    }, [isOpen, defaultTerm, defaultType])

    const handleSubmitDemand = useCallback(async () => {
        const term = demandTerm.trim()
        if (!term || isSubmittingDemandRef.current) return

        isSubmittingDemandRef.current = true
        setIsSubmittingDemand(true)
        const demandTypeLabels: Record<string, string> = {
            comprar: "Quero comprar",
            contratar: "Quero contratar",
            loja: "Quero encontrar loja",
            encontrar: "Quero encontrar loja",
        }

        try {
            await trackExplicitDemandAction(
                demandTypeLabels[selectedDemandType] || "Quero comprar",
                term,
                selectedCitySlug || undefined
            )
            trackEvent("search_zero_results", {
                term,
                demand_type: demandTypeLabels[selectedDemandType] || "Quero comprar",
                city: selectedCitySlug,
            })
            setDemandTerm("")
            onClose()
            setIsThankYouOpen(true)
        } catch (err) {
            console.error("[DEMAND_SUBMIT] Erro ao enviar demanda:", err)
        } finally {
            setIsSubmittingDemand(false)
            setTimeout(() => {
                isSubmittingDemandRef.current = false
            }, 800)
        }
    }, [demandTerm, selectedDemandType, selectedCitySlug, onClose])

    return (
        <>
            {isOpen && (
                <DefaultModal
                    isOpen={isOpen}
                    onClose={onClose}
                    title="O que você está procurando?"
                    maxWidth="md"
                >
                    <div className="flex flex-col gap-4 py-2">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Selecione o tipo de demanda e digite o que precisa. Vamos tentar encontrar alguém que possa ajudar!
                        </p>

                        <div className="flex flex-col gap-2.5">
                            <ListItem
                                title="Quero comprar"
                                description="Produtos, peças, eletrônicos, roupas ou itens físicos"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "comprar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("comprar")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="comprar"
                                        checked={selectedDemandType === "comprar"}
                                        onChange={() => setSelectedDemandType("comprar")}
                                    />
                                }
                            />

                            <ListItem
                                title="Quero contratar"
                                description="Serviços, profissionais, reformas, assistências ou diárias"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "contratar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("contratar")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="contratar"
                                        checked={selectedDemandType === "contratar"}
                                        onChange={() => setSelectedDemandType("contratar")}
                                    />
                                }
                            />

                            <ListItem
                                title="Quero encontrar loja ou empresa"
                                description="Estabelecimentos comerciais, empresas locais ou pontos de atendimento"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "loja" || selectedDemandType === "encontrar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("loja")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="loja"
                                        checked={selectedDemandType === "loja" || selectedDemandType === "encontrar"}
                                        onChange={() => setSelectedDemandType("loja")}
                                    />
                                }
                            />
                        </div>

                        <div className="pt-1">
                            <Input
                                label="O que você precisa?"
                                placeholder={
                                    selectedDemandType === "comprar"
                                        ? "Ex: pneu goodyear, notebook dell, camiseta..."
                                        : selectedDemandType === "contratar"
                                            ? "Ex: encanador, eletricista, fotógrafo..."
                                            : "Ex: conserto de ar condicionado, autopeças, pet shop..."
                                }
                                value={demandTerm}
                                onChange={(e) => setDemandTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isSubmittingDemand && demandTerm.trim()) {
                                        e.preventDefault()
                                        handleSubmitDemand()
                                    }
                                }}
                                disabled={isSubmittingDemand}
                                autoFocus
                            />
                        </div>

                        <Button
                            variant="default"
                            className="w-full font-bold"
                            onClick={handleSubmitDemand}
                            disabled={!demandTerm.trim() || isSubmittingDemand}
                            isLoading={isSubmittingDemand}
                        >
                            {isSubmittingDemand ? "Enviando..." : "Enviar"}
                        </Button>
                    </div>
                </DefaultModal>
            )}

            {isThankYouOpen && (
                <DefaultModal
                    isOpen={isThankYouOpen}
                    onClose={() => setIsThankYouOpen(false)}
                    title=""
                    maxWidth="sm"
                    hideHeader
                >
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Feedback.png"
                        imageAlt="Obrigado pelo seu feedback!"
                        title="Obrigado!"
                        subtitle="Recebemos sua demanda! Vamos tentar encontrar alguém que possa te ajudar com isso. Fique de olho nas novidades da Dudit!"
                        itemButton={{
                            text: "Entendido",
                            action: () => setIsThankYouOpen(false),
                            variant: "default"
                        }}
                    />
                </DefaultModal>
            )}
        </>
    )
})
