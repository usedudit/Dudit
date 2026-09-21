"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    Scissors,
    Calendar,
    ShoppingBag,
    Users,
    Clock,
    Sparkles,
    ArrowRight,
    CheckCircle2
} from "lucide-react"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Salões e Barbearias",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema completo de agendamento online 24h, comissões de profissionais, PDV e controle de estoque de produtos para salões e barbearias.",
}

export default function SaloesEBarbeariasSegmentPage() {
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
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs font-bold uppercase tracking-wider mb-6 border border-purple-100">
                                    <Scissors className="w-3.5 h-3.5" />
                                    Especial para Barbearias, Salões e Estética
                                </div>

                                <h1 className="text-5xl font-bold text-brand-dark tracking-tight mb-6 leading-tight">
                                    Seus clientes agendam 24h <br />
                                    <span className="text-brand-green">sem você parar para atender.</span>
                                </h1>

                                <p className="text-lg text-brand-inactive-text leading-relaxed mb-8 max-w-xl">
                                    Coloque o link da sua agenda no Instagram e WhatsApp. Os clientes escolhem o profissional e o horário disponível sozinhos, sem confusão de horários ou ligações.
                                </p>

                                <div className="flex flex-wrap gap-4">
                                    <Link
                                        href="/auth/login?mode=partner"
                                        className="px-8 py-4 rounded-xl bg-brand-green text-white font-bold hover:bg-brand-green/90 transition-all shadow-lg hover:scale-105 inline-flex items-center gap-2"
                                    >
                                        <span>Criar Minha Agenda Grátis</span>
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
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-brand-green" />
                                                <span className="font-bold text-brand-dark text-sm">Agenda de Hoje</span>
                                            </div>
                                            <span className="text-xs text-gray-400 font-medium">14:00 - 18:00</span>
                                        </div>

                                        <div className="space-y-2.5">
                                            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs">
                                                <div>
                                                    <strong className="text-blue-900 block font-bold">14:00 - Corte + Barba</strong>
                                                    <span className="text-blue-600">Cliente: Rodrigo Alves</span>
                                                </div>
                                                <span className="font-bold text-blue-900">R$ 75,00</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs opacity-75">
                                                <div>
                                                    <strong className="text-gray-800 block font-bold">15:30 - Barboterapia</strong>
                                                    <span className="text-gray-500">Cliente: Felipe Santos</span>
                                                </div>
                                                <span className="font-bold text-gray-800">R$ 50,00</span>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Venda de Pomada no Caixa:</span>
                                            <strong className="text-brand-green font-bold">+ R$ 45,00</strong>
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
                            <h2 className="text-4xl font-bold text-brand-dark tracking-tight">Mais agendamentos, zero dor de cabeça</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0 }}
                                viewport={{ once: true }}
                                className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6">
                                    <Calendar className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Agenda Online no Instagram</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Seu link exclusivo permite que o cliente veja seus horários livres e marque o serviço em segundos, 24 horas por dia.
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
                                    <ShoppingBag className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Venda de Produtos & PDV</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Venda pomadas, shampoos, cosméticos e tratamentos no mesmo atendimento do serviço com baixa automática no estoque.
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                viewport={{ once: true }}
                                className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                                    <Users className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">Comissão de Barbeiros & Manicures</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    Configure comissões diferentes por profissional ou por serviço. O fechamento financeiro do mês fica pronto com 1 clique.
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
