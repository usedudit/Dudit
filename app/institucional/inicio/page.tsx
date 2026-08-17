"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Search,
    Store,
    ShoppingBag,
    Calendar,
    Wrench,
    ArrowRight,
    MapPin,
    CheckCircle2,
    MessageCircle,
    Star,
    Sparkles,
    Package,
    Users,
    DollarSign,
    Clock,
    Tag,
    ChevronRight,
    Compass,
    Check
} from 'lucide-react';
import { Button } from '@/components/reusable/Button';
import { Navbar, Footer } from '@/components/InstitucionalShared';

export default function InicioPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (page === 'start-selling') {
            router.push('/auth/login?mode=partner');
        } else if (page === 'explore') {
            router.push('/');
        } else if (page === 'segments') {
            router.push('/institucional/segmentos');
        } else if (page === 'pricing') {
            router.push('/institucional/planos');
        } else if (page === 'terms') {
            router.push('/institucional/termos');
        } else if (page === 'privacidade') {
            router.push('/institucional/privacidade');
        } else if (page === 'about') {
            router.push('/institucional/sobre');
        } else {
            router.push('/');
        }
    };

    return (
        <div className="min-h-screen bg-white text-brand-dark flex flex-col selection:bg-brand-green/20 selection:text-brand-dark font-sans">
            <Navbar onNavigate={onNavigate} />

            <main className="flex-1 w-full pt-[68px]">
                {/* HERO SECTION */}
                <HeroSection onNavigate={onNavigate} />

                {/* BENTO GRID: O QUE DÁ PRA FAZER NA DUDIT */}
                <BentoHelpSection onNavigate={onNavigate} />

                {/* PARA QUEM PROCURA / COMPRA */}
                <DiscoveryForBuyersSection onNavigate={onNavigate} />

                {/* PARA QUEM VENDE / NEGÓCIOS */}
                <VisibilityForSellersSection onNavigate={onNavigate} />

                {/* SE QUISER ORGANIZAR */}
                <OrganizationSection onNavigate={onNavigate} />

                {/* SEÇÃO DE DESCOBERTA / CIDADE VIVA */}
                <LiveDiscoverySection onNavigate={onNavigate} />

                {/* CTA FINAL */}
                <FinalCTASection onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}

/* =========================================================================
   1. HERO SECTION
   ========================================================================= */
function HeroSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="relative bg-white pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden border-b border-gray-100">
            {/* Background subtle grid decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-60 pointer-events-none" />

            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
                    {/* Left Column: Copy & CTAs */}
                    <motion.div
                        className="lg:col-span-7 flex flex-col items-start"
                        initial={{ opacity: 0, y: 25 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        {/* Pill badge */}
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-green/10 border border-brand-green/20 text-brand-dark text-xs font-semibold mb-6">
                            <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                            <span>Descubra e anuncie perto de você</span>
                        </div>

                        {/* Main H1 */}
                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[64px] font-extrabold text-brand-dark tracking-tight leading-[1.08] mb-6">
                            O que você precisa hoje pode estar na{" "}
                            <span className="text-brand-green">Dudit.</span>
                        </h1>

                        {/* Subtitle */}
                        <p className="text-gray-600 text-lg sm:text-xl mb-8 max-w-xl leading-relaxed">
                            Descubra produtos, serviços e negócios perto de você. Compre, anuncie ou agende de um jeito simples.
                        </p>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                            <Button
                                className="h-12 px-7 text-base font-bold bg-brand-green hover:bg-[#007b4f] text-white shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                onClick={() => onNavigate('explore')}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Explorar Dudit
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 px-7 text-base font-semibold border-gray-200 text-brand-dark hover:bg-gray-50 hover:border-gray-300 transition-all"
                                onClick={() => onNavigate('start-selling')}
                            >
                                Começar grátis
                                <ArrowRight className="w-4 h-4 ml-2 text-brand-green" />
                            </Button>
                        </div>

                        {/* Trust items under CTAs */}
                        <div className="flex flex-wrap items-center gap-6 mt-10 text-xs font-medium text-gray-500">
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-brand-green" />
                                <span>Sem taxas escondidas</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-brand-green" />
                                <span>Contato direto pelo WhatsApp</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-brand-green" />
                                <span>Lojas e serviços locais</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Visual Hero with Dino & Floating Discovery Cards */}
                    <motion.div
                        className="lg:col-span-5 relative"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.7, delay: 0.15 }}
                    >
                        <div className="relative mx-auto max-w-[420px] lg:max-w-none">
                            {/* Decorative background circle */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] sm:w-[420px] sm:h-[420px] bg-brand-green/10 rounded-full blur-3xl -z-10" />

                            {/* Main Card Container */}
                            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xl shadow-gray-100/80 p-6 relative overflow-hidden">
                                {/* Top search simulator */}
                                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl p-3 mb-6">
                                    <Search className="w-5 h-5 text-gray-400 shrink-0" />
                                    <div className="text-sm text-gray-400 flex-1 truncate font-normal">
                                        Buscar bolo, barbeiro, conserto...
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-green/10 text-brand-green px-2 py-1 rounded-md">
                                        Perto de mim
                                    </span>
                                </div>

                                {/* Center Dino Illustration */}
                                <div className="relative py-2 flex justify-center items-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                        alt="Dino Dudit descobrindo opções locais"
                                        className="w-48 h-48 sm:w-56 sm:h-56 object-contain drop-shadow-sm select-none"
                                    />
                                </div>

                                {/* Floating Card 1: Produto Local */}
                                <motion.div
                                    className="bg-white/95 backdrop-blur-sm border border-gray-100 rounded-2xl p-3 shadow-lg shadow-gray-200/50 mb-3 flex items-center justify-between gap-3"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-lg">
                                            🍰
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-brand-dark">Bolo Caseiro da Ana</div>
                                            <div className="text-[11px] text-gray-500 flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-brand-green" /> 600m de você
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-brand-green bg-brand-green/10 px-2 py-1 rounded-lg">
                                        R$ 22,00
                                    </span>
                                </motion.div>

                                {/* Floating Card 2: Serviço / Agendamento */}
                                <motion.div
                                    className="bg-white/95 backdrop-blur-sm border border-gray-100 rounded-2xl p-3 shadow-lg shadow-gray-200/50 flex items-center justify-between gap-3"
                                    animate={{ y: [0, 4, 0] }}
                                    transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.5 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-lg">
                                            ✂️
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-brand-dark">Barbearia Central</div>
                                            <div className="text-[11px] text-gray-500 flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-blue-500" /> Horário hoje às 16:30
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                                        Agendar
                                    </span>
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   2. SEÇÃO: COMO A DUDIT AJUDA (BENTO GRID MODERNO)
   ========================================================================= */
function BentoHelpSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    const [selectedCategory, setSelectedCategory] = useState('doces');

    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-xs font-bold text-brand-green uppercase tracking-widest block mb-3">
                        Tudo em um só lugar
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-4">
                        O que você pode fazer na Dudit
                    </h2>
                    <p className="text-gray-600 text-base sm:text-lg">
                        Resolver o que você precisa no dia a dia não precisa ser complicado. Escolha a situação que combina com você hoje.
                    </p>
                </div>

                {/* Bento Grid */}
                <div className="grid md:grid-cols-12 gap-6">
                    {/* CARD 1: Precisa de alguma coisa? (Col 7) */}
                    <motion.div
                        className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:border-brand-green/40 transition-all"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-5">
                                <Search className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-1">
                                Encontre rápido
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-3">
                                Precisa de alguma coisa?
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Encontrar lojas, produtos, serviços e oportunidades pertinho de você, com preços reais e contato direto.
                            </p>
                        </div>

                        {/* Interactive search & category mockup */}
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 sm:p-5 mt-2">
                            <div className="flex flex-wrap gap-2 mb-4">
                                {[
                                    { id: 'doces', label: '🍰 Doces & Bolos' },
                                    { id: 'oficina', label: '🔧 Mecânica & Reparos' },
                                    { id: 'beleza', label: '💇 Barbearia & Salão' },
                                    { id: 'roupas', label: '👗 Moda & Roupas' }
                                ].map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                                            selectedCategory === cat.id
                                                ? 'bg-brand-dark text-white shadow-sm'
                                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>

                            {/* Result preview */}
                            <div className="bg-white rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-brand-green/10 flex items-center justify-center text-brand-green font-bold text-xs">
                                        📍
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-brand-dark">
                                            {selectedCategory === 'doces' && 'Confeitaria Sabor Real'}
                                            {selectedCategory === 'oficina' && 'Auto Mecânica Express'}
                                            {selectedCategory === 'beleza' && 'Studio Bella Vita'}
                                            {selectedCategory === 'roupas' && 'Boutique Urbana'}
                                        </div>
                                        <div className="text-[11px] text-gray-500">
                                            {selectedCategory === 'doces' && 'Pronta entrega • 750m'}
                                            {selectedCategory === 'oficina' && 'Orçamento no WhatsApp • 1.2 km'}
                                            {selectedCategory === 'beleza' && 'Agendamento online • 900m'}
                                            {selectedCategory === 'roupas' && 'Novidades da estação • 500m'}
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-brand-green flex items-center gap-1">
                                    Ver opções <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* CARD 2: Tem algo para vender? (Col 5) */}
                    <motion.div
                        className="md:col-span-5 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:border-brand-green/40 transition-all"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                    >
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-5">
                                <Tag className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider block mb-1">
                                Desapego ou Venda
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-3">
                                Tem algo para vender?
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Anuncie produtos, itens usados ou qualquer coisa de forma rápida e sem burocracia.
                            </p>
                        </div>

                        {/* Publish announcement card mockup */}
                        <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                                    Anúncio Ativo na sua Cidade
                                </div>
                                <span className="text-[10px] font-semibold bg-white text-gray-500 px-2 py-0.5 rounded border border-gray-200">
                                    Há 15 min
                                </span>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-gray-100 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-bold text-brand-dark">Violão Acústico Seminovo</div>
                                    <div className="text-xs font-extrabold text-orange-600 mt-0.5">R$ 280,00</div>
                                </div>
                                <div className="bg-brand-green text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" /> Falar
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* CARD 3: Tem um negócio? (Col 5) */}
                    <motion.div
                        className="md:col-span-5 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:border-brand-green/40 transition-all"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.15 }}
                    >
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
                                <Store className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block mb-1">
                                Para Pequenos Negócios
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-3">
                                Tem um negócio?
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Mostre o que você vende e facilite para clientes encontrarem sua loja ou serviço.
                            </p>
                        </div>

                        {/* Store mockup */}
                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 mb-2">
                                <div className="w-8 h-8 rounded-full bg-brand-green/10 text-brand-green font-bold text-xs flex items-center justify-center">
                                    🏪
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs font-bold text-brand-dark">Sua Loja na Dudit</div>
                                    <div className="text-[10px] text-gray-500 font-mono">dudit.com.br/sualoja</div>
                                </div>
                                <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded">
                                    Aberta
                                </span>
                            </div>
                            <div className="text-[11px] text-gray-600 text-center font-medium">
                                Link pronto para colocar na bio do Instagram
                            </div>
                        </div>
                    </motion.div>

                    {/* CARD 4: Precisa marcar um horário? (Col 7) */}
                    <motion.div
                        className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:border-brand-green/40 transition-all"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <div>
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
                                <Calendar className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block mb-1">
                                Agendamentos Simples
                            </span>
                            <h3 className="text-2xl font-bold text-brand-dark mb-3">
                                Precisa marcar um horário?
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                                Encontre profissionais autônomos, consultorias e serviços locais com agendamento direto.
                            </p>
                        </div>

                        {/* Calendar appointment selector mockup */}
                        <div className="bg-purple-50/40 border border-purple-100 rounded-2xl p-4 sm:p-5">
                            <div className="text-xs font-bold text-brand-dark mb-3 flex items-center justify-between">
                                <span>Horários livres hoje</span>
                                <span className="text-[11px] text-purple-600 font-semibold">Sem espera</span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {['10:00', '14:30', '16:00', '18:15'].map((time, idx) => (
                                    <div
                                        key={time}
                                        className={`p-2.5 rounded-xl text-center text-xs font-bold border transition-all ${
                                            idx === 1
                                                ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                                : 'bg-white text-gray-700 border-gray-200'
                                        }`}
                                    >
                                        {time}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   3. SEÇÃO PARA QUEM COMPRA / RESOLVE (O QUE VOCÊ PROCURA?)
   ========================================================================= */
function DiscoveryForBuyersSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    const categories = [
        { icon: Store, name: "Lojas e Mercados", desc: "Comércio local e produtos artesanais" },
        { icon: ShoppingBag, name: "Comida & Doces", desc: "Bolos, marmitas, lanches e delícias caseiras" },
        { icon: Wrench, name: "Serviços & Manutenção", desc: "Eletricistas, encanadores, mecânicos e reformas" },
        { icon: Calendar, name: "Beleza & Bem-estar", desc: "Barbearias, salões, estética e massagens" },
        { icon: Package, name: "Produtos Novos & Usados", desc: "Desapegos, eletrônicos e itens para o lar" },
        { icon: Users, name: "Profissionais Autônomos", desc: "Aulas, consultorias e freelancers da sua área" },
    ];

    return (
        <section className="py-20 md:py-28 bg-white relative border-b border-gray-100 overflow-hidden">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-12 gap-12 items-center">
                    {/* Left: Text & Categories Grid */}
                    <div className="lg:col-span-7">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold uppercase tracking-wider mb-4">
                            O que você procura?
                        </div>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-6">
                            Encontre produtos e serviços perto de você
                        </h2>
                        <p className="text-gray-600 text-lg leading-relaxed mb-10 max-w-xl">
                            Comprar algo novo ou usado, encontrar um serviço confiável, descobrir negócios próximos ou resolver uma necessidade do dia a dia.
                        </p>

                        {/* Category items list */}
                        <div className="grid sm:grid-cols-2 gap-4 mb-10">
                            {categories.map((cat, idx) => (
                                <div
                                    key={idx}
                                    className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-white hover:border-brand-green/30 hover:shadow-sm transition-all flex items-start gap-3"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200/60 flex items-center justify-center shrink-0 text-brand-dark shadow-xs">
                                        <cat.icon className="w-5 h-5 text-brand-green" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-brand-dark">{cat.name}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{cat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Core association message box */}
                        <div className="p-5 rounded-2xl bg-brand-green/10 border border-brand-green/20 flex items-center gap-4">
                            <span className="text-2xl">💡</span>
                            <div>
                                <div className="text-sm font-bold text-brand-dark">
                                    Quando precisar de alguma coisa, dê uma olhada na Dudit.
                                </div>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    É rápido, não precisa baixar nada pesado e você fala direto com quem vende.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Dino Mascot & Neighborhood Card */}
                    <div className="lg:col-span-5 flex flex-col items-center">
                        <div className="relative w-full max-w-[380px]">
                            {/* Card Background Glow */}
                            <div className="absolute inset-0 bg-brand-green/10 rounded-3xl blur-2xl -z-10" />

                            <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-xl text-center relative">
                                <div className="w-40 h-40 mx-auto mb-4 flex items-center justify-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/SacolaVazia.png"
                                        alt="Dino Dudit com compras locais"
                                        className="w-36 h-36 object-contain drop-shadow-sm select-none"
                                    />
                                </div>

                                <h3 className="text-xl font-bold text-brand-dark mb-2">
                                    Compre direto de quem faz
                                </h3>
                                <p className="text-gray-500 text-xs leading-relaxed mb-6">
                                    Descubra comerciantes e profissionais da sua cidade, incentive quem trabalha por perto e receba rápido.
                                </p>

                                <Button
                                    className="w-full h-11 bg-brand-green hover:bg-[#007b4f] text-white font-bold text-sm"
                                    onClick={() => onNavigate('explore')}
                                >
                                    Ver o que tem por perto
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   4. SEÇÃO PARA QUEM VENDE (SEU NEGÓCIO NA DUDIT)
   ========================================================================= */
function VisibilityForSellersSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100 overflow-hidden">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-12 gap-12 items-center">
                    {/* Left: Dino Partner Mascot & Vitrine Card */}
                    <div className="lg:col-span-5 order-2 lg:order-1 flex justify-center">
                        <div className="relative w-full max-w-[400px]">
                            <div className="bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-xl">
                                <div className="flex items-center justify-center mb-6">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                        alt="Dino Dudit ajudando negócios a vender"
                                        className="w-40 h-40 object-contain drop-shadow-sm select-none"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                                        <span className="text-gray-500 font-medium">Sua vitrine online</span>
                                        <span className="font-bold text-brand-dark">Pronta em 2 min</span>
                                    </div>
                                    <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                                        <span className="text-gray-500 font-medium">Comissão por venda</span>
                                        <span className="font-bold text-brand-green">0% (Livre de taxas)</span>
                                    </div>
                                    <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                                        <span className="text-gray-500 font-medium">WhatsApp & Instagram</span>
                                        <span className="font-bold text-brand-dark">Conectados</span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full h-11 mt-6 bg-brand-dark hover:bg-black text-white font-bold text-sm"
                                    onClick={() => onNavigate('start-selling')}
                                >
                                    Criar minha vitrine agora
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Copy & Key Message */}
                    <div className="lg:col-span-7 order-1 lg:order-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold uppercase tracking-wider mb-4">
                            Mais uma porta aberta
                        </div>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-6">
                            Divulgue seu negócio na Dudit
                        </h2>
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">
                            Seu negócio também pode ser encontrado na Dudit.
                        </h3>
                        <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-8">
                            Você já usa Instagram e WhatsApp? Continue usando. A Dudit é mais uma vitrine para seus produtos e serviços chegarem até mais pessoas da sua região.
                        </p>

                        {/* Realistic benefits list */}
                        <div className="space-y-4 mb-8">
                            <div className="flex items-start gap-3.5">
                                <div className="w-6 h-6 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <Check className="w-3.5 h-3.5 text-brand-green stroke-[3]" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-brand-dark">Mais uma vitrine para ser encontrado</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Pessoas que estão na sua cidade procurando exatamente o que você faz podem achar você pela busca.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3.5">
                                <div className="w-6 h-6 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <Check className="w-3.5 h-3.5 text-brand-green stroke-[3]" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-brand-dark">Catálogo limpo para compartilhar</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Envie um link bonito e direto para clientes no WhatsApp ou coloque na bio do seu perfil.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3.5">
                                <div className="w-6 h-6 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <Check className="w-3.5 h-3.5 text-brand-green stroke-[3]" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-brand-dark">Sem promessas vazias, apenas utilidade</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Não cobramos porcentagem sobre as suas vendas e você negocia do jeito que preferir.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Highlight message */}
                        <div className="p-4 rounded-xl bg-white border border-gray-200 text-xs text-gray-600 font-medium">
                            💬 <span className="font-bold text-brand-dark">"A Dudit é mais uma porta para clientes encontrarem você."</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   5. SEÇÃO SOBRE ORGANIZAÇÃO (COMPLEMENTAR E LEVE)
   ========================================================================= */
function OrganizationSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    const tools = [
        {
            title: "Estoque",
            desc: "Controle o que entra e sai sem precisar de planilhas confusas.",
            icon: Package,
            tag: "Prático"
        },
        {
            title: "Clientes & Contatos",
            desc: "Guarde o histórico de pedidos e facilite o retorno de quem já comprou.",
            icon: Users,
            tag: "Histórico"
        },
        {
            title: "Agendamentos & O.S.",
            desc: "Marque horários e gere ordens de serviço digitais sem papelada.",
            icon: Calendar,
            tag: "Sem papel"
        },
        {
            title: "Controle Financeiro",
            desc: "Acompanhe entradas e saídas. 100% do lucro é seu, sem comissões.",
            icon: DollarSign,
            tag: "Transparente"
        }
    ];

    return (
        <section className="py-20 md:py-28 bg-white relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <span className="text-xs font-bold text-brand-green uppercase tracking-widest block mb-3">
                        Do seu jeito
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-4">
                        Organize seu negócio de forma simples
                    </h2>
                    <p className="text-gray-600 text-base sm:text-lg">
                        Se quiser organizar seu negócio, a Dudit também ajuda. Comece pela vitrine e organize no seu próprio ritmo.
                    </p>
                </div>

                {/* Grid of organization features */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    {tools.map((item, idx) => (
                        <div
                            key={idx}
                            className="bg-gray-50/70 border border-gray-100 rounded-3xl p-6 hover:bg-white hover:border-brand-green/30 hover:shadow-md transition-all group flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200/80 flex items-center justify-center text-brand-green group-hover:bg-brand-green group-hover:text-white transition-colors shadow-xs">
                                        <item.icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white text-gray-500 px-2.5 py-1 rounded-full border border-gray-200">
                                        {item.tag}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark mb-2">{item.title}</h3>
                                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom Banner */}
                <div className="bg-brand-dark rounded-3xl p-8 sm:p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Estoque.png"
                            alt="Dino organizando"
                            className="w-20 h-20 sm:w-24 sm:h-24 object-contain shrink-0 drop-shadow select-none"
                        />
                        <div>
                            <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">
                                Comece pela vitrine. Organize do seu jeito.
                            </h3>
                            <p className="text-gray-300 text-xs sm:text-sm max-w-xl">
                                Você não precisa usar tudo de uma vez. Use apenas o que faz sentido para o seu dia a dia.
                            </p>
                        </div>
                    </div>

                    <Button
                        className="h-11 px-6 bg-brand-green text-white hover:bg-brand-green/90 font-bold text-sm shrink-0"
                        onClick={() => onNavigate('start-selling')}
                    >
                        Criar conta grátis
                    </Button>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   6. SEÇÃO DE DESCOBERTA (CIDADE VIVA)
   ========================================================================= */
function LiveDiscoverySection({ onNavigate }: { onNavigate: (page: string) => void }) {
    const liveItems = [
        {
            title: "Bolo de Cenoura com Chocolate",
            place: "Confeitaria da Vila",
            badge: "Recém anunciado",
            badgeColor: "bg-orange-50 text-orange-600 border-orange-100",
            price: "R$ 18,00",
            emoji: "🍰"
        },
        {
            title: "Instalação & Reparo Elétrico",
            place: "Carlos Eletricista",
            badge: "Disponível hoje",
            badgeColor: "bg-blue-50 text-blue-600 border-blue-100",
            price: "Orçamento grátis",
            emoji: "⚡"
        },
        {
            title: "Bicicleta Aro 29 seminova",
            place: "Bairro Jardim das Flores",
            badge: "Desapego",
            badgeColor: "bg-green-50 text-green-700 border-green-100",
            price: "R$ 650,00",
            emoji: "🚲"
        },
        {
            title: "Corte Degradê & Barboterapia",
            place: "Barbearia do Silva",
            badge: "Últimas 2 vagas",
            badgeColor: "bg-purple-50 text-purple-600 border-purple-100",
            price: "R$ 45,00",
            emoji: "💈"
        }
    ];

    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold uppercase tracking-wider mb-3">
                            Sua região em movimento
                        </div>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight">
                            Descubra coisas novas perto de você
                        </h2>
                    </div>
                    <Button
                        variant="outline"
                        className="h-11 px-5 text-sm font-semibold border-gray-300 text-brand-dark hover:bg-white shrink-0 self-start md:self-auto"
                        onClick={() => onNavigate('explore')}
                    >
                        Ver tudo no mapa
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>

                {/* Live cards grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {liveItems.map((item, idx) => (
                        <div
                            key={idx}
                            className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs hover:shadow-md hover:border-brand-green/40 transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-2xl">{item.emoji}</span>
                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${item.badgeColor}`}>
                                        {item.badge}
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold text-brand-dark mb-1 leading-snug">{item.title}</h3>
                                <p className="text-xs text-gray-500 mb-4">{item.place}</p>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-sm font-bold text-brand-green">{item.price}</span>
                                <span className="text-[11px] font-semibold text-gray-500 hover:text-brand-dark flex items-center gap-0.5">
                                    Ver <ChevronRight className="w-3 h-3" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   7. SEÇÃO FINAL / CTA
   ========================================================================= */
function FinalCTASection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-white relative">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-brand-dark rounded-3xl p-8 sm:p-14 lg:p-16 text-center relative overflow-hidden shadow-2xl">
                    {/* Background faint glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-green/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
                        {/* Mascot Happy Dino */}
                        <img
                            src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                            alt="Dino Dudit comemorando"
                            className="w-28 h-28 sm:w-32 sm:h-32 object-contain mb-6 drop-shadow-md select-none"
                        />

                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                            O que você precisa hoje?
                        </h2>
                        <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
                            Descubra o que a sua região oferece ou coloque seu negócio no mapa para ser encontrado por novos clientes.
                        </p>

                        <div className="flex flex-wrap justify-center gap-4 w-full sm:w-auto">
                            <Button
                                className="h-12 px-8 text-base font-bold bg-brand-green hover:bg-[#007b4f] text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                                onClick={() => onNavigate('explore')}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Explorar a Dudit
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
