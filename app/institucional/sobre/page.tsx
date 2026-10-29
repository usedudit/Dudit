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
    MessageCircle,
    Layout,
    TrendingUp,
    Users,
    Package,
    Heart,
    Star
} from 'lucide-react';
import { Button } from '@/components/reusable/Button';
import { GridLines, SectionHeader, Navbar, Footer, CTA } from '@/components/InstitucionalShared';

const SobreHero = ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
        <GridLines />
        <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1 className="text-5xl font-bold text-brand-dark mb-6">
                        Um jeito mais simples de encontrar e oferecer o que você precisa.
                    </h1>
                    <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                        A Dudit conecta pessoas e negócios em um só lugar para descobrir, anunciar, comprar, agendar e organizar.
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <Button onClick={() => onNavigate('explore')}>Explorar Dudit</Button>
                        <Button variant="outline" onClick={() => onNavigate('start-selling')}>Começar grátis</Button>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="relative h-[400px] lg:h-[500px] flex items-center justify-center"
                >
                    <div className="relative z-10 w-full max-w-[460px]">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Sobre Nós"
                            className="w-full h-auto object-contain"
                        />
                    </div>
                    <div className="absolute inset-0 bg-brand-gray/50 rounded-[4rem] transform rotate-6 scale-90 -z-10"></div>
                    <div className="absolute inset-0 bg-brand-green/5 rounded-[4rem] transform -rotate-3 scale-95 -z-10"></div>
                </motion.div>
            </div>
        </div>
    </section>
);

