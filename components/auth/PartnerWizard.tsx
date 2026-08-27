"use client"

import React, { useState, useRef } from "react"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { Upload, Briefcase, Tag, ChevronRight, Store } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-notification"
import { cn, generateNameFromEmail } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import Input from "@/components/reusable/Input"
import NumberInputWithCheckbox from "@/components/ui/number-input-with-checkbox"
import { Checkbox } from "@/components/reusable/Checkbox"
import { Button, PhoneInput, EmailInput, Spinner, InfoCard, ListItem, RadioButton } from "@/components/reusable"
import ImageCropperModal from "@/components/ImageCropperModal"
import PartnerCategoryModal from "@/components/erp/settings/PartnerCategoryModal"
import { CepInput, PasswordInput, StateComboBox, PasswordStrengthMeter } from "@/components/reusable"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { useSupabase } from "@/providers/supabase-provider"
import type { BusinessMode } from "@/lib/business-info"
import { getDefaultResourcesForModeAndCategory } from "@/lib/system-resources"
import { isGifFile } from "@/lib/security/file-validator"
import { recordLegalConsent } from "@/app/actions/auth/legal-consent"
import { CURRENT_LEGAL_DOCUMENTS } from "@/lib/legal/constants"
import { getErrorMessage } from "@/lib/utils/error-handlers"

const initialPartnerData = {
    categoryId: "",
    subcategoryId: "",
    categoryName: "",
    businessInfo: { mode: "desapego" as BusinessMode, activeResources: [] as string[] },
    storeName: "",
    phone: "",
    address: {
        cep: "", street: "", number: "", complement: "",
        neighborhood: "", city: "", state: "", noNumber: false, type: "home", ibge: "",
        latitude: null as number | null, longitude: null as number | null,
    },
    description: "",
    storeImageUrl: "",
}

const MODE_OPTIONS: Array<{
    value: BusinessMode
    icon: any
    title: string
    description: string
}> = [
        {
            value: "desapego",
            icon: Tag,
            title: "Anúncio Rápido / Desapego",
            description: "Vender itens pontuais, desapegos ou serviços simples sem burocracia",
        },
        {
            value: "quick",
            icon: Store,
            title: "Vitrine Online & WhatsApp",
            description: "Catálogo e vitrine profissional com minha marca para vender no WhatsApp e Marketplace",
        },
        {
            value: "erp",
            icon: Briefcase,
            title: "Gerenciar meu negócio (ERP)",
            description: "Controle completo de estoque, frente de caixa (PDV), fluxo de caixa e relatórios",
        },
    ]

const variants = {
    enter: (d: number) => ({ x: d > 0 ? 20 : -20, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d < 0 ? 20 : -20, opacity: 0 }),
}

