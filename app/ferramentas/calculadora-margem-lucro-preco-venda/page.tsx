"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Calculator,
    TrendingUp,
    CheckCircle2,
    ArrowRight,
    HelpCircle,
    ChevronDown,
    DollarSign,
    Percent
} from "lucide-react"

export default function CalculadoraMargemLucroPage() {
    const router = useRouter()
    const [custoProduto, setCustoProduto] = useState<number>(50)
    const [despesasVariaveis, setDespesasVariaveis] = useState<number>(10)
    const [despesasFixas, setDespesasFixas] = useState<number>(15)
    const [margemLucroDesejada, setMargemLucroDesejada] = useState<number>(25)
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

    const somaPercentuais = (despesasVariaveis + despesasFixas + margemLucroDesejada) / 100
    const markupDivisor = Math.max(0.01, 1 - somaPercentuais)
    const precoVendaCalculado = markupDivisor > 0 ? custoProduto / markupDivisor : custoProduto * 2

    const valorDespesasVariaveis = (precoVendaCalculado * despesasVariaveis) / 100
    const valorDespesasFixas = (precoVendaCalculado * despesasFixas) / 100
    const lucroLiquidoReal = (precoVendaCalculado * margemLucroDesejada) / 100
    const markupMultiplicador = custoProduto > 0 ? precoVendaCalculado / custoProduto : 1

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
    }

    const faqs = [
        {
            q: "Qual a diferença entre Margem de Lucro e Markup?",
            a: "A margem de lucro é a porcentagem do preço final de venda que sobra como lucro líquido. Já o Markup é o multiplicador aplicado sobre o custo do produto para chegar ao preço de venda. Por exemplo: se você compra por R$ 50 e vende por R$ 100, seu Markup é de 2.0x (100%), mas sua margem bruta é de 50%."
        },
        {
            q: "Por que não devo apenas somar a porcentagem de lucro ao custo?",
            a: "Somar uma porcentagem diretamente ao custo (ex: R$ 100 + 20% = R$ 120) é o erro mais comum no comércio. Ao vender por R$ 120, se você pagar 10% de imposto e 5% de taxa de cartão sobre o total, o desconto incidirá sobre R$ 120, consumindo quase todo o seu lucro esperado. A fórmula correta é o Markup Divisor."
        },
        {
            q: "Como a Dudit ajuda no controle de preços e estoque?",
            a: "No ERP da Dudit, ao cadastrar seus produtos, você define o preço de custo e preço de venda. O sistema calcula automaticamente o lucro por item, avisa quando o estoque estiver acabando e gera relatórios completos de vendas no PDV e WhatsApp."
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
            { "@type": "ListItem", position: 3, name: "Calculadora de Margem de Lucro", item: "https://dudit.com.br/ferramentas/calculadora-margem-lucro-preco-venda" },
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
                                <Link href="/" prefetch={false} className="hover:text-brand-green">Início</Link>
                                <span>/</span>
                                <Link href="/ferramentas" className="hover:text-brand-green">Ferramentas</Link>
                                <span>/</span>
                                <span className="text-brand-dark font-semibold">Calculadora de Preço de Venda</span>
                            </nav>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-4 leading-tight">
                                Calculadora de Margem de Lucro & Preço de Venda
                            </h1>
                            <p className="text-lg md:text-xl text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                Calcule o preço de venda ideal (Markup Divisor) para nunca mais ter prejuízo nas suas vendas.
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
                                    <Calculator className="w-5 h-5 text-blue-600" />
                                    Custos e Despesas
                                </h2>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Custo do Produto / Serviço (R$)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={custoProduto}
                                            onChange={(e) => setCustoProduto(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold text-lg"
                                        />
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Quanto você pagou pelo produto ou insumo.</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Despesas Variáveis (% sobre a venda)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max="50"
                                            value={despesasVariaveis}
                                            onChange={(e) => setDespesasVariaveis(Number(e.target.value) || 0)}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">%</span>
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Impostos (Simples/MEI), taxas de cartão, comissões de vendedores.</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Despesas Fixas Rateadas (% estimada)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max="50"
                                            value={despesasFixas}
                                            onChange={(e) => setDespesasFixas(Number(e.target.value) || 0)}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">%</span>
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">Aluguel, luz, água, internet e pró-labore divididos pelo volume.</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Margem de Lucro Líquida Desejada (%)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            max="80"
                                            value={margemLucroDesejada}
                                            onChange={(e) => setMargemLucroDesejada(Number(e.target.value) || 0)}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold text-brand-green"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">%</span>
                                    </div>
                                    <span className="text-[11px] text-gray-400 mt-1 block">O lucro limpo que deve sobrar na conta após pagar tudo.</span>
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
                                        PREÇO DE VENDA RECOMENDADO
                                    </span>

                                    <div className="mb-6 p-6 rounded-2xl bg-brand-green/15 border border-brand-green/30 text-center">
                                        <div className="text-xs font-bold text-brand-green uppercase tracking-wider mb-1">
                                            Você deve vender por:
                                        </div>
                                        <div className="text-4xl sm:text-5xl font-bold text-brand-green mb-2">
                                            {formatBRL(precoVendaCalculado)}
                                        </div>
                                        <div className="text-xs text-gray-300">
                                            Markup Multiplicador: <strong>{markupMultiplicador.toFixed(2)}x</strong>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-8 text-xs">
                                        <div className="flex justify-between py-2 border-b border-white/10">
                                            <span className="text-gray-300">Custo do Produto:</span>
                                            <span className="font-bold text-white">{formatBRL(custoProduto)}</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-b border-white/10">
                                            <span className="text-gray-300">Despesas Variáveis ({despesasVariaveis}%):</span>
                                            <span className="font-bold text-gray-300">{formatBRL(valorDespesasVariaveis)}</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-b border-white/10">
                                            <span className="text-gray-300">Despesas Fixas ({despesasFixas}%):</span>
                                            <span className="font-bold text-gray-300">{formatBRL(valorDespesasFixas)}</span>
                                        </div>
                                        <div className="flex justify-between py-2.5 bg-white/5 px-3 rounded-lg">
                                            <span className="font-bold text-brand-green">Lucro Líquido Real ({margemLucroDesejada}%):</span>
                                            <span className="font-bold text-brand-green">{formatBRL(lucroLiquidoReal)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="w-full py-4 rounded-xl bg-brand-green text-white font-bold flex items-center justify-center gap-2 hover:bg-brand-green/90 transition-all shadow-lg hover:scale-[1.02]"
                                    >
                                        <span>Cadastrar produtos no ERP Dudit</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                    <p className="text-center text-[11px] text-gray-400 mt-3">
                                        Controle de estoque, vendas no PDV e catálogo online gratuito
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
                            Como Precificar Produtos Corretamente
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
