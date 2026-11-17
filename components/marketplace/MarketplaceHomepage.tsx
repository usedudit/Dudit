"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import MarketplaceFooter from "./MarketplaceFooter"
import { HeroBanner, HorizontalCarousel, ItemCard, VitrineCard } from "./shared-components"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import { HomeSellerBanner } from "./HomeSellerBanner"
import type { SponsoredAd } from "@/lib/ads/types"
import type { HomeSection } from "@/app/actions/marketplace/discover"
import { useRouter } from "next/navigation"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { useNotification } from "@/hooks/use-notification"
import { createAddressAction } from "@/app/actions/shared/addresses"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getCitiesData } from "@/lib/data/cities-loader"
import { MarketplaceLandingView } from "./MarketplaceLandingView"

const COMMON_CITY_ACCENTS: Record<string, string> = {
    "sao-paulo": "São Paulo",
    "cambe": "Cambé",
    "brasilia": "Brasília",
    "goiania": "Goiânia",
    "florianopolis": "Florianópolis",
    "belem": "Belém",
    "sao-luis": "São Luís",
    "maceio": "Maceió",
    "cuiaba": "Cuiabá",
    "macapa": "Macapá",
    "vitoria": "Vitória",
    "ribeirao-preto": "Ribeirão Preto",
    "sao-jose-dos-campos": "São José dos Campos",
    "sao-bernardo-do-campo": "São Bernardo do Campo",
    "sao-caetano-do-sul": "São Caetano do Sul",
    "sao-jose-do-rio-preto": "São José do Rio Preto",
    "sao-goncalo": "São Gonçalo",
    "sao-joao-de-meriti": "São João de Meriti",
    "sao-jose": "São José",
    "petropolis": "Petrópolis",
    "teresopolis": "Teresópolis",
    "sao-carlos": "São Carlos",
    "chapeco": "Chapecó",
    "marilia": "Marília",
    "paranagua": "Paranaguá",
    "cacador": "Caçador",
    "criciuma": "Criciúma",
    "tubarao": "Tubarão",
    "blumenau": "Blumenau",
    "joinville": "Joinville",
    "itajai": "Itajaí",
    "balneario-camboriu": "Balneário Camboriú",
    "sao-francisco-do-sul": "São Francisco do Sul",
    "sao-joaquim": "São João",
    "caxias-do-sul": "Caxias do Sul",
    "maringa": "Maringá",
    "cascavel": "Cascavel",
    "ponta-grossa": "Ponta Grossa",
    "foz-do-iguacu": "Foz do Iguaçu",
    "guarapuava": "Guarapuava",
    "paranavai": "Paranavaí",
    "apucarana": "Apucarana",
    "arapongas": "Arapongas",
    "umuarama": "Umuarama",
    "toledo": "Toledo",
    "campo-mourao": "Campo Mourão",
    "patos-de-minas": "Patos de Minas",
    "pocos-de-caldas": "Poços de Caldas",
    "juiz-de-fora": "Juiz de Fora",
    "governador-valadares": "Governador Valadares",
    "teofilo-otoni": "Teófilo Otoni",
    "sao-joao-del-rei": "São João del-Rei",
    "sao-lourenco": "São Lourenço",
    "sao-sebastiao": "São Sebastião",
    "ilhabela": "Ilhabela",
    "ubatuba": "Ubatuba",
    "guaruja": "Guarujá",
    "aracaju": "Aracaju",
    "joao-pessoa": "João Pessoa",
};

import { ShoppingBagIcon, XIcon, SearchIcon, WhatsappIcon, MapPinIcon, CheckIcon, ChevronDownIcon, GlobeIcon } from "@/lib/icons"
import { ESTADO_MAP } from "@/components/marketplace/explorar-constants"
import type { LocationContext } from "@/lib/utils/location-label"

import { QuickAnnounceModal } from "@/components/marketplace/QuickAnnounceModal"

interface MarketplaceHomeProps {
    sections?: HomeSection[]
    user?: any
    userProfile?: any
    cartCount?: number
    hideHeaderAndFooter?: boolean
    selectedCitySlug?: string | null
    selectedCityName?: string | null
    homeAds?: SponsoredAd[]
}

