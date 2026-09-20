"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared";
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld";
import {
    BarChart3,
    Calendar,
} from "lucide-react";

const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "\u00CDndice de Taxas e Economia do Pequeno Com\u00E9rcio Local Brasil - Dudit",
    description: "Dados estat\u00EDsticos sobre comiss\u00F5es cobradas por marketplaces e economia gerada pelo modelo de taxa zero.",
    creator: {
        "@type": "Organization",
        name: "Dudit Tecnologia",
        url: "https://dudit.com.br",
    },
    temporalCoverage: "2026/2026",
    spatialCoverage: "Brasil",
    license: "https://creativecommons.org/licenses/by/4.0/",
}

export default function EstatisticasPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === "home") router.push("/institucional/inicio");
        else if (page === "start-selling") router.push("/auth/login?mode=partner");
        else if (page === "explore") router.push("/");
        else if (page === "segments") router.push("/institucional/segmentos");
        else if (page === "pricing") router.push("/institucional/planos");
        else if (page === "about") router.push("/institucional/sobre");
        else router.push("/");
    };

    return (
        <div className="min-h-screen bg-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datasetSchema) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                {/* HERO SECTION */}
                <section className="relative bg-white pt-32 pb-20 overflow-hidden">
                    <GridLines />
                    <div className="container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="text-center"
                        >
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-6 border border-emerald-100">
                                <BarChart3 className="w-3.5 h-3.5" />
                                Dados Fatuais & Metodologia Oficial
                            </div>

                            <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-4 leading-tight">
                                {"Estat\u00EDsticas e Benchmark do "}
                                <br />
                                <span className="text-brand-green">
                                    {"Com\u00E9rcio Local no Brasil"}
                                </span>
                            </h1>

                            <p className="text-base sm:text-lg text-brand-inactive-text max-w-2xl mx-auto leading-relaxed">
                                {"Relat\u00F3rio sobre o impacto das taxas de intermedia\u00E7\u00E3o, econ\u00F4mia m\u00E9dia dos lojistas e efici\u00EAncia operacional de cat\u00E1logos locais."}
                            </p>

                            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-4">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>
                                    {"\u00DAltima atualiza\u00E7\u00E3o: Setembro de 2026 \u2022 Fonte prim\u00E1ria: Dudit Tecnologia Ltda."}
                                </span>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* KEY STATS GRID */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0 }}
                                className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    {"Comiss\u00E3o Cobrada"}
                                </span>
                                <div className="text-5xl font-bold text-brand-green mb-2">0%</div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {"Taxa por venda cobrada pela Dudit. 100% do valor da mercadoria fica com o lojista."}
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.1 }}
                                className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    {"M\u00E9dia de Mercado"}
                                </span>
                                <div className="text-5xl font-bold text-red-500 mb-2">18,5%</div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {"Taxa m\u00E9dia de comiss\u00E3o praticada por marketplaces e aplicativos de delivery tradicionais no Brasil."}
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2 }}
                                className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm text-center"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2 block">
                                    {"Economia M\u00E9dia Anual"}
                                </span>
                                <div className="text-5xl font-bold text-brand-dark mb-2">R$ 17.400</div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {"Economia anual m\u00E9dia de um pequeno com\u00E9rcio faturando R$ 8.000/m\u00EAs ao migrar para modelo de taxa zero."}
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* COMPARISON TABLE */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <h2 className="text-4xl font-bold text-brand-dark mb-6">
                            {"Comparativo Factual: Modelos de Comercializa\u00E7\u00E3o"}
                        </h2>

                        <div className="overflow-x-auto border border-gray-100 rounded-2xl shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-brand-dark font-bold border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">{"Crit\u00E9rio de An\u00E1lise"}</th>
                                        <th className="px-6 py-4">Marketplaces Tradicionais</th>
                                        <th className="px-6 py-4 text-brand-green bg-brand-green/5">Plataforma Dudit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-600">
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark">{"Comiss\u00E3o por Venda"}</td>
                                        <td className="px-6 py-4 text-red-600 font-medium">12% a 27% + taxa fixa</td>
                                        <td className="px-6 py-4 text-brand-green font-bold bg-brand-green/5">0% (R$ 0,00)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark">Canal de Contato com Cliente</td>
                                        <td className="px-6 py-4">Intermediado pelo app (bloqueado)</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">Direto no WhatsApp</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark">{"Gest\u00E3o de Frente de Caixa (PDV)"}</td>
                                        <td className="px-6 py-4">{"N\u00E3o incluso (exige software extra)"}</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">PDV Integrado com controle de caixa</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark">{"Emiss\u00E3o de Or\u00E7amentos e OS"}</td>
                                        <td className="px-6 py-4">Inexistente</td>
                                        <td className="px-6 py-4 font-medium bg-brand-green/5">Nativo no sistema</td>
                                    </tr>
                                    <tr>
                                        <td className="px-6 py-4 font-semibold text-brand-dark">{"Pre\u00E7o de Assinatura"}</td>
                                        <td className="px-6 py-4">Percentual ilimitado sobre receita</td>
                                        <td className="px-6 py-4 font-bold text-brand-dark bg-brand-green/5">{"Gr\u00E1tis ou R$ 19,90/m\u00EAs fixo"}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* METHODOLOGY SECTION */}
                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-gray-50 rounded-xl p-8 border border-gray-100"
                        >
                            <h3 className="text-xl font-bold text-brand-dark mb-4">
                                Metodologia de Coleta e Fontes
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                {"Os dados comparativos apresentados neste relat\u00F3rio baseiam-se nos termos de servi\u00E7o e tabelas de comiss\u00E3o p\u00FAblicas vigentes nos principais aplicativos de delivery e marketplaces que operam no territ\u00F3rio nacional brasileiro em 2026."}
                            </p>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {"A simula\u00E7\u00E3o de economia m\u00E9dia considera o volume padr\u00E3o de transa\u00E7\u00F5es do Microempreendedor Individual (MEI) e pequenas empresas registradas no Simples Nacional com ticket m\u00E9dio entre R$ 35,00 e R$ 120,00."}
                            </p>
                        </motion.div>
                    </div>
                </section>
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
