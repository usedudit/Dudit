"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Search,
    Store,
    ShoppingBag,
    Calendar,
    ArrowRight,
    CheckCircle2,
    Users,
    Package,
    Heart,
    MessageCircle,
    Compass,
    Share2,
    Sparkles,
    Check
} from 'lucide-react';
import { Button } from '@/components/reusable/Button';
import { Navbar, Footer } from '@/components/InstitucionalShared';

export default function SobrePage() {
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
                <SobreHero onNavigate={onNavigate} />

                {/* POR QUE A DUDIT EXISTE */}
                <WhyWeExistSection />

                {/* PARA PESSOAS E NEGÓCIOS (BENTO) */}
                <PillarsBentoSection onNavigate={onNavigate} />

                {/* SEM COMPLICAÇÃO */}
                <NoComplicationSection onNavigate={onNavigate} />

                {/* CTA FINAL */}
                <SobreFinalCTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}

/* =========================================================================
   1. HERO SECTION
   ========================================================================= */
function SobreHero({ onNavigate }: { onNavigate: (page: string) => void }) {
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
                            <span>Sobre a Dudit</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-brand-dark tracking-tight leading-[1.08] mb-6">
                            Um jeito mais simples de encontrar e oferecer o que você precisa.
                        </h1>

                        <p className="text-gray-600 text-lg sm:text-xl mb-8 max-w-xl leading-relaxed">
                            A Dudit conecta pessoas e negócios em um só lugar para descobrir, anunciar, comprar, agendar e organizar.
                        </p>

                        <div className="flex flex-wrap items-center gap-4">
                            <Button
                                className="h-12 px-7 text-base font-bold bg-brand-green hover:bg-[#007b4f] text-white shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                onClick={() => onNavigate('explore')}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Explorar a Dudit
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 px-7 text-base font-semibold border-gray-200 text-brand-dark hover:bg-gray-50 transition-all"
                                onClick={() => onNavigate('start-selling')}
                            >
                                Começar grátis
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
                        <div className="relative w-full max-w-[380px]">
                            <div className="absolute inset-0 bg-brand-green/10 rounded-3xl blur-2xl -z-10" />
                            <div className="bg-white border border-gray-200/80 rounded-3xl p-8 shadow-xl text-center">
                                <img
                                    src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                    alt="Dino Dudit conectando pessoas e negócios"
                                    className="w-48 h-48 mx-auto object-contain drop-shadow-sm select-none mb-4"
                                />
                                <div className="text-sm font-bold text-brand-dark">Conectando sua região</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Mais perto, mais direto e sem complicação.
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
   2. SEÇÃO: POR QUE A DUDIT EXISTE?
   ========================================================================= */
function WhyWeExistSection() {
    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center mb-16">
                    <span className="text-xs font-bold text-brand-green uppercase tracking-widest block mb-3">
                        Nossa Proposta
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-6">
                        Por que a Dudit existe?
                    </h2>
                    <p className="text-gray-700 text-lg sm:text-xl font-medium leading-relaxed mb-6">
                        Hoje muita coisa acontece espalhada.
                    </p>
                    <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
                        Encontrar algo, vender algo ou divulgar um negócio nem sempre é simples. Muitas vezes as pessoas não sabem onde procurar, e muitos negócios dependem apenas de quem já conhece eles. A Dudit nasceu para deixar essa conexão mais fácil.
                    </p>
                </div>

                {/* Visual side-by-side comparison */}
                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    {/* Como era antes */}
                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm mb-4">
                            🔍
                        </div>
                        <h3 className="text-lg font-bold text-brand-dark mb-3">Tudo muito disperso</h3>
                        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-4">
                            Você procura um bolo artesanal ou um encanador no Instagram, pede indicação no WhatsApp, procura em grupos do bairro e nem sempre acha quem atende perto de você.
                        </p>
                        <div className="space-y-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">•</span> Grupos lotados de mensagens
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">•</span> Falta de informações claras de preço
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">•</span> Dificuldade para saber quem está perto
                            </div>
                        </div>
                    </div>

                    {/* Com a Dudit */}
                    <div className="bg-brand-green/5 rounded-3xl p-6 sm:p-8 border border-brand-green/20 shadow-xs">
                        <div className="w-10 h-10 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center font-bold text-sm mb-4">
                            ✨
                        </div>
                        <h3 className="text-lg font-bold text-brand-dark mb-3">Direto ao ponto com a Dudit</h3>
                        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-4">
                            Um lugar centralizado para quem quer resolver necessidades do dia a dia e para quem quer dar visibilidade aos seus produtos, serviços e horários.
                        </p>
                        <div className="space-y-2 pt-2 border-t border-brand-green/20 text-xs text-brand-dark font-medium">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" /> Encontre por proximidade e categoria
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" /> Fale direto pelo WhatsApp sem intermediários
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" /> Vitrine gratuita e sem cobrança de comissão
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   3. SEÇÃO: UMA PLATAFORMA PARA PESSOAS E NEGÓCIOS (BENTO)
   ========================================================================= */
function PillarsBentoSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    const pillars = [
        {
            tag: "Para quem procura",
            tagColor: "bg-blue-50 text-blue-600 border-blue-100",
            icon: Search,
            iconBg: "bg-blue-100/60 text-blue-600",
            title: "Encontrar coisas que precisa",
            desc: "Descubra lojas, produtos novos e usados, serviços rápidos, profissionais e oportunidades perto de você, a qualquer hora.",
            items: ["Produtos locais", "Serviços & reparos", "Agendamento fácil", "Contato direto"]
        },
        {
            tag: "Para quem vende",
            tagColor: "bg-brand-green/10 text-brand-green border-brand-green/20",
            icon: Store,
            iconBg: "bg-brand-green/10 text-brand-green",
            title: "Mais uma vitrine aberta",
            desc: "Mostre o que você faz para pessoas da sua cidade. Continue usando WhatsApp e redes sociais com a Dudit como apoio.",
            items: ["Sem comissão sobre vendas", "Link fácil para compartilhar", "Catálogo organizado", "Mais visibilidade local"]
        },
        {
            tag: "Para quem organiza",
            tagColor: "bg-purple-50 text-purple-600 border-purple-100",
            icon: Package,
            iconBg: "bg-purple-100/60 text-purple-600",
            title: "Ferramentas práticas",
            desc: "Se quiser organizar seu dia a dia, a Dudit oferece ferramentas simples de estoque, agendamentos, clientes e controle.",
            items: ["Controle de estoque leve", "Histórico de clientes", "Ordens de serviço digitais", "Sem sistemas pesados"]
        }
    ];

    return (
        <section className="py-20 md:py-28 bg-white relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-xs font-bold text-brand-green uppercase tracking-widest block mb-3">
                        Nossos Pilares
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-4">
                        Uma plataforma para pessoas e negócios
                    </h2>
                    <p className="text-gray-600 text-base sm:text-lg">
                        Criada para aproximar quem tem uma necessidade de quem tem a solução.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {pillars.map((item, idx) => (
                        <div
                            key={idx}
                            className="bg-gray-50/60 rounded-3xl p-6 sm:p-8 border border-gray-200/80 hover:bg-white hover:border-brand-green/30 hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
                                        <item.icon className="w-6 h-6" />
                                    </div>
                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${item.tagColor}`}>
                                        {item.tag}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-brand-dark mb-3">{item.title}</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-6">{item.desc}</p>
                            </div>

                            <div className="pt-4 border-t border-gray-200/60 space-y-2">
                                {item.items.map((it, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-green shrink-0" />
                                        <span>{it}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   4. SEÇÃO: SEM COMPLICAÇÃO
   ========================================================================= */
function NoComplicationSection({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-gray-50/50 relative border-b border-gray-100">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-12 gap-12 items-center">
                    <div className="lg:col-span-7">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold uppercase tracking-wider mb-4">
                            Sem complicação
                        </div>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark tracking-tight mb-6">
                            A Dudit não precisa substituir tudo que você já usa.
                        </h2>
                        <p className="text-gray-600 text-lg leading-relaxed mb-8">
                            Continue usando suas ferramentas favoritas. O Instagram para postar fotos, o WhatsApp para conversar com clientes e amigos. A Dudit entra como mais uma forma de ser encontrado e organizar o que precisar.
                        </p>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-200/80">
                                <span className="text-lg">📸</span>
                                <div className="text-xs text-gray-700 font-medium">
                                    <strong className="text-brand-dark">Instagram:</strong> Divulgue fotos, stories e coloque seu link da Dudit na bio.
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-200/80">
                                <span className="text-lg">💬</span>
                                <div className="text-xs text-gray-700 font-medium">
                                    <strong className="text-brand-dark">WhatsApp:</strong> Receba contatos de novos clientes direto no seu número.
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-200/80">
                                <span className="text-lg">📍</span>
                                <div className="text-xs text-gray-700 font-medium">
                                    <strong className="text-brand-dark">Dudit:</strong> Sua vitrine local aberta 24h para toda a sua região.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-5 flex justify-center">
                        <div className="bg-white rounded-3xl border border-gray-200/80 p-8 shadow-xl text-center max-w-[360px] w-full">
                            <img
                                src="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                alt="Dino Dudit parceiro de negócios"
                                className="w-40 h-40 mx-auto object-contain drop-shadow-sm select-none mb-4"
                            />
                            <h3 className="text-lg font-bold text-brand-dark mb-1">
                                Sem burocracia técnica
                            </h3>
                            <p className="text-xs text-gray-500 mb-6">
                                Crie sua conta em segundos e comece a usar do seu jeito.
                            </p>
                            <Button
                                className="w-full h-11 bg-brand-green hover:bg-[#007b4f] text-white font-bold text-sm"
                                onClick={() => onNavigate('start-selling')}
                            >
                                Começar grátis agora
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* =========================================================================
   5. CTA FINAL
   ========================================================================= */
function SobreFinalCTA({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <section className="py-20 md:py-28 bg-white relative">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-brand-dark rounded-3xl p-8 sm:p-14 lg:p-16 text-center relative overflow-hidden shadow-2xl">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-green/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                            alt="Dino Dudit comemorando"
                            className="w-28 h-28 sm:w-32 sm:h-32 object-contain mb-6 drop-shadow-md select-none"
                        />

                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                            O que você precisa hoje pode estar na Dudit.
                        </h2>
                        <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
                            Descubra coisas perto de você ou dê mais visibilidade ao seu negócio.
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
                                Criar conta
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