const TRENDS = [
    "Copos personalizados",
    "Esculturas",
    "Presentes de natal",
    "Bebê reborn",
    "Tapeçaria",
    "Terrário",
    "Papai noel",
]

export default function MarketplaceHome({
    sections = [],
    user,
    userProfile,
    cartCount,
    hideHeaderAndFooter,
    selectedCitySlug,
    selectedCityName,
    homeAds = [],
}: MarketplaceHomeProps) {
    const router = useRouter()
    const { requestLocation, loading: isLocationLoading, error: locationError } = useLocationRedirect('/')
    const { success: notifySuccess, error: notifyError } = useNotification()

    const hasNoLocation = !selectedCityName
    const hasNoProductsOrVitrines = Boolean(selectedCityName && sections.length === 0)

    const [activeTrend, setActiveTrend] = useState(TRENDS[0])
    const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false)
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
    const [isSavingAddress, setIsSavingAddress] = useState(false)
    const [addressError, setAddressError] = useState<string | null>(null)

    const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false)
    const [showStateList, setShowStateList] = useState(false)
    const [showStateDropdown, setShowStateDropdown] = useState(false)
    const [selectedStateFilter, setSelectedStateFilter] = useState<string>("brasil")
    const [searchQuery, setSearchQuery] = useState("")
    const [isIpLoading, setIsIpLoading] = useState(false)
    const [citiesList, setCitiesList] = useState<string[]>([])
    const stateDropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if ((isVisitorModalOpen || hasNoLocation || hasNoProductsOrVitrines) && citiesList.length === 0) {
            getCitiesData().then(setCitiesList)
        }
    }, [isVisitorModalOpen, hasNoLocation, hasNoProductsOrVitrines, citiesList.length])

    // Close state dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
                setShowStateDropdown(false)
            }
        }
        if (showStateDropdown) {
            document.addEventListener("mousedown", handleClickOutside)
            return () => document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [showStateDropdown])

    // Reset dropdown when modal closes
    useEffect(() => {
        if (!isVisitorModalOpen) {
            setShowStateDropdown(false)
        }
    }, [isVisitorModalOpen])

    const [form, setForm] = useState({
        zipCode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        addressType: "casa",
        noNumber: false,
        isDefault: false,
        latitude: null as number | null,
        longitude: null as number | null,
    })

    const filteredCities = useMemo(() => {
        if (!searchQuery || searchQuery.trim().length < 2 || citiesList.length === 0) return []
        const q = searchQuery
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[-\s]+/g, " ")
            .trim()
        return citiesList
            .filter((slug: string) => {
                // Filter by selected state if not "brasil"
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
    }, [searchQuery, citiesList, selectedStateFilter])

    const formatCitySlugForDisplay = (slug: string): string => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            const uf = slug.replace("estado-", "").toLowerCase()
            return ESTADO_MAP[uf] || uf.toUpperCase()
        }
        const parts = slug.split("-")
        const state = parts.pop()?.toUpperCase() || ""
        const cityKey = parts.join("-")

        let city = COMMON_CITY_ACCENTS[cityKey]
        if (!city) {
            city = parts
                .map(p => {
                    if (p === "sao") return "São"
                    if (p === "joao") return "João"
                    if (p === "jose") return "José"
                    if (p === "conceicao") return "Conceição"
                    if (p === "ribeirao") return "Ribeirão"
                    if (p === "uniao") return "União"
                    if (p === "cristovao") return "Cristóvão"
                    if (p === "sebastiao") return "Sebastião"
                    if (p === "cambe") return "Cambé"
                    if (p === "e") return "e"
                    if (p === "do" || p === "da" || p === "dos" || p === "das" || p === "de") return p
                    return p.charAt(0).toUpperCase() + p.slice(1)
                })
                .join(" ")
        }
        return `${city} - ${state}`
    }

    const handleSelectCitySlug = (slug: string) => {
        document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`
        localStorage.setItem('dudit_city', slug)
        if (typeof window !== 'undefined') {
            if (window.location.pathname === '/') {
                window.location.reload()
            } else {
                window.location.href = `/`
            }
        }
    }

    const handleIpLocation = async () => {
        setIsIpLoading(true)
        try {
            const res = await fetch("https://ipapi.co/json/")
            if (!res.ok) throw new Error("Falha ao buscar IP")
            const data = await res.json()
            if (data.city && data.region_code) {
                const cityStr = data.city
                const stateIso = data.region_code
                const uf = stateIso.toLowerCase()
                const formattedCity = cityStr
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '')
                const slug = `${formattedCity}-${uf}`

                document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`
                localStorage.setItem('dudit_city', slug)
                if (typeof window !== 'undefined') {
                    if (window.location.pathname === '/') {
                        window.location.reload()
                    } else {
                        window.location.href = `/`
                    }
                }
            } else {
                throw new Error("Dados de IP incompletos")
            }
        } catch (err) {
            console.warn("IP location failed, falling back to navigator geolocation:", err)
            requestLocation()
        } finally {
            setIsIpLoading(false)
        }
    }

    const userCoords = userProfile?.latitude && userProfile?.longitude
        ? { lat: userProfile.latitude, lng: userProfile.longitude }
        : null

    const locationContext = useMemo<LocationContext | null>(() => {
        if (!selectedCitySlug) return null
        if (selectedCityName === "Brasil" || selectedCitySlug === "brasil") return { scope: "country" }
        if (selectedCitySlug.startsWith("estado-")) {
            return { scope: "state", state: selectedCitySlug.replace("estado-", "").toUpperCase() }
        }
        const state = selectedCitySlug.split("-").pop()?.toUpperCase() || null
        return { scope: "city", city: selectedCityName || null, state }
    }, [selectedCitySlug, selectedCityName])

    const handleAddressFetched = (addr: any) => {
        setForm(f => ({
            ...f,
            street: addr.street || f.street,
            number: addr.number || f.number,
            noNumber: addr.number ? addr.number === "S/N" : f.noNumber,
            neighborhood: addr.neighborhood || f.neighborhood,
            city: addr.city || f.city,
            state: addr.state || f.state,
            latitude: addr.latitude ?? f.latitude,
            longitude: addr.longitude ?? f.longitude,
        }))
    }

    const handleSaveAddress = async () => {
        const { zipCode, street, number, neighborhood, city, state, addressType, noNumber, isDefault } = form
        const finalNumber = noNumber ? "S/N" : number
        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setAddressError("Preencha todos os campos obrigatórios")
            return
        }

        setIsSavingAddress(true)
        setAddressError(null)

        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()

            const result = await createAddressAction({
                entityId: user.id,
                entityType: "user",
                zipCode,
                street,
                number: finalNumber,
                complement: form.complement,
                neighborhood,
                city,
                state,
                isDefault,
                addressType,
                latitude: form.latitude ?? null,
                longitude: form.longitude ?? null,
                csrf_token: token,
            })

            if (result.error) {
                setAddressError(result.error)
                notifyError("Erro", result.error)
            } else {
                notifySuccess("Sucesso", "Endereço cadastrado com sucesso!")
                setIsAddressModalOpen(false)
                window.location.reload()
            }
        } catch (e: any) {
            setAddressError("Erro ao cadastrar endereço. Tente novamente.")
        } finally {
            setIsSavingAddress(false)
        }
    }

    const renderAddressModal = () => {
        if (!user || !isAddressModalOpen) return null

        return (
            <DefaultModal
                isOpen={isAddressModalOpen}
                onClose={() => setIsAddressModalOpen(false)}
                title="Cadastrar endereço"
                maxWidth="md"
            >
                <div className="space-y-4 py-2">
                    <div className="flex items-center gap-3 mb-2">
                        {[
                            { value: "casa", label: "Casa" },
                            { value: "trabalho", label: "Trabalho" },
                            { value: "outro", label: "Outro" },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setForm(f => ({ ...f, addressType: opt.value }))}
                                className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${form.addressType === opt.value
                                    ? "bg-brand-green text-white border-brand-green"
                                    : "bg-white text-brand-inactive-text border-gray-200 hover:border-gray-300 dark:bg-dark-surface dark:text-dark-body dark:border-dark-border dark:hover:border-dark-border"
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <CepInput
                        id="zipCode"
                        name="zipCode"
                        value={form.zipCode}
                        onChange={val => setForm(f => ({ ...f, zipCode: val }))}
                        onAddressFetched={handleAddressFetched}
                    />

                    <Input
                        label="Rua/Avenida"
                        id="street"
                        name="street"
                        placeholder="Rua, Avenida, etc."
                        value={form.street}
                        onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <NumberInputWithCheckbox
                            label="Número"
                            number={form.number}
                            noNumber={form.noNumber}
                            onNumberChange={val => setForm(f => ({ ...f, number: val }))}
                            onNoNumberChange={checked => setForm(f => ({ ...f, noNumber: checked, number: checked ? "S/N" : "" }))}
                            placeholder="123"
                        />
                        <Input
                            label="Complemento"
                            id="complement"
                            name="complement"
                            placeholder="Apto, Bloco, etc."
                            value={form.complement}
                            onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
                        />
                    </div>

                    <Input
                        label="Bairro"
                        id="neighborhood"
                        name="neighborhood"
                        placeholder="Nome do bairro"
                        value={form.neighborhood}
                        onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cidade"
                            id="city"
                            name="city"
                            placeholder="Nome da cidade"
                            value={form.city}
                            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        />
                        <StateComboBox
                            value={form.state}
                            onChange={v => setForm(f => ({ ...f, state: v }))}
                            className="w-full"
                        />
                    </div>

                    {addressError && (
                        <p className="text-red-500 text-sm font-semibold">{addressError}</p>
                    )}

                    <label className="flex items-center gap-2 text-xs text-brand-dark dark:text-dark-heading cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={form.isDefault}
                            onChange={(e) => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                            className="rounded text-brand-green focus:ring-brand-green h-4 w-4"
                        />
                        <span>Definir como endereço padrão (reflete no ERP de todas as lojas)</span>
                    </label>

                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            onClick={handleSaveAddress}
                            disabled={isSavingAddress}
                            className="bg-brand-green text-white hover:bg-[#047857]"
                        >
                            {isSavingAddress ? "Salvando..." : "Salvar Endereço"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsAddressModalOpen(false)}
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        )
    }

    const renderVisitorModal = () => {
        if (!isVisitorModalOpen) return null

        return (
            <DefaultModal
                isOpen={isVisitorModalOpen}
                onClose={() => setIsVisitorModalOpen(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    {/* Close X Button - Desktop Only */}
                    <button
                        onClick={() => setIsVisitorModalOpen(false)}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>

                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Onde você está?"
                            className="w-64 h-auto object-contain transform translate-y-7"
                        />
                    </div>

                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Onde você está?</h4>
                    <p className="text-brand-inactive-text text-[15px] text-center mb-6 leading-relaxed dark:text-dark-body">
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
                                        <GlobeIcon className="w-4 h-4 text-brand-green" />
                                    ) : (
                                        <MapPinIcon className="w-4 h-4 text-brand-green" />
                                    )}
                                    <span>
                                        {selectedStateFilter === "brasil" ? "Brasil" : ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}
                                    </span>
                                </span>
                                <ChevronDownIcon className={`w-4 h-4 text-brand-inactive-text transition-transform ${showStateDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showStateDropdown && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                    <button
                                        onClick={() => {
                                            setSelectedStateFilter("brasil")
                                            setShowStateDropdown(false)
                                            setSearchQuery("")
                                            handleSelectCitySlug("brasil")
                                        }}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                    >
                                        <GlobeIcon className="w-4 h-4 text-brand-green" />
                                        <span>Brasil (todos os estados)</span>
                                        {selectedStateFilter === "brasil" && <CheckIcon className="w-4 h-4 text-brand-green ml-auto" />}
                                    </button>
                                    {Object.entries(ESTADO_MAP).map(([uf, name]) => (
                                        <button
                                            key={uf}
                                            onClick={() => {
                                                setSelectedStateFilter(uf)
                                                setShowStateDropdown(false)
                                                setSearchQuery("")
                                                handleSelectCitySlug(`estado-${uf}`)
                                            }}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                        >
                                            <span className="flex items-center gap-3">
                                                <MapPinIcon className="w-4 h-4 text-brand-green" />
                                                {name}
                                            </span>
                                            {selectedStateFilter === uf && <CheckIcon className="w-4 h-4 text-brand-green" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* City search - filters by selected state */}
                        <div className="relative pt-2">
                            <Input
                                placeholder={selectedStateFilter === "brasil" ? "Buscar cidade... (ex: São Paulo, Bauru)" : `Buscar cidade em ${ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-[42px] w-full"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                            {filteredCities.length > 0 && (
                                <div className="flex flex-col gap-1 border-t pt-2">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            onClick={() => handleSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading"
                                        >
                                            <span>{formatCitySlugForDisplay(slug)}</span>
                                            {selectedCitySlug === slug && <CheckIcon className="w-4 h-4 text-brand-green" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {searchQuery.trim().length >= 2 && filteredCities.length === 0 && citiesList.length > 0 && (
                                <p className="text-center text-xs text-brand-inactive-text py-3">
                                    Nenhuma cidade encontrada{selectedStateFilter !== "brasil" ? ` em ${ESTADO_MAP[selectedStateFilter]}` : ""}
                                </p>
                            )}
                        </div>
                    </div>

                    <Button
                        onClick={handleIpLocation}
                        disabled={isIpLoading || isLocationLoading}
                        variant="outline"
                        className="w-full"
                    >
                        <MapPinIcon className="w-4 h-4" />
                        <span>Usar minha localização</span>
                    </Button>

                    {/* Only show login link when user is NOT logged in */}
                    {!user && (
                        <div className="text-center mt-8 pt-5 border-t border-brand-border dark:border-dark-border">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Já tem uma conta cadastrada com endereço salvo?
                            </p>
                            <Button
                                onClick={() => {
                                    setIsVisitorModalOpen(false)
                                    router.push("/auth/login")
                                }}
                                variant="link"
                                className="text-sm mt-1 inline-block"
                            >
                                Entrar na minha conta
                            </Button>
                        </div>
                    )}
                </div>
            </DefaultModal>
        )
    }

    let content;

    if (hasNoLocation || hasNoProductsOrVitrines) {
        content = (
            <div className="w-full flex-grow flex flex-col pb-28 lg:pb-12">
                <MarketplaceLandingView
                    user={user}
                    userProfile={userProfile}
                    selectedCityName={selectedCityName}
                    selectedCitySlug={selectedCitySlug}
                    isCityEmpty={Boolean(hasNoProductsOrVitrines && selectedCityName && selectedCityName !== "Brasil")}
                    onOpenAddressModal={() => setIsAddressModalOpen(true)}
                    onOpenVisitorModal={() => setIsVisitorModalOpen(true)}
                    onRequestLocation={requestLocation}
                    isLocationLoading={isLocationLoading}
                    locationError={locationError}
                    onSelectCitySlug={handleSelectCitySlug}
                    citiesList={citiesList}
                />

                {renderAddressModal()}
                {renderVisitorModal()}
            </div>
        )
    } else {
        const productSection = sections.find(s => s.id !== "services" && s.id !== "topVitrines" && s.id !== "brasilTodo")
        const serviceSection = sections.find(s => s.id === "services")
        const vitrineSection = sections.find(s => s.id === "topVitrines")
        const brasilTodoSection = sections.find(s => s.id === "brasilTodo")
        const otherSections = sections.filter(s => s !== productSection && s !== serviceSection && s !== vitrineSection && s !== brasilTodoSection)

        const exploreHref = useMemo(() => {
            if (selectedCityName === "Brasil") return "/explorar/brasil"
            if (selectedCitySlug) return `/explorar/${selectedCitySlug}`
            return "/explorar"
        }, [selectedCitySlug, selectedCityName])

        content = (
            <div className="w-full bg-white flex-grow dark:bg-dark-surface pb-28 lg:pb-12">
                <HeroBanner href={exploreHref} />

                <div className="mx-auto max-w-[1400px] px-4 xl:px-0 space-y-10">
                    {/* Publicidade logo abaixo do banner do topo */}
                    <SponsoredAdsCarousel ads={homeAds || []} slot="home" title="Patrocinados na sua região" className="!mb-0 !px-0" />

                    {/* 1. Seção de Lojas e Vitrines */}
                    {vitrineSection && vitrineSection.items.length > 0 && (
                        <HorizontalCarousel
                            key={vitrineSection.id}
                            title={vitrineSection.title}
                            subtitle={vitrineSection.subtitle}
                            items={vitrineSection.items}
                            onSeeAll={vitrineSection.seeMoreLink ? () => router.push(vitrineSection.seeMoreLink!) : undefined}
                            renderItem={(item: any) => <VitrineCard vitrine={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                            itemWidthClass="w-[270px] sm:w-[320px]"
                        />
                    )}

                    {/* 2. Seção de Produtos */}
                    {productSection && productSection.items.length > 0 && (
                        <HorizontalCarousel
                            key={productSection.id}
                            title={productSection.title}
                            subtitle={productSection.subtitle}
                            items={productSection.items}
                            onSeeAll={productSection.seeMoreLink ? () => router.push(productSection.seeMoreLink!) : undefined}
                            renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                            itemWidthClass="w-[150px] md:w-[230px]"
                        />
                    )}

                    {/* 3. Seção de Serviços */}
                    {serviceSection && serviceSection.items.length > 0 && (
                        <HorizontalCarousel
                            key={serviceSection.id}
                            title={serviceSection.title}
                            subtitle={serviceSection.subtitle}
                            items={serviceSection.items}
                            onSeeAll={serviceSection.seeMoreLink ? () => router.push(serviceSection.seeMoreLink!) : undefined}
                            renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                            itemWidthClass="w-[150px] md:w-[230px]"
                        />
                    )}

                    {/* 4. Seção de Destaques em todo o Brasil */}
                    {brasilTodoSection && brasilTodoSection.items.length > 0 && (
                        <HorizontalCarousel
                            key={brasilTodoSection.id}
                            title={brasilTodoSection.title}
                            subtitle={brasilTodoSection.subtitle}
                            items={brasilTodoSection.items}
                            onSeeAll={brasilTodoSection.seeMoreLink ? () => router.push(brasilTodoSection.seeMoreLink!) : undefined}
                            renderItem={(item: any) => (
                                <ItemCard
                                    product={item}
                                    userCoords={userCoords}
                                    locationContext={{ scope: "country" }}
                                    className="w-full"
                                />
                            )}
                            itemWidthClass="w-[150px] md:w-[230px]"
                        />
                    )}

                    {/* 5. Banner Venda na Dudit */}
                    <HomeSellerBanner />

                    {/* 7. Outras seções eventuais */}
                    {otherSections.map((section) => {
                        const onSeeAll = section.seeMoreLink ? () => router.push(section.seeMoreLink!) : undefined
                        if (section.id === "topVitrines") {
                            return (
                                <HorizontalCarousel
                                    key={section.id}
                                    title={section.title}
                                    subtitle={section.subtitle}
                                    items={section.items}
                                    onSeeAll={onSeeAll}
                                    renderItem={(item: any) => <VitrineCard vitrine={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                                    itemWidthClass="w-[270px] sm:w-[320px]"
                                />
                            )
                        }
                        return (
                            <HorizontalCarousel
                                key={section.id}
                                title={section.title}
                                subtitle={section.subtitle}
                                items={section.items}
                                onSeeAll={onSeeAll}
                                renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                                itemWidthClass="w-[150px] md:w-[230px]"
                            />
                        )
                    })}
                </div>

                <QuickAnnounceModal
                    isOpen={isAnnounceModalOpen}
                    onClose={() => setIsAnnounceModalOpen(false)}
                    userProfile={userProfile}
                />

                {renderAddressModal()}
                {renderVisitorModal()}
            </div>
        )
    }
    if (hideHeaderAndFooter) {
        return content
    }

    return (
        <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col dark:bg-dark-background">
            {/* Header com setView opcional para evitar erros */}
            <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

            {/* Espaçador para o Header Fixo */}
            <div className="pt-[50px]" />

            {content}

            <MarketplaceFooter />
        </div>
    )
}
