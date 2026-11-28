"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    BarChart3,
    Calendar,
    ArrowRight
} from "lucide-react"

const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Índice de Taxas e Economia do Pequeno Comércio Local Brasil - Dudit",
    description: "Dados estatísticos sobre comissões cobradas por marketplaces e economia gerada pelo modelo de taxa zero.",
    creator: {
        "@type": "Organization",
        name: "Dudit",
        url: "https://dudit.com.br",
    },
    temporalCoverage: "2026/2026",
    spatialCoverage: "Brasil",
    license: "https://creativecommons.org/licenses/by/4.0/",
}

export default function EstatisticasPage() {
    const router = useRouter()

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/explorar')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else router.push('/')
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datasetSchema) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <section className="relative bg-white dark:bg-dark-surface pt-32 pb-20 overflow-hidden flex flex-col justify-center">
                    <GridLines />
                    <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4 relative z-10 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider mb-6 border border-emerald-100 dark:border-emerald-900/50">
                                <BarChart3 className="w-3.5 h-3.5" />
                                Dados Factuals &amp; Metodologia Oficial
                            </div>

                            <h1 className="text-5xl font-bold text-brand-dark dark:text-dark-heading tracking-tight mb-4 leading-tight">
                                Estatísticas e Benchmark do <br />
                                <span className="text-brand-green">Comércio Local no Brasil</span>
                            </h1>

                            <p className="text-lg md:text-xl text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                Relatório sobre o impacto das taxas de intermediação, economia média dos lojistas e eficiência operacional de catálogos locais.
                            </p>

                            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-dark-body mt-4">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Última atualização: Setembro de 2026 • Fonte primária: Dudit.</span>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0 }}
                                viewport={{ once: true }}
                                className="bg-white dark:bg-dark-surface rounded-xl p-8 border border-gray-100 dark:border-dark-border shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    Comissão Cobrada
                                </span>
                                <div className="text-5xl font-bold text-brand-green mb-2">0%</div>
                                <p className="text-xs text-gray-500 dark:text-dark-body leading-relaxed">
                                    Taxa por venda cobrada pela Dudit. 100% do valor da mercadoria fica com o lojista.
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                viewport={{ once: true }}
                                className="bg-white dark:bg-dark-surface rounded-xl p-8 border border-gray-100 dark:border-dark-border shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    Média de Mercado
                                </span>
                                <div className="text-5xl font-bold text-red-500 dark:text-red-400 mb-2">18,5%</div>
                                <p className="text-xs text-gray-500 dark:text-dark-body leading-relaxed">
                                    Taxa média de comissão praticada por marketplaces e aplicativos de delivery tradicionais no Brasil.
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                viewport={{ once: true }}
                                className="bg-white dark:bg-dark-surface rounded-xl p-8 border border-gray-100 dark:border-dark-border shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    Economia Média Anual
                                </span>
                                <div className="text-5xl font-bold text-brand-dark dark:text-dark-heading mb-2">R$ 17.400</div>
                                <p className="text-xs text-gray-500 dark:text-dark-body leading-relaxed">
                                    Economia anual média de um pequeno comércio faturando R$ 8.000/mês ao migrar para modelo de taxa zero.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <h2 className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                            Comparativo Factual: Modelos de Comercialização
                        </h2>

                        <div className="overflow-x-auto border border-gray-100 dark:border-dark-border rounded-xl shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-dark-border/30 text-brand-dark dark:text-dark-heading font-bold border-b border-gray-100 dark:border-dark-border">
                                    <tr>
                                        <th className="px-6 py-4">Critério de Análise</th>
                                        <th className="px-6 py-4">Marketplaces Tradicionais</th>
                                        <th className="px-6 py-4 text-brand-green bg-brand-green/5">Plataforma Dudit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-dark-border text-gray-600 dark:text-dark-body">
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark dark:text-dark-heading">Comissão por Venda</td>
                                        <td className="px-6 py-4 text-red-600 dark:text-red-400 font-medium">12% a 27% + taxa fixa</td>
                                        <td className="px-6 py-4 text-brand-green font-bold bg-brand-green/5">0% (R$ 0,00)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark dark:text-dark-heading">Canal de Contato com Cliente</td>
                                        <td className="px-6 py-4">Intermediado pelo app (bloqueado)</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">Direto na Dudit e no WhatsApp</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark dark:text-dark-heading">Gestão de Frente de Caixa (PDV)</td>
                                        <td className="px-6 py-4">Não incluso (exige software extra)</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">PDV Integrado com controle de caixa</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark dark:text-dark-heading">Emissão de Orçamentos e OS</td>
                                        <td className="px-6 py-4">Inexistente</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">Nativo no sistema</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark dark:text-dark-heading">Preço de Assinatura</td>
                                        <td className="px-6 py-4">Percentual ilimitado sobre receita</td>
                                        <td className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading bg-brand-green/5">Grátis ou R$ 29,90/mês fixo</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="bg-gray-50 dark:bg-dark-border/30 rounded-xl p-8 border border-gray-100 dark:border-dark-border">
                            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4">
                                Metodologia de Coleta e Fontes
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-dark-body leading-relaxed mb-4">
                                Os dados comparativos apresentados neste relatório baseiam-se nos termos de serviço e tabelas de comissão públicas vigentes nos principais aplicativos de delivery e marketplaces que operam no território nacional brasileiro em 2026.
                            </p>
                            <p className="text-sm text-gray-600 dark:text-dark-body leading-relaxed">
                                A simulação de economia média considera o volume padrão de transações do Microempreendedor Individual (MEI) e pequenas empresas registradas no Simples Nacional com ticket médio entre R$ 35,00 e R$ 120,00.
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
