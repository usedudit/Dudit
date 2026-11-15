"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA, ToolPageHero, FaqSection } from "@/components/InstitucionalShared"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/reusable/Button"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { PercentageInput } from "@/components/reusable/Inputs/PercentageInput"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { ArrowRight } from "lucide-react"

export default function CalculadoraMargemLucroPage() {
    const router = useRouter()
    const [custoProduto, setCustoProduto] = useState<number>(50)
    const [despesasVariaveis, setDespesasVariaveis] = useState<number>(10)
    const [despesasFixas, setDespesasFixas] = useState<number>(15)
    const [margemLucroDesejada, setMargemLucroDesejada] = useState<number>(25)

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
            question: "Qual a diferença entre margem de lucro e markup?",
            answer: "A margem de lucro é a porcentagem do preço final de venda que sobra como lucro líquido. Já o markup é o multiplicador aplicado sobre o custo do produto para chegar ao preço de venda. Por exemplo: se você compra por R$ 50 e vende por R$ 100, seu markup é de 2.0x (100%), mas sua margem bruta é de 50%."
        },
        {
            question: "Por que não devo apenas somar a porcentagem de lucro ao custo?",
            answer: "Somar uma porcentagem diretamente ao custo (ex: R$ 100 + 20% = R$ 120) é o erro mais comum no comércio. Ao vender por R$ 120, se você pagar 10% de imposto e 5% de taxa de cartão sobre o total, o desconto incidirá sobre R$ 120, consumindo quase todo o seu lucro esperado. A fórmula correta é o markup divisor."
        },
        {
            question: "Como a Dudit ajuda no controle de preços e estoque?",
            answer: "No ERP da Dudit, ao cadastrar seus produtos, você define o preço de custo e preço de venda. O sistema calcula automaticamente o lucro por item, avisa quando o estoque estiver acabando e gera relatórios completos de vendas no PDV e no WhatsApp."
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
            { "@type": "ListItem", position: 3, name: "Calculadora de Margem de Lucro", item: "https://dudit.com.br/ferramentas/calculadora-margem-lucro-preco-venda" },
        ]
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
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
                    badge="Preço de Venda e Markup"
                    title="Calculadora de Margem de Lucro e Preço de Venda"
                    description="Calcule o preço de venda ideal pelo markup divisor para nunca mais ter prejuízo nas suas vendas."
                />

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-brand-border">
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
                                <Card className="bg-white dark:bg-dark-surface border-brand-border rounded-3xl shadow-none py-0">
                                    <CardContent className="px-6 py-6 space-y-5">
                                        <div>
                                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Custos e despesas</h2>
                                            <p className="text-sm text-brand-inactive-text mt-1">
                                                Informe o custo do item e quanto a venda consome em impostos e despesas.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Custo do produto ou serviço"
                                                name="custo-produto"
                                                value={custoProduto}
                                                onChange={setCustoProduto}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Quanto você pagou pelo produto ou insumo.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <PercentageInput
                                                label="Despesas variáveis sobre a venda"
                                                name="despesas-variaveis"
                                                value={despesasVariaveis}
                                                onChange={setDespesasVariaveis}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Impostos (Simples ou MEI), taxas de cartão e comissão de vendedores.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <PercentageInput
                                                label="Despesas fixas rateadas"
                                                name="despesas-fixas"
                                                value={despesasFixas}
                                                onChange={setDespesasFixas}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Aluguel, luz, água, internet e pró-labore divididos pelo volume de vendas.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <PercentageInput
                                                label="Margem de lucro líquida desejada"
                                                name="margem-lucro"
                                                value={margemLucroDesejada}
                                                onChange={setMargemLucroDesejada}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                O lucro limpo que deve sobrar na conta após pagar tudo.
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
                                                Preço de venda recomendado
                                            </p>
                                            <p className="text-4xl font-bold text-brand-green mt-1">
                                                {formatBRL(precoVendaCalculado)}
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-dark-body mt-2">
                                                Markup de <span className="font-semibold text-white">{markupMultiplicador.toFixed(2)}x</span> sobre o custo
                                            </p>
                                        </div>

                                        <div className="mt-6 border-t border-white/10 pt-4 space-y-3 text-sm">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Custo do produto</span>
                                                <span className="font-semibold text-white">{formatBRL(custoProduto)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Despesas variáveis ({despesasVariaveis}%)</span>
                                                <span className="font-semibold text-white">{formatBRL(valorDespesasVariaveis)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Despesas fixas ({despesasFixas}%)</span>
                                                <span className="font-semibold text-white">{formatBRL(valorDespesasFixas)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4 rounded-lg bg-brand-green/10 px-3 py-2.5">
                                                <span className="font-semibold text-brand-green">Lucro líquido ({margemLucroDesejada}%)</span>
                                                <span className="font-semibold text-brand-green">{formatBRL(lucroLiquidoReal)}</span>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <Button asChild size="lg" className="w-full">
                                                <Link href="/auth/login?mode=partner">
                                                    <span>Cadastrar produtos no ERP Dudit</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            <p className="text-center text-xs text-gray-400 dark:text-dark-body mt-3">
                                                Controle de estoque, vendas no PDV e catálogo online gratuito
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <FaqSection title="Como precificar produtos corretamente" items={faqs} />
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