const PorQueExiste = () => {
    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="POR QUE A DUDIT EXISTE?"
                    title="Hoje muita coisa acontece espalhada"
                />

                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <p className="text-brand-dark text-lg md:text-xl font-medium leading-relaxed mb-6">
                            Encontrar algo, vender algo ou divulgar um negócio nem sempre é simples.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed mb-6">
                            Muitas vezes as pessoas procuram no Instagram, no WhatsApp, em grupos locais ou dependem apenas de indicações de conhecidos. Por outro lado, muitos negócios dependem somente de quem já passa na porta ou já é cliente.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed">
                            <strong className="text-brand-dark">A Dudit nasceu para deixar essa conexão mais fácil:</strong> aproximar quem tem uma necessidade de quem tem a solução, de forma simples, direta e sem intermediários.
                        </p>
                    </div>

                    <div className="bg-brand-slate border border-gray-100 p-8 rounded-2xl relative">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-100 shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">1</div>
                                <div className="text-xs text-brand-dark font-semibold">Quem procura: acha produtos e serviços locais rápido</div>
                            </div>
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-100 shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs">2</div>
                                <div className="text-xs text-brand-dark font-semibold">Quem vende: ganha uma vitrine aberta 24h para a região</div>
                            </div>
                            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-gray-100 shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs">3</div>
                                <div className="text-xs text-brand-dark font-semibold">Quem organiza: tem ferramentas leves do seu jeito</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const BentoPillars = () => {
    const cards = [
        {
            title: "Para quem procura",
            subtitle: "DESCOBERTA",
            description: "Encontrar produtos novos e usados, serviços, lojas e oportunidades na sua cidade.",
            type: "buy"
        },
        {
            title: "Para quem vende",
            subtitle: "VISIBILIDADE",
            description: "Mostrar produtos e serviços para mais pessoas sem depender apenas de indicação.",
            type: "sell"
        },
        {
            title: "Para quem organiza",
            subtitle: "SIMPLICIDADE",
            description: "Ferramentas práticas para ajudar negócios no dia a dia sem complicações.",
            type: "organize"
        }
    ];

    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="UMA PLATAFORMA PARA TODOS"
                    title="Feita para pessoas e negócios"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    Três pilares fundamentais pensados para aproximar e facilitar o dia a dia.
                </p>

                <div className="grid md:grid-cols-3 gap-8">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className="group flex flex-col justify-between"
                        >
                            <div className="bg-brand-slate border border-gray-100 h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                {card.type === 'buy' && (
                                    <div className="bg-white p-4 w-full max-w-[240px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                            <Search className="w-4 h-4 text-brand-green" />
                                            <span className="text-[10px] font-bold text-brand-dark">O que você precisa hoje</span>
                                        </div>
                                        <div className="space-y-2 text-[10px]">
                                            <div className="bg-gray-50 p-2 rounded flex justify-between font-medium">
                                                <span>Lojas e Mercados</span>
                                                <span className="text-brand-green font-bold">Perto de mim</span>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded flex justify-between font-medium">
                                                <span>Profissionais & Serviços</span>
                                                <span className="text-blue-600 font-bold">Agendamento</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {card.type === 'sell' && (
                                    <div className="bg-white p-4 w-full max-w-[240px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                            <Store className="w-4 h-4 text-brand-dark" />
                                            <span className="text-[10px] font-bold text-brand-dark">Vitrine Aberta</span>
                                        </div>
                                        <div className="text-center py-2">
                                            <div className="text-xs font-bold text-brand-dark">dudit.com.br/sualoja</div>
                                            <div className="text-[10px] text-brand-green font-semibold mt-1">0% de comissão sobre vendas</div>
                                        </div>
                                    </div>
                                )}
                                {card.type === 'organize' && (
                                    <div className="bg-white p-4 w-full max-w-[240px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                            <CheckCircle2 className="w-4 h-4 text-purple-600" />
                                            <span className="text-[10px] font-bold text-brand-dark">Gestão do seu jeito</span>
                                        </div>
                                        <div className="space-y-1.5 text-[10px] text-brand-inactive-text">
                                            <div className="flex justify-between"><span>Estoque</span><span className="text-brand-dark font-bold">Organizado</span></div>
                                            <div className="flex justify-between"><span>Agenda</span><span className="text-brand-dark font-bold">Disponível</span></div>
                                            <div className="flex justify-between"><span>Financeiro</span><span className="text-brand-green font-bold">100% Seu</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-6">
                                <span className="text-[10px] font-bold text-brand-green uppercase tracking-wider block mb-1">{card.subtitle}</span>
                                <h4 className="text-xl font-bold text-brand-dark mb-2">{card.title}</h4>
                                <p className="text-brand-inactive-text text-sm leading-relaxed">{card.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const SemComplicacao = () => {
    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="flex flex-col lg:flex-row min-h-[500px] rounded-3xl overflow-hidden shadow-xl">
                    <div className="flex-1 bg-brand-dark p-12 lg:p-16 flex flex-col justify-center relative z-10">
                        <span className="text-brand-green text-xs uppercase tracking-widest font-bold mb-4 block">SEM COMPLICAÇÃO</span>
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                            A Dudit não precisa substituir tudo que você já usa.
                        </h2>
                        <p className="text-brand-inactive-text text-base md:text-lg mb-8 max-w-md leading-relaxed">
                            Continue usando suas ferramentas favoritas. O Instagram para postar fotos, o WhatsApp para conversar. A Dudit é mais uma forma de ser encontrado e organizar o que precisar.
                        </p>
                    </div>

                    <div className="flex-1 bg-brand-green relative overflow-hidden flex items-center justify-center p-12">
                        <div className="relative z-10 w-full max-w-[340px] space-y-4">
                            <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 font-bold">📸</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark">Instagram</div>
                                    <div className="text-[10px] text-brand-inactive-text">Coloque seu link Dudit na bio</div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 font-bold">💬</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark">WhatsApp</div>
                                    <div className="text-[10px] text-brand-inactive-text">Receba contatos de clientes na hora</div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-brand-green/20 flex items-center justify-center text-brand-dark font-bold">🏪</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark">Dudit</div>
                                    <div className="text-[10px] text-brand-inactive-text">Mais uma porta para ser descoberto</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

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
        <div className="min-h-screen bg-white">
            <Navbar onNavigate={onNavigate} />
            <main>
                <SobreHero onNavigate={onNavigate} />
                <PorQueExiste />
                <BentoPillars />
                <SemComplicacao />
                <CTA onNavigate={onNavigate} />
            </main>
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
