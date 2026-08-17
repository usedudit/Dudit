"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Store,
    ShoppingBag,
    Wrench,
    UtensilsCrossed,
    Car,
    Home,
    Briefcase,
    Tag,
    Search,
    ArrowRight,
    CheckCircle2,
    Calendar,
    Clock,
    MapPin,
    ChevronRight,
    Sparkles,
    Check
} from 'lucide-react';
import { Button } from '@/components/reusable/Button';
import { Navbar, Footer } from '@/components/InstitucionalShared';

export default function SegmentosPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio');
        else if (page === 'start-selling') router.push('/auth/login?mode=partner');
        else if (page === 'explore') router.push('/');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'about') router.push('/institucional/sobre');
        else router.push('/');
    };

    return (
        <div className="min-h-screen bg-white text-brand-dark flex flex-col selection:bg-brand-green/20 selection:text-brand-dark font-sans">
            <Navbar onNavigate={onNavigate} />

            <main className="flex-1 w-full pt-[68px]">
                {/* HERO SECTION */}
                <SegmentosHero onNavigate={onNavigate} />

                {/* BENTO GRID DE CATEGORIAS */}
                <CategoriesBentoSection onNavigate={onNavigate} />

                {/* CONEXÃO DIRETA */}
                <DirectConnectionSection onNavigate={onNavigate} />

                {/* CTA FINAL */}
                <SegmentosFinalCTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}

/* =========================================================================
   1. HERO SECTION
   ========================================================================= */
