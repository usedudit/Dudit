"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Percent,
    TrendingDown,
    CheckCircle2,
    ArrowRight,
    HelpCircle,
    ChevronDown
} from "lucide-react"

export default function CalculadoraTaxasMarketplacePage() {
    const router = useRouter()
    const [faturamento, setFaturamento] = useState<number>(8000)
    const [taxaPercentual, setTaxaPercentual] = useState<number>(18)
    const [taxaFixaPorPedido, setTaxaFixaPorPedido] = useState<number>(2.5)
    const [quantidadePedidos, setQuantidadePedidos] = useState<number>(160)
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

    const comissaoPercentualMensal = (faturamento * taxaPercentual) / 100
    const taxaFixaMensal = taxaFixaPorPedido * quantidadePedidos
    const custoTotalMarketplaceMensal = comissaoPercentualMensal + taxaFixaMensal
    const custoTotalMarketplaceAnual = custoTotalMarketplaceMensal * 12
    const custoDuditMensal = 19.90
    const custoDuditAnual = custoDuditMensal * 12
    const economiaAnual = Math.max(0, custoTotalMarketplaceAnual - custoDuditAnual)

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
    }

    const faqs = [
        {
            q: "Quanto os marketplaces e apps de delivery costumam cobrar de comissão?",
            a: "A maioria dos marketplaces tradicionais e aplicativos de delivery cobra entre 12% e 27% sobre o valor total do pedido, além de uma taxa fixa por transação (que varia de R$ 1,50 a R$ 4,50). Em pedidos de valor menor, essa combinação pode consumir mais de 30% da sua margem de lucro."
        },
        {
            q: "Como a Dudit consegue cobrar 0% de comissão por venda?",
            a: "A Dudit opera no modelo SaaS (Software como Serviço) com planos fixos muito acessíveis (a partir de R$ 0 no plano gratuito ou R$ 19,90/mês). Nós não cobramos porcentagem sobre as suas vendas. Todo o valor transacionado cai direto na sua conta."
        },
        {
            q: "Posso continuar vendendo nos marketplaces e também usar a Dudit?",
            a: "Com certeza! Muitos lojistas utilizam a Dudit como sua vitrine principal para clientes recorrentes do bairro e redes sociais (WhatsApp/Instagram), economizando nas taxas desses clientes fiéis, enquanto usam marketplaces apenas para atração esporádica."
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
            { "@type": "ListItem", position: 3, name: "Calculadora de Taxas de Marketplace", item: "https://dudit.com.br/ferramentas/calculadora-taxas-marketplace" },
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
                                <span className="text-brand-dark font-semibold">Calculadora de Taxas</span>
                            </nav>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-4 leading-tight">
                                Calculadora de Taxas de Marketplace & Delivery
                            </h1>
                            <p className="text-lg md:text-xl text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                Veja quanto dinheiro você está deixando na mesa com comissões de 12% a 27% e descubra quanto economizaria vendendo direto.
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
                                    <Percent className="w-5 h-5 text-brand-green" />
                                    Dados da sua operação
                                </h2>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Faturamento Mensal (R$)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={faturamento}
                                            onChange={(e) => setFaturamento(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold text-lg"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                                            Comissão do Marketplace (%)
                                        </label>
                                        <span className="text-sm font-bold text-brand-green">{taxaPercentual}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="35"
                                        step="1"
                                        value={taxaPercentual}
                                        onChange={(e) => setTaxaPercentual(Number(e.target.value))}
                                        className="w-full accent-brand-green cursor-pointer h-2 bg-gray-100 rounded-lg"
                                    />
                                    <div className="flex justify-between text-[11px] text-gray-400 mt-1 font-medium">
                                        <span>5% (Mínimo)</span>
                                        <span>18% (Média iFood/ML)</span>
                                        <span>35% (Apps Premium)</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Pedidos por Mês
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={quantidadePedidos}
                                        onChange={(e) => setQuantidadePedidos(Number(e.target.value) || 0)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-brand-dark uppercase tracking-wider mb-2">
                                        Taxa fixa por pedido (se houver)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={taxaFixaPorPedido}
                                            onChange={(e) => setTaxaFixaPorPedido(Number(e.target.value) || 0)}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-brand-dark font-bold"
                                        />
                                    </div>
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
                                        RESULTADO DA SIMULAÇÃO
                                    </span>

                                    <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                                        <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-1">
                                            <TrendingDown className="w-4 h-4" />
                                            Você perde em taxas todo mês:
                                        </div>
                                        <div className="text-3xl sm:text-4xl font-bold text-red-400">
                                            {formatBRL(custoTotalMarketplaceMensal)}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Isso equivale a <strong>{formatBRL(custoTotalMarketplaceAnual)}</strong> por ano em comissões.
                                        </div>
                                    </div>

                                    <div className="mb-8 p-6 rounded-2xl bg-brand-green/15 border border-brand-green/30">
                                        <div className="text-xs font-bold text-brand-green uppercase tracking-wider mb-1">
                                            Economia estimada com a Dudit (0% taxa):
                                        </div>
                                        <div className="text-4xl sm:text-5xl font-bold text-brand-green mb-2">
                                            {formatBRL(economiaAnual)}
                                        </div>
                                        <p className="text-xs text-gray-300 leading-relaxed">
                                            Dinheiro que volta 100% para o seu bolso para reinvestir em estoque, marketing ou lucro real da sua empresa.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="w-full py-4 rounded-xl bg-brand-green text-white font-bold flex items-center justify-center gap-2 hover:bg-brand-green/90 transition-all shadow-lg hover:scale-[1.02]"
                                    >
                                        <span>Começar a vender com 0% de comissão</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                    <p className="text-center text-[11px] text-gray-400 mt-3">
                                        Plano gratuito disponível • Sem fidelidade ou contrato preso
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
                            Dúvidas Frequentes sobre Taxas e Comissões
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
