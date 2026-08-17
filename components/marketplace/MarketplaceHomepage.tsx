"use client"

import dynamic from "next/dynamic"
import { useState, useMemo, useCallback, useEffect } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import MarketplaceFooter from "./MarketplaceFooter"
import { HeroBanner, HorizontalCarousel, ItemCard, VitrineCard } from "./shared-components"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import type { SponsoredAd } from "@/lib/ads/types"
import type { HomeSection } from "@/app/actions/marketplace/discover"
import { CommunityVideoCard } from "./CommunityVideoCard"

const VideoModal = dynamic(() => import("./VideoModal").then(mod => mod.VideoModal), { ssr: false })

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
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { getCitiesData } from "@/lib/data/cities-loader"

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

import { MapPinIcon, XIcon } from "@/lib/icons"
import type { LocationContext } from "@/lib/utils/location-label"

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
    const { requestLocation, loading: isLocationLoading, error: locationError } = useLocationRedirect()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [activeTrend, setActiveTrend] = useState(TRENDS[0])
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
    const [isSavingAddress, setIsSavingAddress] = useState(false)
    const [addressError, setAddressError] = useState<string | null>(null)

    const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [isIpLoading, setIsIpLoading] = useState(false)
    const [citiesList, setCitiesList] = useState<string[]>([])

    useEffect(() => {
        if (isVisitorModalOpen && citiesList.length === 0) {
            getCitiesData().then(setCitiesList)
        }
    }, [isVisitorModalOpen, citiesList.length])

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
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 5)
    }, [searchQuery, citiesList])

    const formatCitySlugForDisplay = (slug: string): string => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            return slug.replace("estado-", "").toUpperCase()
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
        window.location.href = `/${slug}`
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
                window.location.href = `/${slug}`
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
        const { zipCode, street, number, neighborhood, city, state, addressType, noNumber } = form
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
                isDefault: true,
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

    const hasNoLocation = !selectedCityName
    const hasNoProductsOrVitrines = selectedCityName && sections.length === 0

    const renderMarketingSection = () => (
        <section className="bg-[#fff3db] py-16 md:py-24 mb-0 w-full mt-auto dark:bg-[#2a2417]">
            <div className="mx-auto max-w-[1400px] px-4 flex flex-col md:flex-row items-center gap-12 md:gap-24">
                <div className="flex-1 md:max-w-[500px]">
                    <h1 className="text-4xl md:text-[3.5rem] font-black text-brand-dark mb-6 leading-[1.1] tracking-tight dark:text-dark-heading">
                        Pare de trabalhar para pagar comissão. Fique com o lucro.
                    </h1>
                    <p className="font-bold text-gray-800 text-lg mb-4 dark:text-dark-heading">
                        Chega de dar 20% da sua venda pros aplicativos e depender de algoritmos.
                    </p>
                    <p className="text-gray-600 text-base md:text-lg mb-8 leading-relaxed dark:text-dark-body">
                        Monte sua vitrine, organize seus clientes e venda direto, de graça. <br /><br />
                        Não somos um marketplace mercenário. Aqui não tem taxa e o cliente é seu do começo ao fim.
                    </p>
                    <button
                        onClick={() => router.push(user ? "/erp/trocar-erp" : "/auth/login?mode=partner")}
                        className="bg-brand-green text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#047857] transition-colors"
                    >
                        Criar Conta Grátis e Vender Mais
                    </button>
                </div>

                <div className="flex-1 relative h-[300px] md:h-[400px] w-full mt-8 md:mt-0">
                    <div className="absolute top-0 left-0 w-[55%] md:w-[280px] aspect-[4/3] z-10 shadow-lg rounded-[16px] overflow-hidden border-4 border-white transform -rotate-2">
                        <img src="https://img.elo7.com.br/elo7-assets/Jaque.DbUaCvDP.webp" className="w-full h-full object-cover" alt="Vitrine Local 1" loading="lazy" />
                    </div>
                    <div className="absolute top-[10%] right-0 w-[50%] md:w-[260px] aspect-[3/4] z-20 shadow-xl rounded-[16px] overflow-hidden border-4 border-white transform rotate-3">
                        <img src="https://img.elo7.com.br/elo7-assets/Bolo_2.DbQJb_rC.webp" className="w-full h-full object-cover" alt="Vitrine Local 2" loading="lazy" />
                    </div>
                    <div className="absolute bottom-[-10%] left-[20%] w-[45%] md:w-[240px] aspect-square z-30 shadow-2xl rounded-[16px] overflow-hidden border-4 border-white transform -rotate-6">
                        <img src="https://img.elo7.com.br/elo7-assets/Copo.Ch2n71m8.webp" className="w-full h-full object-cover" alt="Vitrine Local 3" loading="lazy" />
                    </div>
                </div>
            </div>
        </section>
    )

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
                <div className="flex flex-col relative text-[#003229]">
                    <button
                        onClick={() => setIsVisitorModalOpen(false)}
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
                        <div className="relative">
                            <Input
                                label="Digite sua cidade"
                                id="visitorCitySearchHome"
                                name="visitorCitySearchHome"
                                placeholder="Ex: São Paulo, Rio de Janeiro..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {filteredCities.length > 0 && (
                                <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:bg-dark-surface dark:border-dark-border dark:divide-dark-border">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            onClick={() => handleSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 hover:bg-brand-gray text-brand-dark text-sm transition-colors font-medium flex items-center gap-2 dark:hover:bg-dark-border/50 dark:text-dark-heading"
                                        >
                                            <MapPinIcon size={14} className="text-brand-green shrink-0" />
                                            {formatCitySlugForDisplay(slug)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleIpLocation}
                            disabled={isIpLoading || isLocationLoading}
                            className="w-full flex items-center justify-center gap-2 border-2 border-brand-green text-brand-green font-bold py-3 px-4 rounded-full hover:bg-brand-green/5 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 text-sm shadow-sm"
                        >
                            {isIpLoading || isLocationLoading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin"></span>
                                    Detectando...
                                </>
                            ) : (
                                <>
                                    <MapPinIcon size={16} className="shrink-0" />
                                    Usar minha localização
                                </>
                            )}
                        </button>
                    </div>

                    <div className="text-center mt-8 pt-5 border-t border-gray-100 dark:border-dark-border">
                        <p className="text-xs text-gray-400 dark:text-dark-body/70">
                            Já tem uma conta cadastrada com endereço salvo?
                        </p>
                        <button
                            onClick={() => {
                                setIsVisitorModalOpen(false)
                                router.push("/auth/login")
                            }}
                            className="text-brand-green font-bold text-sm hover:underline mt-1 inline-block"
                        >
                            Entrar na minha conta
                        </button>
                    </div>
                </div>
            </DefaultModal>
        )
    }

    let content;

    if (hasNoLocation) {
        content = (
            <div className="w-full bg-white flex-grow flex flex-col dark:bg-dark-surface">
                <HeroBanner />

                <div className="container mx-auto px-4 lg:px-0 max-w-[1400px] my-12 flex-grow flex items-center justify-center">
                    <div className="bg-[#fcf8f2] rounded-[24px] border border-[#f5e9d9] p-8 md:p-12 w-full flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm dark:bg-[#2a2417] dark:border-[#3a3120]">
                        <div className="flex-grow text-center md:text-left md:max-w-[65%]">
                            <h2 className="text-3xl font-black text-brand-dark mb-4 leading-tight dark:text-dark-heading">Onde você está?</h2>
                            <p className="text-gray-600 text-lg mb-6 leading-relaxed dark:text-dark-body">
                                Para encontrar os melhores produtos, serviços e negócios locais pertinho de você, precisamos saber a sua localização.
                            </p>
                            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                                {user ? (
                                    <button
                                        onClick={() => setIsAddressModalOpen(true)}
                                        className="bg-brand-green text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#047857] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-md flex items-center gap-2"
                                    >
                                        Adicionar Endereço
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsVisitorModalOpen(true)}
                                        className="bg-brand-green text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#047857] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-md flex items-center gap-2"
                                    >
                                        Escolher Cidade
                                    </button>
                                )}

                                <button
                                    onClick={requestLocation}
                                    disabled={isLocationLoading}
                                    className="bg-white border-2 border-brand-green text-brand-green font-bold py-3.5 px-8 rounded-full hover:bg-brand-green/5 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 dark:bg-dark-surface"
                                >
                                    {isLocationLoading ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin"></span>
                                            Localizando...
                                        </>
                                    ) : (
                                        "Usar localização atual"
                                    )}
                                </button>
                            </div>
                            {locationError && (
                                <p className="text-red-500 text-sm mt-3 font-semibold">{locationError}</p>
                            )}
                        </div>
                        <div className="w-[180px] md:w-[240px] shrink-0 transform hover:scale-105 transition-transform duration-300">
                            <img src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png" alt="Onde você está?" className="w-full h-auto object-contain" />
                        </div>
                    </div>
                </div>

                {renderAddressModal()}
                {renderVisitorModal()}
                {renderMarketingSection()}
            </div>
        )
    } else if (hasNoProductsOrVitrines) {
        content = (
            <div className="w-full bg-white flex-grow flex flex-col dark:bg-dark-surface">
                <HeroBanner />

                <div className="container mx-auto px-4 lg:px-0 max-w-[1400px] my-12 flex-grow flex items-center justify-center">
                    <div className="flex justify-center">
                        <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                            imageAlt="Estamos Chegando!"
                            title="Estamos Chegando!"
                            subtitle={`Ainda não temos vendedores ou produtos cadastrados em ${selectedCityName}. Que tal ser o pioneiro e começar a vender na sua cidade de graça, sem comissão nenhuma?`}
                            itemButton={{
                                text: "Começar a vender na Dudit",
                                action: () => {
                                    router.push(userProfile ? "/erp/trocar-erp" : "/auth/login?mode=partner")
                                },
                                variant: "default"
                            }}
                        />
                    </div>
                </div>

                {renderAddressModal()}
                {renderVisitorModal()}
                {renderMarketingSection()}
            </div>
        )
    } else {
        content = (
            <div className="w-full bg-white flex-grow dark:bg-dark-surface">
                <HeroBanner />

                <div className="mx-auto max-w-[1400px] px-4 xl:px-0 space-y-10">
                    {sections.map((section) => {
                        if (section.id === "topVitrines") {
                            return (
                                <HorizontalCarousel
                                    key={section.id}
                                    title={section.title}
                                    subtitle={section.subtitle}
                                    items={section.items}
                                    renderItem={(item: any) => <VitrineCard vitrine={item} locationContext={locationContext} className="w-full" />}
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
                                renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                                itemWidthClass="w-[190px] sm:w-[210px]"
                            />
                        )
                    })}
                </div>

                <SponsoredAdsCarousel ads={homeAds || []} slot="home" title="Patrocinados na sua região" />

                {renderAddressModal()}
                {renderVisitorModal()}
                {renderMarketingSection()}
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
