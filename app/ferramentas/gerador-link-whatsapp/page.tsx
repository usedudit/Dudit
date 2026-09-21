"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    MessageCircle,
    Copy,
    Check,
    ExternalLink,
    HelpCircle,
    ChevronDown,
    Sparkles,
    ArrowRight
} from "lucide-react"

export default function GeradorLinkWhatsAppPage() {
    const router = useRouter()
    const [telefone, setTelefone] = useState<string>("11999998888")
    const [mensagem, setMensagem] = useState<string>("Olá! Vi seus produtos e gostaria de fazer um pedido.")
    const [copiado, setCopiado] = useState(false)
    const [openFaq, setOpenFaq] = useState<number | null>(0)

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else router.push('/')
    }

    const digitos = telefone.replace(/\D/g, "")
    const numeroFormatado = digitos.startsWith("55") ? digitos : `55${digitos}`
    const mensagemCodificada = encodeURIComponent(mensagem.trim())
    const linkGerado = digitos.length >= 10
        ? `https://wa.me/${numeroFormatado}?text=${mensagemCodificada}`
        : "https://wa.me/55..."

    const handleCopiar = () => {
        if (typeof window !== "undefined" && digitos.length >= 10) {
            navigator.clipboard.writeText(linkGerado)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2500)
        }
    }

    const faqs = [
        {
            q: "Como colocar o link do WhatsApp na bio do Instagram?",
            a: "1. Copie o link gerado acima; 2. Abra o aplicativo do Instagram e vá no seu perfil; 3. Toque em 'Editar Perfil'; 4. Selecione a opção 'Links' e toque em 'Adicionar link externo'; 5. Cole o link do WhatsApp no campo URL e defina um título como 'Chamar no WhatsApp'."
        },
        {
            q: "Qual a vantagem de ter um catálogo online integrado ao WhatsApp?",
            a: "Com um link simples do WhatsApp, o cliente precisa perguntar o que você tem, preços, tamanhos e fotos um por um. Com a Vitrine Dudit, você coloca o link do seu catálogo na bio: o cliente escolhe os produtos, monta a sacola e o pedido já chega pronto no seu WhatsApp com valor somado e endereço de entrega."
        },
        {
            q: "O gerador de link funciona para WhatsApp Business e WhatsApp comum?",
            a: "Sim! O formato wa.me é o padrão oficial mundial da Meta e funciona perfeitamente para contas pessoais e contas comerciais (WhatsApp Business) em Android, iPhone e WhatsApp Web no computador."
        }
    ]

    const faqLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(f => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: {
                "@type": "Answer",
                text: f.a,
            }
        }))
    }

    const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://dudit.com.br" },
            { "@type": "ListItem", position: 2, name: "Ferramentas", item: "https://dudit.com.br/ferramentas" },
            { "@type": "ListItem", position: 3, name: "Gerador de Link de WhatsApp", item: "https://dudit.com.br/ferramentas/gerador-link-whatsapp" },
        ]
    }

    return (
        <div className="min-h-screen bg-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
                    <GridLines />
                    <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <nav className="flex items-center justify-center gap-2 text-xs text-brand-inactive-text mb-6">
                                <Link href="/" className="hover:text-brand-green">Início</Link>
                                <span>/</span>
                                <Link href="/ferramentas" className="hover:text-brand-green">Ferramentas</Link>
                                <span>/</span>
                                <span className="text-brand-dark font-semibold">Gerador de Link de WhatsApp</span>
                            </nav>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-4 leading-tight">
                                Gerador de Link de WhatsApp Gratuito
                            </h1>
                            <p className="text-lg md:text-xl text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                Crie seu link personalizado com mensagem pronta para usar na bio do Instagram, redes sociais ou anúncios.
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6 }}
                                viewport={{ once: true }}
                                className="lg:col-span-6 bg-white rounded-xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6"
                            >
                                <h2 className="text-xl font-bold text-brand-dark flex items-center gap-2">
                                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                                    Configure seu Link
                                </h2>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Número do WhatsApp (com DDD)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 11999998888"
                                        value={telefone}
                                        onChange={(e) => setTelefone(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold text-lg"
                                    />
                                    <span className="text-[11px] text-gray-400 mt-1 block">Insira DDD + 9 dígitos (o código +55 do Brasil é adicionado automaticamente).</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Mensagem Inicial que o Cliente Enviará
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={mensagem}
                                        onChange={(e) => setMensagem(e.target.value)}
                                        placeholder="Digite o texto que o cliente enviará quando clicar..."
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark text-sm leading-relaxed"
                                    />
                                    <span className="text-[11px] text-gray-400 mt-1 block">Ex: "Olá! Gostaria de agendar um horário" ou "Quero ver o catálogo da loja".</span>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6 }}
                                viewport={{ once: true }}
                                className="lg:col-span-6 bg-brand-dark rounded-xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl"
                            >
                                <div>
                                    <span className="text-brand-green text-xs font-bold uppercase tracking-widest block mb-4">
                                        SEU LINK PRONTO
                                    </span>

                                    <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                                        <span className="text-[11px] text-gray-400 font-mono block mb-2 break-all">
                                            {linkGerado}
                                        </span>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleCopiar}
                                                disabled={digitos.length < 10}
                                                className="flex-1 py-3 px-4 rounded-xl bg-brand-green text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-brand-green/90 transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                {copiado ? "Link Copiado!" : "Copiar Link"}
                                            </button>

                                            {digitos.length >= 10 && (
                                                <a
                                                    href={linkGerado}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="py-3 px-4 rounded-xl bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-white/20 transition-all"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                    Testar
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-gray-300 space-y-2 mb-6">
                                        <div className="font-bold text-white flex items-center gap-1.5">
                                            <Sparkles className="w-4 h-4 text-brand-green" />
                                            Suba de nível com a Vitrine Dudit:
                                        </div>
                                        <p className="leading-relaxed">
                                            Em vez de responder 50 perguntas sobre preço e fotos, coloque sua **Vitrine Dudit** na bio. O cliente vê fotos, escolhe produtos e envia o pedido pronto no seu WhatsApp.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="w-full py-4 rounded-xl bg-white text-brand-dark font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all shadow-lg hover:scale-[1.02]"
                                    >
                                        <span>Criar Catálogo Online Gratuito</span>
                                        <ArrowRight className="w-4 h-4 text-brand-green" />
                                    </Link>
                                    <p className="text-center text-[11px] text-gray-400 mt-3">
                                        Link único na bio com todos os seus produtos e 0% de comissão
                                    </p>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <h3 className="text-2xl font-bold text-brand-dark mb-6 flex items-center gap-2">
                            <HelpCircle className="w-5 h-5 text-brand-green" />
                            Dúvidas sobre Links de WhatsApp
                        </h3>

                        <div className="space-y-4">
                            {faqs.map((faq, i) => {
                                const isOpen = openFaq === i
                                return (
                                    <div
                                        key={i}
                                        className="border border-gray-100 rounded-xl overflow-hidden bg-white"
                                    >
                                        <button
                                            onClick={() => setOpenFaq(isOpen ? null : i)}
                                            className="w-full flex items-center justify-between p-5 text-left font-bold text-brand-dark text-base hover:bg-gray-50 transition-colors"
                                        >
                                            <span>{faq.q}</span>
                                            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        </button>
                                        {isOpen && (
                                            <div className="px-5 pb-5 text-sm text-brand-inactive-text leading-relaxed">
                                                {faq.a}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
