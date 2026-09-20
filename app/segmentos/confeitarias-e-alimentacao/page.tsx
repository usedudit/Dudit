"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { Navbar, Footer, GridLines, CTA } from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    ShoppingBag,
    MessageCircle,
    Calendar,
    CheckCircle2,
    DollarSign,
    Sparkles,
    ArrowRight,
    Heart
} from "lucide-react"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Confeitarias e Alimentação",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Cardápio digital na bio do Instagram, pedidos organizados no WhatsApp com 0% de comissão, complementos e controle de entregas para confeitarias e alimentação.",
}

const features = [
    {
        icon: ShoppingBag,
        title: "Cardápio Digital na Bio",
        description: "Seus clientes navegam pelas fotos, escolhem tamanhos, recheios e adicionais e montam o pedido completo sem você precisar digitar tudo.",
        iconBg: "bg-pink-50 text-pink-600"
    },
    {
        icon: DollarSign,
        title: "Zero Porcentagem por Venda",
        description: "Ao contrário dos apps de entrega que ficam com até um terço do seu faturamento, na Dudit você não paga comissão nenhuma sobre seus pedidos.",
        iconBg: "bg-green-50 text-green-600"
    },
    {
        icon: Calendar,
        title: "Controle de Encomendas por Data",
        description: "Agende entregas futuras para festas e aniversários e nunca mais esqueça de separar um pedido na data combinada.",
        iconBg: "bg-blue-50 text-blue-600"
    }
]

const HeroSection = ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
        <GridLines />
        <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
                <motion.div
                    className="lg:col-span-7"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-pink-50 text-pink-700 text-xs font-bold uppercase tracking-wider mb-6 border border-pink-100">
                        <Heart className="w-3.5 h-3.5 text-pink-600" />
                        Especial para Confeitarias, Doces e Marmitas
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-dark tracking-tight mb-6 leading-tight">
                        Receba pedidos prontos no WhatsApp <br />
                        <span className="text-brand-green">com 0% de comissão.</span>
                    </h1>

                    <p className="text-lg text-brand-inactive-text leading-relaxed mb-8 max-w-xl">
                        Pare de pagar taxas de até 27% para aplicativos de delivery. Crie seu cardápio digital limpo, receba pedidos com adicionais e endereço somados direto no seu celular.
                    </p>

                    <div className="flex flex-wrap gap-4">
                        <button
                            onClick={() => onNavigate('start-selling')}
                            className="px-8 py-4 rounded-xl bg-brand-green text-white font-bold hover:bg-brand-green/90 transition-all shadow-lg hover:scale-105 inline-flex items-center gap-2"
                        >
                            <span>Criar Meu Cardápio Grátis</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => onNavigate('pricing')}
                            className="px-8 py-4 rounded-xl border border-gray-200 text-brand-dark font-bold hover:bg-gray-50 transition-all inline-flex items-center"
                        >
                            Ver Planos
                        </button>
                    </div>
                </motion.div>

                <motion.div
                    className="lg:col-span-5"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                >
                    <div className="bg-brand-slate border border-gray-100 rounded-xl p-6 sm:p-8 relative">
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                    <MessageCircle className="w-4 h-4" />
                                </div>
                                <strong className="text-xs text-brand-dark font-bold">Novo Pedido Recebido</strong>
                            </div>

                            <div className="p-3 bg-gray-50 rounded-xl space-y-2 text-xs">
                                <div className="font-bold text-brand-dark">🎂 Bolo de Aniversário 2kg</div>
                                <div className="text-gray-500 pl-3 space-y-0.5">
                                    <div>• Massa: Baunilha</div>
                                    <div>• Recheio: Ninho com Morango</div>
                                    <div>• Topo de Bolo Personalizado (+ R$ 25,00)</div>
                                </div>
                                <div className="pt-2 border-t border-gray-200 flex justify-between font-bold text-brand-dark">
                                    <span>Total do Pedido:</span>
                                    <span className="text-brand-green font-bold">R$ 145,00</span>
                                </div>
                            </div>

                            <div className="bg-emerald-50 text-emerald-800 text-[11px] p-2.5 rounded-lg font-medium text-center">
                                ✓ Taxa da Dudit: <strong>R$ 0,00 (100% do lucro é seu)</strong>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    </section>
)

const FeaturesSection = () => (
    <section className="py-24 bg-white relative border-t border-gray-100">
        <GridLines />
        <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
            <div className="text-center max-w-2xl mx-auto mb-16">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-green mb-2 block">RECURSOS NATIVOS</span>
                <h2 className="text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight">Mais encomendas, sem mensagens perdidas</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {features.map((feature, idx) => {
                    const Icon = feature.icon
                    return (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="group"
                        >
                            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm h-full">
                                <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-6`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark mb-3">{feature.title}</h3>
                                <p className="text-sm text-brand-inactive-text leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    </section>
)

export default function ConfeitariasEAlimentacaoSegmentPage() {
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
                <HeroSection onNavigate={onNavigate} />
                <FeaturesSection />
                <CTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    )
}
