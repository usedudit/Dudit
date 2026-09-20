"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    TrendingUp,
    CheckCircle2,
    ArrowRight,
    HelpCircle,
    ChevronDown,
    Target
} from "lucide-react"

export default function CalculadoraPontoEquilibrioPage() {
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

    const [custosFixos, setCustosFixos] = useState<number>(4500)
    const [precoVendaMedio, setPrecoVendaMedio] = useState<number>(80)
    const [custoVariavelMedio, setCustoVariavelMedio] = useState<number>(35)
    const [openFaq, setOpenFaq] = useState<number | null>(0)

    const margemContribuicaoUnit = Math.max(0.01, precoVendaMedio - custoVariavelMedio)
    const indiceMargemContribuicao = precoVendaMedio > 0 ? (margemContribuicaoUnit / precoVendaMedio) : 0
    const pontoEquilibrioUnidades = Math.ceil(custosFixos / margemContribuicaoUnit)
    const pontoEquilibrioFaturamento = pontoEquilibrioUnidades * precoVendaMedio

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
    }

    const faqs = [
        {
            q: "O que é o Ponto de Equilíbrio (Break-Even Point)?",
            a: "O Ponto de Equilíbrio é o volume de vendas (em quantidade de produtos ou faturamento em R$) necessário para pagar exatamente todas as despesas fixas e variáveis da empresa, sem ter lucro e sem ter prejuízo (resultado zero). A partir desse ponto, cada venda adicional gera lucro líquido real."
        },
        {
            q: "O que são Custos Fixos vs Custos Variáveis?",
            a: "Custos Fixos são aqueles que não mudam independentemente de você vender muito ou pouco no mês (ex: aluguel do ponto comercial, internet, luz, pró-labore dos sócios, salários). Custos Variáveis são aqueles que só existem quando uma venda acontece (ex: custo de compra da mercadoria, taxa de cartão de crédito, comissão de vendedores e impostos sobre a nota)."
        },
        {
            q: "Como o fluxo de caixa e DRE da Dudit ajudam no ponto de equilíbrio?",
            a: "No plano Escalar da Dudit, o DRE (Demonstrativo do Resultado do Exercício) e o Fluxo de Caixa são gerados automaticamente a partir das vendas registradas no PDV e dos custos lançados no sistema, mostrando exatamente em qual dia do mês seu negócio bateu o ponto de equilíbrio."
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
            { "@type": "ListItem", position: 3, name: "Calculadora de Ponto de Equilíbrio", item: "https://dudit.com.br/ferramentas/calculadora-ponto-equilibrio" },
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
                {/* HERO SECTION */}
                <section className="pt-32 pb-20 bg-white relative overflow-hidden">
                    <GridLines />
                    <div className="container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="text-center"
                        >
                            <nav className="flex items-center justify-center gap-2 text-xs text-brand-inactive-text mb-6">
                                <Link href="/" prefetch={false} className="hover:text-brand-green">Início</Link>
                                <span>/</span>
                                <Link href="/ferramentas" className="hover:text-brand-green">Ferramentas</Link>
                                <span>/</span>
                                <span className="text-brand-dark font-semibold">Ponto de Equilíbrio</span>
                            </nav>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-4">
                                Calculadora de Ponto de Equilíbrio (Break-Even)
                            </h1>
                            <p className="text-base sm:text-lg text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                Descubra quantas vendas você precisa fazer por mês para cobrir seus custos fixos e começar a ter lucro.
                            </p>
                        </motion.div>
                    </div>
                </section>

                {/* CALCULATOR CONTAINER */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            {/* INPUTS COLUMN */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6 }}
                                className="lg:col-span-6 bg-white rounded-xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6"
                            >
                                <h2 className="text-xl font-bold text-brand-dark flex items-center gap-2">
                                    <Target className="w-5 h-5 text-purple-600" />
                                    Entradas Financeiras
                                </h2>

                                {/* Custos Fixos */}
                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Custos Fixos Mensais Totais (R$)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={custosFixos}
                                            onChange={(e) => setCustosFixos(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold text-lg"
                                        />
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Aluguel, contas, internet, folha e pró-labore.</span>
                                </div>

                                {/* Preço de Venda Médio */}
                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Preço Médio de Venda (R$)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={precoVendaMedio}
                                            onChange={(e) => setPrecoVendaMedio(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                        />
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Ticket médio de venda por produto ou serviço.</span>
                                </div>

                                {/* Custo Variável Médio */}
                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Custo Variável Médio por Unidade (R$)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={custoVariavelMedio}
                                            onChange={(e) => setCustoVariavelMedio(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                        />
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Custo de compra + taxa de cartão + embalagem + imposto unitário.</span>
                                </div>
                            </motion.div>

                            {/* RESULTS COLUMN */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: 0.15 }}
                                className="lg:col-span-6 bg-brand-dark rounded-xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl"
                            >
                                <div>
                                    <span className="text-brand-green text-xs font-bold uppercase tracking-widest block mb-4">
                                        META DE EQUILÍBRIO MENSAL
                                    </span>

                                    <div className="mb-6 p-6 rounded-2xl bg-brand-green/15 border border-brand-green/30 text-center">
                                        <div className="text-xs font-bold text-brand-green uppercase tracking-wider mb-1">
                                            Faturamento Mínimo para não ter prejuízo:
                                        </div>
                                        <div className="text-4xl sm:text-5xl font-bold text-brand-green mb-2">
                                            {formatBRL(pontoEquilibrioFaturamento)}
                                        </div>
                                        <div className="text-xs text-gray-300">
                                            Você precisa realizar no mínimo <strong>{pontoEquilibrioUnidades} vendas</strong> no mês.
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-8 text-xs">
                                        <div className="flex justify-between py-2 border-b border-white/10">
                                            <span className="text-gray-300">Margem de Contribuição Unitária:</span>
                                            <span className="font-bold text-white">{formatBRL(margemContribuicaoUnit)} ({(indiceMargemContribuicao * 100).toFixed(1)}%)</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-b border-white/10">
                                            <span className="text-gray-300">Vendas diárias necessárias (26 dias úteis):</span>
                                            <span className="font-bold text-white">~{Math.ceil(pontoEquilibrioUnidades / 26)} pedidos/dia</span>
                                        </div>
                                        <div className="flex justify-between py-2.5 bg-white/5 px-3 rounded-lg">
                                            <span className="font-bold text-brand-green">A partir da {pontoEquilibrioUnidades + 1}ª venda:</span>
                                            <span className="font-bold text-brand-green">100% de Lucro Líquido ({formatBRL(margemContribuicaoUnit)}/venda)</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="w-full py-4 rounded-xl bg-brand-green text-white font-bold flex items-center justify-center gap-2 hover:bg-brand-green/90 transition-all shadow-lg hover:scale-[1.02]"
                                    >
                                        <span>Controlar finanças no Dudit</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                    <p className="text-center text-[11px] text-gray-400 mt-3">
                                        DRE simples, fluxo de caixa e controle de lucro por pedido
                                    </p>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* FAQ SECTION */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <h2 className="text-4xl font-bold text-brand-dark mb-4 flex items-center justify-center gap-2">
                                <HelpCircle className="w-6 h-6 text-brand-green" />
                                Entenda o Ponto de Equilíbrio
                            </h2>
                        </motion.div>

                        <div className="space-y-4 max-w-4xl mx-auto">
                            {faqs.map((faq, i) => {
                                const isOpen = openFaq === i
                                return (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.1 }}
                                        className="border border-gray-100 rounded-2xl overflow-hidden bg-white"
                                    >
                                        <button
                                            onClick={() => setOpenFaq(isOpen ? null : i)}
                                            className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
                                        >
                                            <span className="font-semibold text-brand-dark text-lg">{faq.q}</span>
                                            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        </button>
                                        {isOpen && (
                                            <div className="px-6 pb-6 text-sm text-brand-inactive-text leading-relaxed">
                                                {faq.a}
                                            </div>
                                        )}
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
