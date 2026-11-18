"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA, ToolPageHero } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Calculator,
    Percent,
    TrendingUp,
    MessageCircle,
    ArrowRight
} from "lucide-react"

const tools = [
    {
        title: "Calculadora de Taxas de Marketplace",
        description: "Veja quanto você paga em comissões de 12% a 27% em marketplaces e apps de delivery e quanto economizaria vendendo direto.",
        href: "/ferramentas/calculadora-taxas-marketplace",
        icon: Percent,
    },
    {
        title: "Calculadora de Margem de Lucro e Preço de Venda",
        description: "Calcule o markup ideal para seus produtos e serviços considerando custos, despesas, impostos e a margem de lucro desejada.",
        href: "/ferramentas/calculadora-margem-lucro-preco-venda",
        icon: Calculator,
    },
    {
        title: "Calculadora de Ponto de Equilíbrio",
        description: "Descubra quanto sua loja precisa faturar por mês para pagar todas as contas fixas e começar a lucrar de verdade.",
        href: "/ferramentas/calculadora-ponto-equilibrio",
        icon: TrendingUp,
    },
    {
        title: "Gerador de Link de WhatsApp",
        description: "Gere links personalizados no formato wa.me com mensagem inicial pronta para colocar na bio do Instagram ou enviar a clientes.",
        href: "/ferramentas/gerador-link-whatsapp",
        icon: MessageCircle,
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
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(hubSchema) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <ToolPageHero
                    title={
                        <>
                            Calculadoras e ferramentas para{" "}
                            <span className="text-brand-green">fazer seu negócio lucrar mais</span>
                        </>
                    }
                    description="Simuladores práticos e diretos ao ponto para comerciantes, autônomos e prestadores de serviços. Gratuitos e sem cadastro."
                />

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-brand-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {tools.map((tool, idx) => {
                                const IconComponent = tool.icon
                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.08 }}
                                        viewport={{ once: true }}
                                    >
                                        <Link
                                            href={tool.href}
                                            className="group h-full bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border hover:border-brand-green/40 transition-colors flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center gap-3 mb-6">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                                                        <IconComponent className="w-[18px] h-[18px] text-brand-dark dark:text-dark-heading" />
                                                    </div>
                                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight group-hover:text-brand-green transition-colors">
                                                        {tool.title}
                                                    </h2>
                                                </div>

                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                    {tool.description}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 text-sm font-bold text-brand-green mt-6">
                                                <span>Usar agora</span>
                                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
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
