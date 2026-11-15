"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA, ToolPageHero, FaqSection } from "@/components/InstitucionalShared"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { PercentageInput } from "@/components/reusable/Inputs/PercentageInput"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { ArrowRight } from "lucide-react"

export default function CalculadoraTaxasMarketplacePage() {
    const router = useRouter()
    const [faturamento, setFaturamento] = useState<number>(8000)
    const [taxaPercentual, setTaxaPercentual] = useState<number>(18)
    const [taxaFixaPorPedido, setTaxaFixaPorPedido] = useState<number>(2.5)
    const [quantidadePedidos, setQuantidadePedidos] = useState<number>(160)

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
    const custoDuditMensal = 29.90
    const custoDuditAnual = custoDuditMensal * 12
    const economiaAnual = Math.max(0, custoTotalMarketplaceAnual - custoDuditAnual)

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
    }

    const faqs = [
        {
            question: "Quanto os marketplaces e apps de delivery costumam cobrar de comissão?",
            answer: "A maioria dos marketplaces tradicionais e aplicativos de delivery cobra entre 12% e 27% sobre o valor total do pedido, além de uma taxa fixa por transação (que varia de R$ 1,50 a R$ 4,50). Em pedidos de valor menor, essa combinação pode consumir mais de 30% da sua margem de lucro."
        },
        {
            question: "Como a Dudit consegue cobrar 0% de comissão por venda?",
            answer: "A Dudit opera no modelo SaaS (Software como Serviço) com planos fixos muito acessíveis (a partir de R$ 0 no plano gratuito ou R$ 29,90/mês). Nós não cobramos porcentagem sobre as suas vendas. Todo o valor transacionado cai direto na sua conta.",
        },
        {
            question: "Posso continuar vendendo nos marketplaces e também usar a Dudit?",
            answer: "Com certeza! Muitos lojistas utilizam a Dudit como sua vitrine principal para clientes recorrentes do bairro e redes sociais (WhatsApp/Instagram), economizando nas taxas desses clientes fiéis, enquanto usam marketplaces apenas para atração esporádica."
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
            { "@type": "ListItem", position: 3, name: "Calculadora de Taxas de Marketplace", item: "https://dudit.com.br/ferramentas/calculadora-taxas-marketplace" },
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
                    badge="Calculadora de Taxas"
                    title="Calculadora de Taxas de Marketplace e Delivery"
                    description="Veja quanto dinheiro você está deixando na mesa com comissões de 12% a 27% e descubra quanto economizaria vendendo direto."
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
                                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Dados da sua operação</h2>
                                            <p className="text-sm text-brand-inactive-text mt-1">
                                                Preencha os valores e o resultado é atualizado na hora.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Faturamento mensal"
                                                name="faturamento"
                                                value={faturamento}
                                                onChange={setFaturamento}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Total vendido no mês, somando todos os canais.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <PercentageInput
                                                label="Comissão do marketplace"
                                                name="comissao"
                                                value={taxaPercentual}
                                                onChange={setTaxaPercentual}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                A maioria das plataformas cobra entre 12% e 27%.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Input
                                                label="Pedidos por mês"
                                                name="pedidos"
                                                type="number"
                                                min={1}
                                                value={quantidadePedidos}
                                                onChange={(e) => setQuantidadePedidos(Number(e.target.value) || 0)}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Quantidade média de pedidos fechados no mês.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <MoneyInput
                                                label="Taxa fixa por pedido"
                                                name="taxa-fixa"
                                                value={taxaFixaPorPedido}
                                                onChange={setTaxaFixaPorPedido}
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Se a plataforma cobrar um valor fixo por transação, some aqui. Caso contrário, deixe em zero.
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
                                        <p className="text-sm font-medium text-gray-300">
                                            Você paga em taxas todo mês
                                        </p>
                                        <p className="text-4xl font-bold text-white mt-1">
                                            {formatBRL(custoTotalMarketplaceMensal)}
                                        </p>
                                        <p className="text-sm text-gray-400 dark:text-dark-body mt-2">
                                            Isso equivale a <span className="font-semibold text-white">{formatBRL(custoTotalMarketplaceAnual)}</span> por ano em comissões.
                                        </p>

                                        <div className="mt-6 border-t border-white/10 pt-4 space-y-3 text-sm">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Comissão ({taxaPercentual}%)</span>
                                                <span className="font-semibold text-white">{formatBRL(comissaoPercentualMensal)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Taxas fixas ({quantidadePedidos} pedidos)</span>
                                                <span className="font-semibold text-white">{formatBRL(taxaFixaMensal)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-gray-300">Plano Dudit Crescer (0% de comissão)</span>
                                                <span className="font-semibold text-white">{formatBRL(custoDuditMensal)}</span>
                                            </div>
                                        </div>

                                        <div className="mt-6 rounded-xl bg-brand-green/10 border border-brand-green/20 p-5">
                                            <p className="text-sm font-medium text-brand-green">
                                                Economia anual estimada com a Dudit
                                            </p>
                                            <p className="text-3xl font-bold text-brand-green mt-1">
                                                {formatBRL(economiaAnual)}
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-dark-body mt-2 leading-relaxed">
                                                Sem porcentagem sobre as vendas: o valor de cada pedido cai inteiro na sua conta.
                                            </p>
                                        </div>

                                        <div className="mt-6">
                                            <Button asChild size="lg" className="w-full">
                                                <Link href="/auth/login?mode=partner">
                                                    <span>Começar a vender com 0% de comissão</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            <p className="text-center text-xs text-gray-400 dark:text-dark-body mt-3">
                                                Plano gratuito disponível, sem fidelidade ou contrato preso
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <FaqSection title="Dúvidas frequentes sobre taxas e comissões" items={faqs} />
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