function SegmentosHero({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="relative bg-white pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden border-b border-gray-100">
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-60 pointer-events-none" />

            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-12 gap-12 items-center">
                    <motion.div
                        className="lg:col-span-7 flex flex-col items-start"
                        initial={{ opacity: 0, y: 25 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-green/10 border border-brand-green/20 text-brand-dark text-xs font-semibold mb-6">
                            <span className="w-2 h-2 rounded-full bg-brand-green" />
                            <span>Variedade & Proximidade</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-brand-dark tracking-tight leading-[1.08] mb-6">
                            Produtos, serviços e negócios de todos os tipos.
                        </h1>

                        <p className="text-gray-600 text-lg sm:text-xl mb-8 max-w-xl leading-relaxed">
                            Na Dudit você encontra desde produtos até profissionais e empresas da sua região para resolver o seu dia a dia.
                        </p>

                        <div className="flex flex-wrap items-center gap-4">
                            <Button
                                className="h-12 px-7 text-base font-bold bg-brand-green hover:bg-[#007b4f] text-white shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                onClick={() => onNavigate('explore')}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Explorar categorias
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 px-7 text-base font-semibold border-gray-200 text-brand-dark hover:bg-gray-50 transition-all"
                                onClick={() => onNavigate('start-selling')}
                            >
                                Divulgar meu negócio
                                <ArrowRight className="w-4 h-4 ml-2 text-brand-green" />
                            </Button>
                        </div>
                    </motion.div>

                    <motion.div
                        className="lg:col-span-5 flex justify-center"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.7, delay: 0.15 }}
                    >
                        <div className="relative w-full max-w-[420px]">
                            <div className="absolute inset-0 bg-brand-green/10 rounded-3xl blur-2xl -z-10" />
                            <div className="bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 shadow-xl text-center">
                                <img
                                    src="https://img.dudit.com.br/static/mascots/Segmentos.png"
                                    alt="Dino Dudit com vários segmentos e profissões"
                                    className="w-52 h-52 mx-auto object-contain drop-shadow-sm select-none mb-3"
                                />
                                <div className="text-sm font-bold text-brand-dark">Tudo em um só lugar</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    De artesanato a serviços automotivos, pertinho de você.
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   2. SEÇÃO: BENTO GRID DE CATEGORIAS E SITUAÇÕES
   ========================================================================= */
function CategoriesBentoSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-xs font-bold text-brand-green uppercase tracking-widest block mb-3">
                        Encontre o que precisa
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-4">
                        Para todos os tipos de necessidades
                    </h2>
                    <p className="text-gray-600 text-base sm:text-lg">
                        Descubra opções perto de você ou coloque seu negócio no mapa para ser encontrado.
                    </p>
                </div>

                {/* Bento Grid */}
                <div className="grid md:grid-cols-12 gap-6">
                    {/* 1. Lojas e Comércio (Col 7) */}
                    <div className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
                                <Store className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block mb-1">
                                Comércio Local
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-2">Lojas e comércio</h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Produtos novos e usados, lojas de bairro, promoções e oportunidades para comprar direto de quem vende.
                            </p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {['👗 Moda & Roupas', '📱 Eletrônicos', '🛋️ Móveis & Decoração', '👜 Acessórios', '🧸 Infantil'].map((tag, idx) => (
                                    <span key={idx} className="text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-blue-50/40 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                            <div className="text-xs text-gray-700">
                                <span className="font-bold text-brand-dark">Milhares de itens</span> disponíveis na sua região
                            </div>
                            <span className="text-xs font-bold text-blue-600 flex items-center gap-1 cursor-pointer" onClick={() => onNavigate('explore')}>
                                Explorar <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                        </div>
                    </div>

                    {/* 2. Serviços & Agendamentos (Col 5) */}
                    <div className="md:col-span-5 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
                                <Calendar className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block mb-1">
                                Agende Direto
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-2">Serviços e profissionais</h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Encontre profissionais qualificados e agende horários sem complicação e sem espera.
                            </p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {['💇 Barbearias & Salões', '💅 Estética', '💻 Assistência Técnica', '🧹 Diaristas'].map((tag, idx) => (
                                    <span key={idx} className="text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-purple-50/40 rounded-2xl p-4 border border-purple-100 flex items-center justify-between">
                            <div className="text-xs text-gray-700">
                                <span className="font-bold text-brand-dark">Horários livres</span> hoje e amanhã
                            </div>
                            <span className="text-xs font-bold text-purple-600 flex items-center gap-1 cursor-pointer" onClick={() => onNavigate('explore')}>
                                Agendar <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                        </div>
                    </div>

                    {/* 3. Alimentação & Delícias (Col 4) */}
                    <div className="md:col-span-4 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-5">
                                <UtensilsCrossed className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider block mb-1">
                                Comida Local
                            </span>
                            <h3 className="text-xl font-bold text-brand-dark mb-2">Alimentação & delivery</h3>
                            <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-4">
                                Bolos artesanais, marmitas, lanches e pratos feitos com carinho por quem cozinha na sua cidade.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {['🍰 Bolos de Pote', '🍱 Marmitas Fit', '🍔 Lanches', '🥖 Pães Caseiros'].map((tag, idx) => (
                                    <span key={idx} className="text-[11px] font-medium bg-gray-50 border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 4. Automotivo & Cuidados (Col 4) */}
                    <div className="md:col-span-4 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-5">
                                <Car className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-1">
                                Seu Veículo
                            </span>
                            <h3 className="text-xl font-bold text-brand-dark mb-2">Automotivo</h3>
                            <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-4">
                                Oficinas mecânicas, troca de óleo, lavagem e estética automotiva, autoelétrica e peças de reposição.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {['🔧 Mecânica', '🛢️ Troca de Óleo', '🚗 Estética Auto', '⚡ Autoelétrica'].map((tag, idx) => (
                                    <span key={idx} className="text-[11px] font-medium bg-gray-50 border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 5. Casa e Reformas (Col 4) */}
                    <div className="md:col-span-4 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-5">
                                <Home className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block mb-1">
                                Seu Lar
                            </span>
                            <h3 className="text-xl font-bold text-brand-dark mb-2">Casa e reformas</h3>
                            <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-4">
                                Eletricistas, encanadores, marceneiros, pedreiros, pintura e reparos rápidos para o seu lar.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {['⚡ Eletricista', '🚰 Encanador', '🪵 Marcenaria', '🎨 Pintura'].map((tag, idx) => (
                                    <span key={idx} className="text-[11px] font-medium bg-gray-50 border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 6. Negócios Locais & Profissionais (Col 6) */}
                    <div className="md:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-5">
                                <Briefcase className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-teal-700 uppercase tracking-wider block mb-1">
                                Autônomos & Empresas
                            </span>
                            <h3 className="text-xl font-bold text-brand-dark mb-2">Negócios locais</h3>
                            <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                Empresas e profissionais da sua região mostrando o que fazem com catálogo, horários e contato direto pelo WhatsApp.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-teal-700 bg-teal-50/60 p-3 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-teal-700" />
                            Perfis verificados e prontos para atender
                        </div>
                    </div>

                    {/* 7. Anunciar Qualquer Coisa / Desapego (Col 6) */}
                    <div className="md:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs hover:border-brand-green/40 hover:shadow-md transition-all flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-5">
                                <Tag className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider block mb-1">
                                Para Todo Mundo
                            </span>
                            <h3 className="text-xl font-bold text-brand-dark mb-2">Anunciar qualquer coisa</h3>
                            <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                Tem algo parado em casa para desapegar ou um produto novo que você produz? Anuncie na Dudit sem pagar taxas.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50/60 p-3 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-rose-600" />
                            Anúncio gratuito e direto no WhatsApp
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   3. SEÇÃO: CONEXÃO DIRETA E SEM COMPLICAÇÃO
   ========================================================================= */
function DirectConnectionSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-white relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-brand-green/5 rounded-3xl p-8 sm:p-12 border border-brand-green/20 flex flex-col lg:flex-row items-center justify-between gap-8">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <img
                            src="https://img.dudit.com.br/static/mascots/SacolaVazia.png"
                            alt="Dino Dudit com sacola de compras"
                            className="w-28 h-28 object-contain shrink-0 drop-shadow-sm select-none"
                        />
                        <div>
                            <h3 className="text-2xl font-bold text-brand-dark mb-2">
                                Tudo o que você precisa resolver hoje.
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base max-w-xl">
                                A Dudit reúne quem compra, quem vende, quem presta serviços e quem quer organizar seu trabalho em uma só plataforma.
                            </p>
                        </div>
                    </div>

                    <Button
                        className="h-12 px-7 bg-brand-green text-white hover:bg-[#007b4f] font-bold text-sm shrink-0"
                        onClick={() => onNavigate('start-selling')}
                    >
                        Criar minha conta grátis
                    </Button>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   4. CTA FINAL
   ========================================================================= */
function SegmentosFinalCTA({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-white relative">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-brand-dark rounded-3xl p-8 sm:p-14 lg:p-16 text-center relative overflow-hidden shadow-2xl">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-green/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                            alt="Dino Dudit alegre"
                            className="w-28 h-28 sm:w-32 sm:h-32 object-contain mb-6 drop-shadow-md select-none"
                        />

                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                            O que você precisa hoje pode estar na Dudit.
                        </h2>
                        <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
                            Descubra opções da sua cidade ou comece a divulgar o que você faz agora mesmo.
                        </p>

                        <div className="flex flex-wrap justify-center gap-4 w-full sm:w-auto">
                            <Button
                                className="h-12 px-8 text-base font-bold bg-brand-green hover:bg-[#007b4f] text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                                onClick={() => onNavigate('explore')}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Explorar Dudit
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 px-8 text-base font-semibold border-white/20 text-white hover:bg-white/10 transition-all"
                                onClick={() => onNavigate('start-selling')}
                            >
                                Criar conta grátis
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
