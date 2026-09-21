"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Wrench,
    FileText,
    Camera,
    CheckCircle2,
    DollarSign,
    Users,
    Shield,
    ArrowRight,
    Star
} from "lucide-react"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Oficinas e Assistência Técnica",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema completo de ordens de serviço (OS), orçamentos, estoque de peças e controle financeiro para oficinas mecânicas e assistências técnicas.",
}

export default function OficinasETecnicosSegmentPage() {
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
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(softwareSchema) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
                    <GridLines />
                    <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6 }}
                            >
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-6 border border-blue-100">
                                    <Wrench className="w-3.5 h-3.5" />
                                    Especial para Oficinas, Mecânicos e Técnicos
                                </div>

                                <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-6 leading-tight">
                                    Ordens de Serviço e Orçamentos <br />
                                    <span className="text-brand-green">sem papelada ou confusão.</span>
                                </h1>

                                <p className="text-lg text-brand-inactive-text leading-relaxed mb-8 max-w-xl">
                                    Chega de blocos de papel e discussões com clientes. Emita OS digital no celular, envie orçamentos com aprovação pelo WhatsApp e controle suas peças com precisão.
                                </p>

                                <div className="flex flex-wrap gap-4">
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="px-8 py-4 rounded-xl bg-brand-green text-white font-bold hover:bg-brand-green/90 transition-all shadow-lg hover:scale-105 inline-flex items-center gap-2"
                                    >
                                        <span>Começar Gratuitamente</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>

                                    <Link
                                        href="/institucional/planos"
                                        className="px-8 py-4 rounded-xl border border-gray-200 text-brand-dark font-bold hover:bg-gray-50 transition-all inline-flex items-center"
                                    >
                                        Ver Planos
                                    </Link>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="relative"
                            >
                                <div className="bg-brand-slate border border-gray-100 rounded-xl p-6 sm:p-8 shadow-xl relative">
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                                            <div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Ordem de Serviço</span>
                                                <h3 className="font-bold text-brand-dark text-lg">OS #1042</h3>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                                                Aprovada
                                            </span>
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <div className="flex justify-between text-gray-600">
                                                <span>Veículo/Item:</span>
                                                <strong className="text-brand-dark">Honda Civic 2020 - Placa ABC-1234</strong>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                                <span>Cliente:</span>
                                                <strong className="text-brand-dark">Marcos Silva</strong>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                                <span>Serviço:</span>
                                                <span>Troca de Pastilhas + Disco</span>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                                            <span className="text-xs text-gray-500 font-medium">Valor Total:</span>
                                            <span className="text-2xl font-bold text-brand-green">R$ 580,00</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-white relative border-t border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                        <div className="text-center max-w-2xl mx-auto mb-16">
                            <span className="text-xs font-bold uppercase tracking-widest text-brand-green mb-2 block">RECURSOS NATIVOS</span>
                            <h2 className="text-4xl font-bold text-brand-dark tracking-tight">Tudo que sua oficina precisa no dia a dia</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0 }}
                                viewport={{ once: true }}
                                className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Orçamentos com Aprovação Online</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Envie propostas comerciais pelo WhatsApp com fotos e valores. O cliente clica no link e aprova na hora, gerando a OS automaticamente.
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                viewport={{ once: true }}
                                className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-6">
                                    <Wrench className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Ordens de Serviço Completas</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Acompanhe o status do serviço (Aguardando peças, Em andamento, Concluído) e anexe diagnósticos técnicos sem perder o histórico.
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                viewport={{ once: true }}
                                className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Comissão de Mecânicos & Técnicos</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Calcule automaticamente a comissão da equipe por serviço realizado, com relatório detalhado e integração ao fluxo de caixa.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