export const PartnerWizard = ({ onBack, isUserLoggedIn }: { onBack: () => void; isUserLoggedIn: boolean }) => {
    const { user } = useSupabase()
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Step 1: Conta (se não logado). Step 2: Escolha de Modo.
    const [step, setStep] = useState(isUserLoggedIn ? 2 : 1)
    const [direction, setDirection] = useState(0)
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [partnerData, setPartnerData] = useState(initialPartnerData)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [categoryModalOpen, setCategoryModalOpen] = useState(false)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const isSubmittingRef = useRef(false)
    const [imageUploading, setImageUploading] = useState(false)

    const isDesapego = partnerData.businessInfo.mode === "desapego"
    const maxStep = isDesapego ? 3 : 5
    const actualStep = isUserLoggedIn ? step - 1 : step
    const totalSteps = isUserLoggedIn ? (isDesapego ? 2 : 4) : (isDesapego ? 3 : 5)

    const loggedInUserName = user?.user_metadata?.full_name || user?.user_metadata?.name || (user?.email ? generateNameFromEmail(user.email) : "")

    React.useEffect(() => {
        if (isUserLoggedIn && loggedInUserName && !partnerData.storeName) {
            setPartnerData(p => ({ ...p, storeName: loggedInUserName }))
        }
    }, [isUserLoggedIn, loggedInUserName])

    const getStepTitle = () => {
        if (step === 1) return "Crie sua conta"
        if (step === 2) return "Como você quer começar?"
        if (isDesapego) {
            return isUserLoggedIn ? "Seus dados de contato e localização" : "Seus dados de contato e localização"
        }
        if (step === 3) return "Sobre seu negócio"
        if (step === 4) return "Qual a categoria do seu negócio?"
        if (step === 5) return "Onde fica seu negócio?"
        return ""
    }

    const getStepSubtitle = () => {
        if (step === 1) return "Comece gratuitamente e anuncie na Dudit."
        if (step === 2) return "Escolha a opção ideal para seu objetivo hoje."
        if (isDesapego) {
            return "Informe seu WhatsApp e cidade para os compradores te encontrarem."
        }
        if (step === 3) return "Algumas informações básicas para seus clientes te encontrarem."
        if (step === 4) return "Escolha a categoria principal da sua loja."
        if (step === 5) return "Informe onde seu negócio está localizado."
        return ""
    }

    const setMode = (mode: BusinessMode) => {
        const defaultResources = getDefaultResourcesForModeAndCategory(mode, partnerData.categoryName)
        setPartnerData(prev => ({
            ...prev,
            businessInfo: {
                ...prev.businessInfo,
                mode,
                activeResources: defaultResources,
            },
        }))
    }

    const handleCategorySelect = (selected: { categoryId: string; subcategoryId: string | null; name: string; path: string }) => {
        const mode = partnerData.businessInfo.mode || "quick"
        const defaultResources = getDefaultResourcesForModeAndCategory(mode, selected.path)
        setPartnerData(prev => ({
            ...prev,
            categoryId: selected.categoryId,
            subcategoryId: selected.subcategoryId || "",
            categoryName: selected.path,
            businessInfo: {
                ...prev.businessInfo,
                activeResources: defaultResources,
            },
        }))
    }

    const patchAddress = (patch: Partial<typeof partnerData.address>) =>
        setPartnerData(prev => ({ ...prev, address: { ...prev.address, ...patch } }))

    const handleGoogleAuth = async () => {
        setIsLoading(true)
        try {
            await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `https://dudit.com.br/auth/callback?next=/erp/inicio`,
                    queryParams: { access_type: "offline", prompt: "consent" },
                },
            })
        } catch (e: any) {
            setError(e.message)
            setIsLoading(false)
        }
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (!file) return
        if (isGifFile(file)) return void toast.error("Arquivos GIF não são permitidos no sistema.")
        if (file.size > 3 * 1024 * 1024) return void toast.error("Máximo 3MB")
        setTempImageFile(file)
        setCropModalOpen(true)
    }

    const handleCropComplete = async (url: string) => {
        setImageUploading(true)
        setCropModalOpen(false)
        setImagePreview(url)
        try {
            const blob = await (await fetch(url)).blob()
            const ext = blob.type === "image/png" ? "png" : "jpg"
            const file = new File([blob], `partner-logo.${ext}`, { type: blob.type })
            const formData = new FormData()
            formData.append("file", file, "partner-logo.jpg")

            const response = await fetchWithCSRF("/api/upload-image?uploadType=partner-logo", { method: "POST", body: formData })
            const data = await response.json()

            if (!response.ok) {
                setImagePreview(null)
                setPartnerData(p => ({ ...p, storeImageUrl: "" }))
                toast.error(data.blocked ? "Imagem bloqueada por conteúdo impróprio" : data.error || "Erro ao fazer upload")
                return
            }

            if (data.success && data.key) {
                setPartnerData(p => ({ ...p, storeImageUrl: data.key }))
                toast.success("Logo enviada com sucesso!")
            } else {
                setImagePreview(null)
                setPartnerData(p => ({ ...p, storeImageUrl: "" }))
                toast.error(data.error || "Erro ao fazer upload")
            }
        } catch {
            setImagePreview(null)
            setPartnerData(p => ({ ...p, storeImageUrl: "" }))
            toast.error("Erro no upload da imagem")
        } finally {
            setImageUploading(false)
            setTempImageFile(null)
        }
    }

    const validate = async (): Promise<string | null> => {
        if (step === 1 && !isUserLoggedIn) {
            if (!email || !password || !acceptedTerms) return "Preencha todos os campos"
            const { calculatePasswordScore } = await import("@/lib/utils")
            if (calculatePasswordScore(password) < 2) return "A senha deve ser média ou forte."
        }

        if (step === 2 && !partnerData.businessInfo.mode) {
            return "Selecione como quer usar a Dudit"
        }

        if (isDesapego && step === 3) {
            const sellerName = isUserLoggedIn
                ? (partnerData.storeName || loggedInUserName || "Vendedor")
                : partnerData.storeName
            if (!sellerName) return "Informe seu nome de vendedor"
            if (!partnerData.phone) return "Informe seu WhatsApp para contato"
            if (!partnerData.address.city || !partnerData.address.state) return "Informe sua cidade e estado"
        }

        if (!isDesapego) {
            if (step === 3 && (!partnerData.storeName || !partnerData.phone)) return "Preencha o nome do negócio e WhatsApp"
            if (step === 4 && !partnerData.categoryId) return "Selecione a categoria do negócio"
            if (step === 5) {
                if (imageUploading) return "Aguarde o upload da imagem"
                const { cep, street, number, noNumber, neighborhood, city, state } = partnerData.address
                if (!cep || !street || (!noNumber && !number) || !neighborhood || !city || !state)
                    return "Preencha todo o endereço para continuar"
            }
        }
        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSubmittingRef.current || isSubmitting) return
        setError(null)
        const err = await validate()
        if (err) return setError(err)

        if (step < maxStep) {
            setDirection(1)
            setStep(s => s + 1)
            return
        }

        isSubmittingRef.current = true
        setIsSubmitting(true)
        try {
            const sellerName = isUserLoggedIn
                ? (partnerData.storeName || loggedInUserName || "Vendedor")
                : (partnerData.storeName || generateNameFromEmail(email))

            let userId = ""
            let createdSession = false

            if (!isUserLoggedIn) {
                const cleanEmail = email.trim().toLowerCase()
                const { data: signUp, error: signErr } = await supabase.auth.signUp({
                    email: cleanEmail,
                    password,
                    options: {
                        data: { full_name: sellerName },
                        emailRedirectTo: `${window.location.origin}/auth/callback?next=/erp/inicio`,
                    },
                })
                if (signErr) throw signErr
                if (signUp.user && signUp.user.identities && signUp.user.identities.length === 0) {
                    throw new Error("Este email já está cadastrado.")
                }
                userId = signUp.user!.id
                createdSession = !!signUp.session

                try {
                    await Promise.all(
                        CURRENT_LEGAL_DOCUMENTS.map((doc) =>
                            recordLegalConsent({ userId, tipo: doc.tipo, versao: doc.versao, origem: "signup" })
                        )
                    )
                } catch (e) {
                    console.error("[PARTNER-WIZARD] Falha ao registrar aceite dos documentos legais:", e)
                }
            } else {
                userId = user!.id
            }

            const { registerPartner } = await import("@/app/actions/marketplace/partners")
            const res = await registerPartner({
                signupUserId: isUserLoggedIn ? undefined : userId,
                email: isUserLoggedIn ? (user?.email || "") : email.trim().toLowerCase(),
                fullName: sellerName,
                ...partnerData,
                storeName: sellerName,
                categoryId: partnerData.categoryId || null as any,
                subcategoryId: partnerData.subcategoryId || null,
                businessInfo: partnerData.businessInfo,
                cnpj: null, cpf: null, personType: "pf",
                zipCode: partnerData.address.cep,
                street: partnerData.address.street || "Endereço não informado",
                number: partnerData.address.noNumber ? "S/N" : partnerData.address.number || "S/N",
                complement: partnerData.address.complement,
                neighborhood: partnerData.address.neighborhood || "Centro",
                city: partnerData.address.city,
                state: partnerData.address.state,
                municipioCodigoIbge: partnerData.address.ibge || undefined,
                latitude: partnerData.address.latitude ?? undefined,
                longitude: partnerData.address.longitude ?? undefined,
                storeDescription: partnerData.description || "",
                storeImageUrl: partnerData.storeImageUrl || "",
            })

            if (!res.success) throw new Error(res.error)

            if (isUserLoggedIn || createdSession) {
                router.push("/erp/inicio")
            } else {
                router.push(`/auth/login?mode=verify-email&email=${encodeURIComponent(email)}`)
            }
        } catch (e: any) {
            console.error("[PARTNER-WIZARD SUBMIT ERROR]", e)
            setError(getErrorMessage(e))
        } finally {
            isSubmittingRef.current = false
            setIsSubmitting(false)
        }
    }

    const prevStep = () => {
        setDirection(-1)
        if ((isUserLoggedIn && step > 2) || (!isUserLoggedIn && step > 1)) setStep(s => s - 1)
        else onBack()
    }

    return (
        <div className="w-full">
            <div className="flex gap-2 mb-6">
                {Array.from({ length: totalSteps }).map((_, i) => (
                    <motion.div key={i} layout className={cn("h-1 flex-1 rounded-full transition-colors duration-500", i + 1 <= actualStep ? "bg-brand-green" : "bg-gray-100 dark:bg-dark-border")} />
                ))}
            </div>

            <AnimatePresence mode="wait" custom={direction}>
                <motion.div key={step} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ type: "tween", duration: 0.2 }} className="w-full">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{getStepTitle()}</h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">{getStepSubtitle()}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* STEP 1: CONTA (se não logado) */}
                        {step === 1 && !isUserLoggedIn && (
                            <>
                                <EmailInput name="email" label="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                                <div>
                                    <PasswordInput name="password" label="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
                                    <PasswordStrengthMeter password={password} />
                                </div>
                                <div className="pt-1">
                                    <div className="pt-1 flex items-center gap-2">
                                        <Checkbox id="termsAgreement" checked={acceptedTerms} onChange={setAcceptedTerms} />
                                        <label htmlFor="termsAgreement" className="text-sm text-brand-inactive-text dark:text-dark-body cursor-pointer">
                                            Aceito os <Link href="/institucional/termos" prefetch={false} className="underline text-brand-dark dark:text-dark-heading">Termos de uso</Link>
                                        </label>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                    <Button variant="outline" onClick={handleGoogleAuth} disabled={isLoading} className="w-full gap-3 pl-4 bg-transparent">
                                        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0">
                                            <path d="M17.64 9.20443C17.64 8.56625 17.5827 7.95262 17.4764 7.36353H9V10.8449H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8194H14.9564C16.6582 14.2526 17.64 11.9453 17.64 9.20443Z" fill="#4285F4" />
                                            <path d="M8.99976 18C11.4298 18 13.467 17.1941 14.9561 15.8195L12.0475 13.5613C11.2416 14.1013 10.2107 14.4204 8.99976 14.4204C6.65567 14.4204 4.67158 12.8372 3.96385 10.71V4.95818H0.957031V13.0418C2.43794 15.9831 5.48158 18 8.99976 18Z" fill="#34A853" />
                                            <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96385 10.71Z" fill="#FBBC05" />
                                            <path d="M8.99976 3.57955C10.3211 3.57955 11.5075 4.03364 12.4402 4.92545L15.0216 2.34409C13.4629 0.891818 11.4257 0 8.99976 0C5.48158 0 2.43794 2.01682 0.957031 4.95818L3.96385 7.29C4.67158 5.16273 6.65567 3.57955 8.99976 3.57955Z" fill="#EA4335" />
                                        </svg>
                                        <span>Criar com Google</span>
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* STEP 2: ESCOLHA DO MODO (Como você quer começar) */}
                        {step === 2 && (
                            <div className="space-y-3">
                                {MODE_OPTIONS.map(opt => (
                                    <ListItem
                                        key={opt.value}
                                        icon={opt.icon}
                                        title={opt.title}
                                        description={opt.description}
                                        className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                                        onClick={() => setMode(opt.value)}
                                        left={
                                            <RadioButton
                                                name="businessMode"
                                                value={opt.value}
                                                checked={partnerData.businessInfo.mode === opt.value}
                                                onChange={() => setMode(opt.value)}
                                            />
                                        }
                                    />
                                ))}
                            </div>
                        )}

                        {/* STEP 3 (DESAPEGO): DADOS DE CONTATO E CIDADE RÁPIDOS */}
                        {isDesapego && step === 3 && (
                            <div className="space-y-4">
                                {!isUserLoggedIn ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Input
                                            name="storeName"
                                            label="Seu Nome de Vendedor"
                                            placeholder="Ex: Murilo Silva"
                                            value={partnerData.storeName}
                                            onChange={e => setPartnerData(p => ({ ...p, storeName: e.target.value }))}
                                            required
                                        />
                                        <PhoneInput
                                            name="phone"
                                            label="WhatsApp para Contato"
                                            value={partnerData.phone}
                                            onChange={e => setPartnerData(p => ({ ...p, phone: e.target.value }))}
                                            required
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <PhoneInput
                                            name="phone"
                                            label="WhatsApp para Contato"
                                            value={partnerData.phone}
                                            onChange={e => setPartnerData(p => ({ ...p, phone: e.target.value }))}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-3 pt-2 border-t border-brand-border dark:border-dark-border">
                                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        Sua Localização (para os compradores da sua região te encontrarem)
                                    </p>
                                    <CepInput
                                        value={partnerData.address.cep}
                                        onChange={(value: string) => patchAddress({ cep: value })}
                                        onAddressFetched={(addr) => patchAddress({
                                            city: addr.city || partnerData.address.city,
                                            state: addr.state || partnerData.address.state,
                                            neighborhood: addr.neighborhood || partnerData.address.neighborhood,
                                            street: addr.street || partnerData.address.street,
                                            ibge: addr.ibge || partnerData.address.ibge,
                                            latitude: typeof addr.latitude === "number" ? addr.latitude : partnerData.address.latitude,
                                            longitude: typeof addr.longitude === "number" ? addr.longitude : partnerData.address.longitude,
                                        })}
                                    />
                                    <div className="grid grid-cols-2 gap-3 items-end">
                                        <Input
                                            name="city"
                                            label="Cidade"
                                            placeholder="Nome da cidade"
                                            value={partnerData.address.city}
                                            onChange={e => patchAddress({ city: e.target.value })}
                                            required
                                        />
                                        <StateComboBox
                                            value={partnerData.address.state}
                                            onChange={v => patchAddress({ state: v })}
                                            className="w-full"
                                        />
                                    </div>
                                    <Input
                                        name="neighborhood"
                                        label="Bairro (Opcional)"
                                        placeholder="Nome do bairro"
                                        value={partnerData.address.neighborhood}
                                        onChange={e => patchAddress({ neighborhood: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        {/* STEP 3 (QUICK / ERP): SOBRE SEU NEGÓCIO */}
                        {!isDesapego && step === 3 && (
                            <div className="space-y-5">
                                <div className="flex items-center gap-4 dark:bg-dark-background/50">
                                    <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border cursor-pointer">
                                        {imagePreview ? <img src={imagePreview} alt="Logo" className="object-cover w-full h-full rounded-full" /> : <Upload className="text-brand-inactive-text w-5 h-5" />}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Logo ou Imagem de Perfil (Opcional)</p>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                                    </div>
                                    <input ref={fileInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleImageChange} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Input name="storeName" label="Nome da Loja ou Marca" placeholder="Ex: Doce Sabor Confeitaria" value={partnerData.storeName} onChange={e => setPartnerData(p => ({ ...p, storeName: e.target.value }))} required />
                                    <PhoneInput name="phone" label="WhatsApp Comercial" value={partnerData.phone} onChange={e => setPartnerData(p => ({ ...p, phone: e.target.value }))} required />
                                </div>
                                <Input name="description" label="Descrição / Bio da Loja" placeholder="Ex: Bolos artesanais, doces para festas e encomendas." type="textarea" value={partnerData.description} onChange={e => setPartnerData(p => ({ ...p, description: e.target.value }))} rows={2} />
                            </div>
                        )}

                        {/* STEP 4 (QUICK / ERP): CATEGORIA */}
                        {!isDesapego && step === 4 && (
                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setCategoryModalOpen(true)}
                                    className="w-full flex items-center justify-between p-4 border border-brand-border dark:border-dark-border rounded-2xl hover:border-brand-green bg-white dark:bg-dark-background text-left transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/10 flex items-center justify-center text-brand-green shrink-0">
                                            <Tag className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                                                {partnerData.categoryName || "Selecionar categoria do negócio"}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                {partnerData.categoryName ? "Clique para alterar" : "Escolha a categoria principal e subcategoria"}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-brand-inactive-text shrink-0" />
                                </button>
                            </div>
                        )}

                        {/* STEP 5 (QUICK / ERP): ENDEREÇO COMPLETO */}
                        {!isDesapego && step === 5 && (
                            <div className="space-y-4">
                                <CepInput
                                    value={partnerData.address.cep}
                                    onChange={(value: string) => patchAddress({ cep: value })}
                                    onAddressFetched={(addr) => patchAddress({
                                        street: addr.street || partnerData.address.street,
                                        number: addr.number || partnerData.address.number,
                                        neighborhood: addr.neighborhood || partnerData.address.neighborhood,
                                        city: addr.city || partnerData.address.city,
                                        state: addr.state || partnerData.address.state,
                                        noNumber: addr.number === "S/N",
                                        ibge: addr.ibge || partnerData.address.ibge,
                                        latitude: typeof addr.latitude === "number" ? addr.latitude : partnerData.address.latitude,
                                        longitude: typeof addr.longitude === "number" ? addr.longitude : partnerData.address.longitude,
                                    })}
                                />
                                <Input name="street" label="Rua/Avenida" placeholder="Rua, Avenida, etc." value={partnerData.address.street} onChange={e => patchAddress({ street: e.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <NumberInputWithCheckbox
                                        label="Número"
                                        number={partnerData.address.number}
                                        noNumber={partnerData.address.noNumber}
                                        onNumberChange={val => patchAddress({ number: val })}
                                        onNoNumberChange={checked => patchAddress({ noNumber: checked, number: checked ? "S/N" : "" })}
                                        placeholder="123"
                                    />
                                    <Input name="complement" label="Complemento" placeholder="Apto, Bloco, etc." value={partnerData.address.complement} onChange={e => patchAddress({ complement: e.target.value })} />
                                </div>
                                <Input name="neighborhood" label="Bairro" placeholder="Nome do bairro" value={partnerData.address.neighborhood} onChange={e => patchAddress({ neighborhood: e.target.value })} />
                                <div className="grid grid-cols-2 gap-3 items-end">
                                    <Input name="city" label="Cidade" placeholder="Nome da cidade" value={partnerData.address.city} onChange={e => patchAddress({ city: e.target.value })} />
                                    <StateComboBox value={partnerData.address.state} onChange={v => patchAddress({ state: v })} className="w-full" />
                                </div>
                            </div>
                        )}

                        {error && <InfoCard message={error} color="red" />}

                        <div className="flex gap-3 pt-2">
                            {step > (isUserLoggedIn ? 2 : 1) && (
                                <Button type="button" variant="outline" onClick={prevStep} className="flex-1 bg-transparent">Voltar</Button>
                            )}
                            <Button type="submit" disabled={isLoading || isSubmitting} className="flex-1">
                                {isLoading || isSubmitting ? <Spinner size={20} /> : step < maxStep ? "Continuar" : "Finalizar Cadastro"}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </AnimatePresence>

            <ImageCropperModal
                isOpen={cropModalOpen}
                onClose={() => { setCropModalOpen(false); setTempImageFile(null) }}
                onConfirm={handleCropComplete}
                imageFile={tempImageFile}
            />

            <PartnerCategoryModal
                isOpen={categoryModalOpen}
                onClose={() => setCategoryModalOpen(false)}
                onSelect={handleCategorySelect}
            />
        </div>
    )
}

