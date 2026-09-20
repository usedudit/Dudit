"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Calculator,
    Percent,
    TrendingUp,
    MessageCircle,
    ArrowRight,
    Sparkles,
    CheckCircle2
} from "lucide-react"

const tools = [
    {
        title: "Calculadora de Taxas de Marketplace",
        description: "Descubra quanto você paga em comissões (12% a 27%) em marketplaces e apps de delivery vs vender com 0% de comissão na Dudit.",
        href: "/ferramentas/calculadora-taxas-marketplace",
        icon: Percent,
        badge: "Mais Usada",
        highlightColor: "text-brand-green bg-brand-green/10 border-brand-green/20",
    },
    {
        title: "Calculadora de Margem de Lucro & Preço de Venda",
        description: "Calcule o Markup ideal para seus produtos e serviços considerando custos, despesas, impostos e a margem de lucro líquido desejada.",
        href: "/ferramentas/calculadora-margem-lucro-preco-venda",
        icon: Calculator,
        badge: "Precificação",
        highlightColor: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
        title: "Calculadora de Ponto de Equilíbrio (Break-Even)",
        description: "Descubra exatamente quanto sua loja precisa faturar por mês para pagar todas as contas fixas e começar a lucrar de verdade.",
        href: "/ferramentas/calculadora-ponto-equilibrio",
        icon: TrendingUp,
        badge: "Gestão",
        highlightColor: "text-purple-600 bg-purple-50 border-purple-100",
    },
    {
        title: "Gerador de Link de WhatsApp para Bio",
        description: "Gere links personalizados no formato wa.me com mensagem inicial pronta para colocar na bio do Instagram ou enviar a clientes.",
        href: "/ferramentas/gerador-link-whatsapp",
        icon: MessageCircle,
        badge: "Vendas",
        highlightColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
]

const hubSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Ferramentas e Calculadoras Gratuitas para Lojistas e MEIs | Dudit",
    description: "Calculadoras de taxas de marketplace, precificação, ponto de equilíbrio e links de WhatsApp para pequenos comerciantes.",
    url: "https://dudit.com.br/ferramentas",
    publisher: {
        "@type": "Organization",
        name: "Dudit",
        url: "https://dudit.com.br",
        logo: "https://img.dudit.com.br/static/Logo.png",
    },
}

export default function FerramentasHubPage() {
    const router = useRouter()

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else router.push('/')
    }

    return (
        <div className="min-h-screen bg-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(hubSchema) }}
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
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold uppercase tracking-wider mb-6 border border-brand-green/20">
                                <Sparkles className="w-3.5 h-3.5" />
                                100% Gratuitas e Sem Cadastro Prévio
                            </div>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-6 leading-tight">
                                Calculadoras e Ferramentas para <br className="hidden sm:inline" />
                                <span className="text-brand-green">fazer seu negócio lucrar mais.</span>
                            </h1>

                            <p className="text-lg md:text-xl text-brand-inactive-text max-w-2xl mx-auto leading-relaxed mb-8">
                                Simuladores práticos e diretos ao ponto desenvolvidos para comerciantes, autônomos e prestadores de serviços no Brasil.
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {tools.map((tool, idx) => {
                                const IconComponent = tool.icon
                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        viewport={{ once: true }}
                                    >
                                        <Link
                                            href={tool.href}
                                            className="group bg-white rounded-xl p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:border-brand-green/30 transition-all duration-300 flex flex-col justify-between h-full"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${tool.highlightColor}`}>
                                                        <IconComponent className="w-7 h-7" />
                                                    </div>
                                                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-50 text-brand-inactive-text border border-gray-100">
                                                        {tool.badge}
                                                    </span>
                                                </div>

                                                <h2 className="text-2xl font-bold text-brand-dark mb-3 group-hover:text-brand-green transition-colors">
                                                    {tool.title}
                                                </h2>

                                                <p className="text-brand-inactive-text text-sm leading-relaxed mb-8">
                                                    {tool.description}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 text-sm font-bold text-brand-green group-hover:translate-x-1 transition-transform">
                                                <span>Usar calculadora agora</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </div>
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                <CTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    )
}
