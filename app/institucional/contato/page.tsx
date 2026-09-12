"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { MailIcon, PhoneIcon, ClockIcon, CheckCircleIcon } from "@/lib/icons"
import { Button, EmailInput, FormDropdown, FormTextarea, InfoCard, Spinner } from "@/components/reusable"
import { GridLines, Navbar, Footer, CTA } from "@/components/InstitucionalShared"
import { submitSupportTicketAction, type SupportCategory } from "@/app/actions/support"

const SUPPORT_CATEGORIES = [
    { value: "duvida", label: "Dúvida" },
    { value: "bug", label: "Bug / Problema Técnico" },
    { value: "sugestao", label: "Sugestão" },
    { value: "problema-conta", label: "Problema com Conta" },
    { value: "problema-pedido", label: "Problema com Pedido" },
    { value: "cobranca-plano", label: "Cobrança / Plano" },
    { value: "outro", label: "Outro" },
]

const WHATSAPP_NUMBER = "5511999999999"

export default function ContatoPage() {
    const router = useRouter()

    const [email, setEmail] = useState("")
    const [category, setCategory] = useState("")
    const [description, setDescription] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSuccess, setIsSuccess] = useState(false)
    const [ticketId, setTicketId] = useState<string | null>(null)

    const onNavigate = (page: string) => {
        if (page === "home") router.push("/institucional/inicio")
        else if (page === "about") router.push("/institucional/sobre")
        else if (page === "segments") router.push("/institucional/segmentos")
        else if (page === "pricing") router.push("/institucional/planos")
        else if (page === "terms") router.push("/institucional/termos")
        else if (page === "privacidade") router.push("/institucional/privacidade")
        else if (page === "start-selling") router.push("/auth/login?mode=partner")
        else router.push("/")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)

        if (!email.trim() || !email.includes("@")) {
            setErrorMessage("Por favor, informe um e-mail válido.")
            return
        }

        if (!category) {
            setErrorMessage("Por favor, selecione o motivo do contato.")
            return
        }

        if (description.trim().length < 10) {
            setErrorMessage("A descrição deve conter pelo menos 10 caracteres.")
            return
        }

        setIsSubmitting(true)

        try {
            const res = await submitSupportTicketAction({
                email: email.trim(),
                category: category as SupportCategory,
                description: description.trim(),
                pageUrl: typeof window !== "undefined" ? window.location.href : null,
                metadata: {
                    browser: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
                    screen: typeof window !== "undefined"
                        ? `${window.innerWidth}x${window.innerHeight}`
                        : "unknown",
                    app_area: "institucional-contato",
                },
            })

            if (res.success && res.ticketId) {
                setTicketId(res.ticketId)
                setIsSuccess(true)
            } else {
                setErrorMessage(res.error || "Ocorreu um erro ao enviar. Tente novamente.")
            }
        } catch {
            setErrorMessage("Erro de conexão. Verifique sua internet e tente novamente.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar onNavigate={onNavigate} />

            <main>
                {/* Hero Section */}
                <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
                    <GridLines />
                    <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            {/* Lado Esquerdo - Formulário */}
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6 }}
                            >
                                <h1 className="text-5xl font-bold text-brand-dark mb-6">
                                    Fale com a gente
                                </h1>
                                <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                                    Tire suas dúvidas, reporte problemas ou envie sugestões. Nossa equipe responde pelo e-mail informado.
                                </p>

                                {!isSuccess ? (
                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div className="space-y-1.5">
                                            <EmailInput
                                                label="Seu e-mail"
                                                value={email}
                                                onChange={(e: any) => setEmail(e.target.value)}
                                                placeholder="seu@email.com"
                                            />
                                        </div>

                                        <FormDropdown
                                            label="Motivo do contato"
                                            options={SUPPORT_CATEGORIES}
                                            value={category}
                                            setValue={(v) => {
                                                setCategory(v)
                                                setErrorMessage(null)
                                            }}
                                            placeholder="Selecione o motivo"
                                        />

                                        <div className="space-y-1">
                                            <FormTextarea
                                                label="Descreva seu problema ou dúvida"
                                                placeholder="Quanto mais detalhes, mais rápido podemos ajudar..."
                                                value={description}
                                                onChange={(e: any) => setDescription(e.target.value)}
                                                maxLength={2000}
                                                showCharacterCount
                                                rows={5}
                                                required
                                            />
                                        </div>

                                        {errorMessage && <InfoCard color="red" message={errorMessage} />}

                                        <Button
                                            type="submit"
                                            disabled={isSubmitting || !category || description.trim().length < 10}
                                            className="w-full h-12"
                                        >
                                            {isSubmitting ? (
                                                <span className="flex items-center gap-2">
                                                    <Spinner size={18} color="white" />
                                                    Enviando...
                                                </span>
                                            ) : (
                                                "Enviar Mensagem"
                                            )}
                                        </Button>
                                    </form>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-2xl p-8 text-center space-y-4"
                                    >
                                        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                                            <CheckCircleIcon className="w-8 h-8 text-green-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-brand-dark">Mensagem Enviada!</h3>
                                        <p className="text-brand-inactive-text text-sm">
                                            Seu ticket <strong className="text-brand-dark">{ticketId}</strong> foi registrado.
                                            Responderemos no e-mail <strong>{email}</strong>.
                                        </p>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setIsSuccess(false)
                                                setTicketId(null)
                                                setEmail("")
                                                setCategory("")
                                                setDescription("")
                                            }}
                                        >
                                            Enviar outra mensagem
                                        </Button>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* Lado Direito - Imagem + Info */}
                            <motion.div
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="relative h-[400px] lg:h-[500px] flex items-center justify-center"
                            >
                                <div className="relative z-10 w-full max-w-[460px]">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                        alt="Fale com a Dudit"
                                        className="w-full h-auto object-contain"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-brand-gray/50 rounded-[4rem] transform rotate-6 scale-90 -z-10" />
                                <div className="absolute inset-0 bg-brand-green/5 rounded-[4rem] transform -rotate-3 scale-95 -z-10" />
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Canais de Atendimento */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="text-center mb-16">
                            <span className="text-sm font-medium tracking-wider uppercase mb-4 block text-brand-inactive-text">
                                CANAIS DE ATENDIMENTO
                            </span>
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-brand-dark">
                                Como prefere falar conosco?
                            </h2>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0 }}
                                viewport={{ once: true }}
                                className="bg-brand-slate border border-gray-100 rounded-2xl p-8 text-center"
                            >
                                <div className="w-14 h-14 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
                                    <MailIcon className="w-7 h-7 text-blue-600" />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark mb-2">E-mail</h3>
                                <p className="text-brand-inactive-text text-sm mb-4">
                                    Envie sua mensagem e respondemos em até 24h.
                                </p>
                                <a
                                    href="mailto:contato@dudit.com.br"
                                    className="text-brand-green font-semibold text-sm hover:underline"
                                >
                                    contato@dudit.com.br
                                </a>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                viewport={{ once: true }}
                                className="bg-brand-slate border border-gray-100 rounded-2xl p-8 text-center"
                            >
                                <div className="w-14 h-14 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-6">
                                    <PhoneIcon className="w-7 h-7 text-green-600" />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark mb-2">WhatsApp</h3>
                                <p className="text-brand-inactive-text text-sm mb-4">
                                    Para assinantes dos planos Crescer e Escalar.
                                </p>
                                <a
                                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Olá! Preciso de ajuda com a Dudit.")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand-green font-semibold text-sm hover:underline"
                                >
                                    Falar no WhatsApp
                                </a>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                viewport={{ once: true }}
                                className="bg-brand-slate border border-gray-100 rounded-2xl p-8 text-center"
                            >
                                <div className="w-14 h-14 mx-auto bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
                                    <ClockIcon className="w-7 h-7 text-purple-600" />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark mb-2">Horário</h3>
                                <p className="text-brand-inactive-text text-sm mb-4">
                                    Atendimento de segunda a sexta.
                                </p>
                                <span className="text-brand-green font-semibold text-sm">
                                    9h às 18h
                                </span>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <CTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    )
}
