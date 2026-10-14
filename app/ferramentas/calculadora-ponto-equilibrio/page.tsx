"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA, ToolPageHero, FaqSection } from "@/components/InstitucionalShared"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/reusable/Button"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { ArrowRight } from "lucide-react"

export default function CalculadoraPontoEquilibrioPage() {
    const router = useRouter()
    const [custosFixos, setCustosFixos] = useState<number>(4500)
    const [precoVendaMedio, setPrecoVendaMedio] = useState<number>(80)
    const [custoVariavelMedio, setCustoVariavelMedio] = useState<number>(35)

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else router.push('/')
    }

    const margemContribuicaoUnit = Math.max(0.01, precoVendaMedio - custoVariavelMedio)
    const indiceMargemContribuicao = precoVendaMedio > 0 ? (margemContribuicaoUnit / precoVendaMedio) : 0
    const pontoEquilibrioUnidades = Math.ceil(custosFixos / margemContribuicaoUnit)
    const pontoEquilibrioFaturamento = pontoEquilibrioUnidades * precoVendaMedio

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
    }

    const faqs = [
        {
            question: "O que é o ponto de equilíbrio (break-even point)?",
            answer: "O ponto de equilíbrio é o volume de vendas (em quantidade de produtos ou em faturamento) necessário para pagar exatamente todas as despesas fixas e variáveis da empresa, sem ter lucro e sem ter prejuízo. A partir desse ponto, cada venda adicional gera lucro líquido real."
        },
        {
            question: "O que são custos fixos e custos variáveis?",
            answer: "Custos fixos são aqueles que não mudam independentemente de você vender muito ou pouco no mês (ex: aluguel do ponto comercial, internet, luz, pró-labore dos sócios e salários). Custos variáveis são aqueles que só existem quando uma venda acontece (ex: custo de compra da mercadoria, taxa de cartão, comissão de vendedores e impostos sobre a nota)."
        },
        {
            question: "Como o fluxo de caixa e o DRE da Dudit ajudam no ponto de equilíbrio?",
            answer: "No plano Escalar da Dudit, o DRE e o fluxo de caixa são gerados automaticamente a partir das vendas registradas no PDV e dos custos lançados no sistema, mostrando exatamente em qual dia do mês seu negócio bateu o ponto de equilíbrio."
        }
    ]

    const faqLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(f => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: f.answer,
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
                <ToolPageHero
                    badge="Ponto de Equilíbrio"
                    title="Calculadora de Ponto de Equilíbrio"
                    description="Descubra quantas vendas você precisa fazer por mês para cobrir seus custos fixos e começar a ter lucro."
                />

                <section className="py-24 bg-white relative border-t border-brand-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                viewport={{ once: true }}
                                className="lg:col-span-7"
                            >
                                <Card className="bg-white border-brand-border rounded-3xl shadow-none py-0">
                                    <CardContent className="px-6 py-6 space-y-5">
                                        <div>
                                            <h2 className="text-xl font-bold text-brand-dark">Entradas financeiras</h2>
                                            <p className="text-sm text-brand-inactive-text mt-1">
                                                Preencha os valores do seu negócio para descobrir a meta mensal.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Custos fixos mensais"
                                                name="custos-fixos"
                                                value={custosFixos}
                                                onChange={setCustosFixos}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Aluguel, contas, internet, folha e pró-labore.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Preço médio de venda"
                                                name="preco-medio"
                                                value={precoVendaMedio}
                                                onChange={setPrecoVendaMedio}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Ticket médio por produto ou serviço vendido.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Custo variável por unidade"
                                                name="custo-variavel"
                                                value={custoVariavelMedio}
                                                onChange={setCustoVariavelMedio}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Custo de compra + taxa de cartão + embalagem + imposto unitário.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                viewport={{ once: true }}
                                className="lg:col-span-5"
                            >
                                <Card className="bg-brand-dark border-brand-dark rounded-3xl shadow-none py-0 text-white">
                                    <CardContent className="px-6 py-6">
                                        <div className="rounded-xl bg-brand-green/10 border border-brand-green/20 p-5 text-center">
                                            <p className="text-sm font-medium text-brand-green">
                                                Faturamento mínimo para não ter prejuízo
                                            </p>
                                            <p className="text-4xl font-bold text-brand-green mt-1">
                                                {formatBRL(pontoEquilibrioFaturamento)}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-2">
                                                São no mínimo <span className="font-semibold text-white">{pontoEquilibrioUnidades} vendas</span> por mês
                                            </p>
                                        </div>

                                        <div className="mt-6 border-t border-white/10 pt-4 space-y-3 text-sm">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Margem de contribuição por venda</span>
                                                <span className="font-semibold text-white">
                                                    {formatBRL(margemContribuicaoUnit)} ({(indiceMargemContribuicao * 100).toFixed(1)}%)
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Vendas por dia (26 dias úteis)</span>
                                                <span className="font-semibold text-white">~{Math.ceil(pontoEquilibrioUnidades / 26)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4 rounded-lg bg-brand-green/10 px-3 py-2.5">
                                                <span className="font-semibold text-brand-green">A partir da {pontoEquilibrioUnidades + 1}ª venda</span>
                                                <span className="font-semibold text-brand-green">{formatBRL(margemContribuicaoUnit)} de lucro</span>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <Button asChild size="lg" className="w-full">
                                                <Link href="/auth/login?mode=partner">
                                                    <span>Controlar minhas finanças na Dudit</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            <p className="text-center text-xs text-gray-400 mt-3">
                                                DRE, fluxo de caixa e lucro por pedido direto no sistema
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <FaqSection title="Entenda o ponto de equilíbrio" items={faqs} />
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
