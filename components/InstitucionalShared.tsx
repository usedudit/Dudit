"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MenuIcon,
    XIcon,
    SparklesIcon,
    FacebookIcon,
    TwitterIcon,
    LinkedinIcon,
    InstagramIcon
} from '@/lib/icons';
import { Button } from '@/components/reusable/Button';
import { Badge } from '@/components/reusable/Badge';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

export const GridLines = ({ dark = false }: { dark?: boolean }) => null;

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    light?: boolean;
    center?: boolean;
}

export const SectionHeader = ({ title, subtitle, light = false, center = false }: SectionHeaderProps) => (
    <div className={`mb-12 max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
        {subtitle && (
            <span className={`text-sm font-medium tracking-wider uppercase mb-4 block ${light ? 'text-brand-green' : 'text-brand-inactive-text'}`}>
                {subtitle}
            </span>
        )}
        <h2 className={`text-4xl md:text-5xl font-bold tracking-tight ${light ? 'text-white' : 'text-brand-dark'}`}>
            {title}
        </h2>
    </div>
);

interface ToolPageHeroProps {
    title: React.ReactNode;
    description: string;
    badge?: string;
}

export const ToolPageHero = ({ title, description, badge = "Ferramentas Grátis" }: ToolPageHeroProps) => (
    <section className="relative bg-white pt-32 pb-16 overflow-hidden flex flex-col justify-center text-center">
        <GridLines />
        <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <Badge variant="green" icon={<SparklesIcon />}>{badge}</Badge>

                <h1 className="text-4xl md:text-5xl font-bold text-brand-dark leading-tight mb-6">
                    {title}
                </h1>
                <p className="text-brand-inactive-text text-lg max-w-2xl mx-auto leading-relaxed">
                    {description}
                </p>
            </motion.div>
        </div>
    </section>
);

interface FaqItem {
    question: string;
    answer: string;
}

export const FaqSection = ({ title = "Dúvidas Frequentes", description, items }: { title?: string; description?: string; items: FaqItem[] }) => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="py-24 bg-white relative border-t border-brand-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl font-bold text-brand-dark mb-4">{title}</h2>
                    {description && (
                        <p className="text-brand-inactive-text">{description}</p>
                    )}
                </motion.div>

                <div className="space-y-4 max-w-4xl mx-auto">
                    {items.map((item, idx) => {
                        const isOpen = openIndex === idx;
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                className="border border-brand-border rounded-2xl overflow-hidden bg-white hover:border-brand-green/30 transition-colors"
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                                    className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-brand-gray transition-colors cursor-pointer"
                                >
                                    <span className="font-semibold text-brand-dark text-lg">
                                        {item.question}
                                    </span>
                                    <motion.div
                                        animate={{ rotate: isOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="shrink-0"
                                    >
                                        <ChevronDown className="w-5 h-5 text-brand-inactive-text" />
                                    </motion.div>
                                </button>
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                        >
                                            <p className="px-6 pb-6 text-brand-inactive-text text-sm leading-relaxed">
                                                {item.answer}
                                            </p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export const Navbar = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleNav = (page: string) => {
        onNavigate(page);
        setMobileOpen(false);
        window.scrollTo(0, 0);
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-brand-dark py-6 w-full h-[68px] flex items-center justify-between px-4 mx-auto gap-4">
            <div className="w-full flex items-center justify-between max-w-[1400px] mx-auto">
                <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-110 pt-1">
                    <img
                        src="https://img.dudit.com.br/static/Logo.png"
                        alt="Dudit"
                        width={140}
                        height={40}
                        className="h-10 w-auto object-contain"
                    />
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-gray-300 font-medium text-sm">
                    <button onClick={() => handleNav('home')} className="hover:text-brand-green transition-colors">Início</button>
                    <button onClick={() => handleNav('about')} className="hover:text-brand-green transition-colors">Sobre</button>
                    <button onClick={() => handleNav('segments')} className="hover:text-brand-green transition-colors">Segmentos</button>
                    <button onClick={() => handleNav('pricing')} className="hover:text-brand-green transition-colors">Planos</button>
                </nav>

                <div className="hidden md:block">
                    <Button onClick={() => handleNav('start-selling')}>
                        Começar Grátis
                    </Button>
                </div>

                <button className="md:hidden text-white p-1" onClick={() => setMobileOpen(!mobileOpen)}>
                    <AnimatePresence mode="wait" initial={false}>
                        {mobileOpen ? (
                            <motion.div
                                key="close"
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <XIcon />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="menu"
                                initial={{ rotate: 90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: -90, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <MenuIcon />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="md:hidden absolute top-full left-0 w-full bg-brand-dark border-t border-white/10 overflow-hidden"
                    >
                        <div className="p-4 flex flex-col gap-4">
                            <button onClick={() => handleNav('home')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Início</button>
                            <button onClick={() => handleNav('about')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Sobre</button>
                            <button onClick={() => handleNav('pricing')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Planos</button>
                            <Button className="w-full justify-center bg-brand-green text-white" onClick={() => handleNav('start-selling')}>Começar agora</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export const Footer = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <footer className="bg-brand-dark py-16 border-t border-white/10 relative mt-auto w-full">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                {/* Seção Superior */}
                <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">

                    {/* Logo + Descrição Local & Nacional */}
                    <div className="md:w-1/3">
                        <Link href="/" prefetch={true} className="inline-block mb-6">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                            Compre de quem tá perto ou receba de qualquer lugar do Brasil. Uma vitrine simples para vender na sua cidade e enviar para todo o país com 0% de comissão.
                        </p>
                    </div>

                    {/* Colunas de Links */}
                    <div className="flex-1 flex flex-wrap justify-between gap-8">

                        {/* Coluna 1: Comprar e Vender */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">Comprar e Vender</h4>
                            <ul className="space-y-4">
                                <li><Link href="/explorar" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Explorar produtos e cidades</Link></li>
                                <li><Link href="/auth/login?mode=partner" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Criar minha loja grátis</Link></li>
                                <li><Link href="/institucional/segmentos" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Soluções por segmento</Link></li>
                                <li><Link href="/institucional/planos" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Planos com 0% de comissão</Link></li>
                                <li><Link href="/mapa-do-site" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Mapa do Site</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 2: Calculadoras para Negócios */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">Calculadoras do Negócio</h4>
                            <ul className="space-y-4">
                                <li><Link href="/ferramentas/calculadora-taxas-marketplace" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Calculadora de Taxas</Link></li>
                                <li><Link href="/ferramentas/calculadora-margem-lucro-preco-venda" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Preço de Venda & Markup</Link></li>
                                <li><Link href="/ferramentas/calculadora-ponto-equilibrio" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Ponto de Equilíbrio</Link></li>
                                <li><Link href="/ferramentas/gerador-link-whatsapp" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Link de WhatsApp para Bio</Link></li>
                                <li><Link href="/ferramentas" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Todas as calculadoras</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 3: A Dudit */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">A Dudit</h4>
                            <ul className="space-y-4">
                                <li><Link href="/institucional/inicio" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Como a Dudit funciona</Link></li>
                                <li><Link href="/institucional/sobre" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Por que a Dudit existe</Link></li>
                                <li><Link href="/ajuda" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Central de Ajuda</Link></li>
                                <li><Link href="/institucional/contato" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Fale com a gente</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Barra Inferior: Legal + Redes Sociais */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
                    <div className="text-center md:text-left order-2 md:order-1 flex flex-col md:flex-row items-center gap-2 md:gap-4">
                        <p className="text-gray-500 text-xs">
                            © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                            <Link href="/institucional/termos" prefetch={false} className="hover:text-gray-300 transition-colors">Termos</Link>
                            <span>•</span>
                            <Link href="/institucional/privacidade" prefetch={false} className="hover:text-gray-300 transition-colors">Privacidade</Link>
                            <span>•</span>
                            <Link href="/institucional/dpa" prefetch={false} className="hover:text-gray-300 transition-colors">DPA (ERP)</Link>
                            <span>•</span>
                            <Link href="/mapa-do-site" prefetch={false} className="hover:text-brand-green transition-colors">Mapa do Site</Link>
                        </div>
                    </div>

                    {/* Redes Sociais com Links Reais e Target Blank */}
                    <div className="flex gap-4 order-1 md:order-2">
                        <a
                            href="https://instagram.com/usedudit"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                            title="Siga a Dudit no Instagram"
                        >
                            <InstagramIcon className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </a>
                        <a
                            href="https://twitter.com/usedudit"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                            title="Siga a Dudit no Twitter"
                        >
                            <TwitterIcon className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </a>
                    </div>
                </div>

            </div>
        </footer>
    )
}

export const CTA = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <section className="py-10 px-4 bg-white relative">
            <GridLines />
            <div className="max-w-[1200px] mx-auto relative z-10">
                <div className="bg-brand-dark rounded-3xl p-8 md:p-10 text-center overflow-hidden relative">
                    {/* Background decorative faint rings */}
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white rounded-full"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white rounded-full"></div>
                    </div>

                    <h2 className="text-4xl md:text-4xl font-bold text-white mb-6">
                        Pronto para vender na sua cidade <br />e em todo o Brasil?
                    </h2>
                    <h3 className="text-xl md:text-xl text-gray-300 mb-10 max-w-xl mx-auto">
                        Crie sua vitrine em minutos, receba pedidos pelo WhatsApp e venda sem comissões.
                    </h3>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Button className="h-12" onClick={() => onNavigate('start-selling')}>Começar Grátis</Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
