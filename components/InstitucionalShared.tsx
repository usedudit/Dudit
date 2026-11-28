"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MenuIcon,
    XIcon,
    SparklesIcon
} from '@/lib/icons';
import { Button } from '@/components/reusable/Button';
import { Badge } from '@/components/reusable/Badge';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import MarketplaceFooter from '@/components/marketplace/MarketplaceFooter';
import { trackEvent, getAcquisitionContext } from '@/lib/analytics';

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
        <h2 className={`text-4xl md:text-5xl font-bold tracking-tight ${light ? 'text-white' : 'text-brand-dark dark:text-dark-heading'}`}>
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
    <section className="relative bg-white dark:bg-dark-surface pt-32 pb-16 overflow-hidden flex flex-col justify-center text-center">
        <GridLines />
        <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <Badge variant="green" icon={<SparklesIcon />}>{badge}</Badge>

                <h1 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-heading leading-tight mb-6">
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
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-brand-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-4">{title}</h2>
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
                                className="border border-brand-border rounded-2xl overflow-hidden bg-white dark:bg-dark-surface hover:border-brand-green/30 transition-colors"
                            >
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    aria-controls={`faq-panel-${idx}`}
                                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                                    className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-brand-gray dark:hover:bg-dark-border/40 transition-colors cursor-pointer"
                                >
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading text-lg">
                                        {item.question}
                                    </span>
                                    <ChevronDown
                                        className={`w-5 h-5 text-brand-inactive-text shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                <div
                                    id={`faq-panel-${idx}`}
                                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                >
                                    <div className="overflow-hidden">
                                        <p className="px-6 pb-6 text-brand-inactive-text text-sm leading-relaxed">
                                            {item.answer}
                                        </p>
                                    </div>
                                </div>
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

    const navItems = [
        { label: 'Início', page: 'home' },
        { label: 'Sobre', page: 'about' },
        { label: 'Segmentos', page: 'segments' },
        { label: 'Planos', page: 'pricing' },
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-[100] w-full bg-brand-dark border-b border-white/10 shadow-md">
            <div className="w-full h-[68px] flex items-center justify-between max-w-[1400px] px-4 lg:px-2 mx-auto gap-4">
                <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-[110] pt-1">
                    <img
                        src="https://img.dudit.com.br/cdn-cgi/image/width=140,format=auto,quality=80/static/Logo.png"
                        alt="Dudit"
                        width={140}
                        height={40}
                        className="h-10 w-auto object-contain"
                    />
                </Link>

                <nav className="hidden xl:flex items-center gap-6 xl:gap-8 text-gray-300 font-medium text-sm">
                    {navItems.map((item) => (
                        <button
                            key={item.page}
                            onClick={() => handleNav(item.page)}
                            className="hover:text-brand-green transition-colors"
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="hidden xl:block">
                    <Button asChild>
                        <Link href="/auth/login?mode=partner" prefetch={false}>
                            Começar Grátis
                        </Link>
                    </Button>
                </div>

                <button
                    className="xl:hidden text-white p-1"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
                    aria-expanded={mobileOpen}
                >
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

            {/* Mobile / Tablet Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="xl:hidden absolute top-full left-0 w-full bg-brand-dark border-t border-white/10 shadow-lg overflow-hidden"
                    >
                        <div className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col gap-1">
                            {navItems.map((item) => (
                                <button
                                    key={item.page}
                                    onClick={() => handleNav(item.page)}
                                    className="text-gray-300 block py-3 text-left text-sm font-medium hover:text-brand-green transition-colors"
                                >
                                    {item.label}
                                </button>
                            ))}
                            <Button asChild className="w-full justify-center mt-3">
                                <Link
                                    href="/auth/login?mode=partner"
                                    prefetch={false}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    Começar Grátis
                                </Link>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export const Footer = ({ onNavigate: _onNavigate }: { onNavigate?: (page: string) => void }) => (
    <MarketplaceFooter showOnMobile />
);

export const CTA = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <section className="py-10 bg-white dark:bg-dark-background relative">
            <div className="max-w-[1400px] mx-auto relative z-10">
                <div className="relative bg-brand-dark rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 overflow-hidden">
                    {/* Background decorative faint rings */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] lg:w-[1000px] lg:h-[1000px] border border-white rounded-full" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[750px] lg:h-[750px] border border-white rounded-full" />
                    </div>

                    {/* Texto + Botão */}
                    <div className="flex-1 text-center md:text-left relative z-10">
                        <h2 className="text-2xl md:text-[32px] font-black text-white mb-3 leading-tight">
                            Pronto para vender na sua cidade e em todo o Brasil?
                        </h2>
                        <p className="text-white/70 text-base md:text-lg leading-relaxed mb-6">
                            Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda com 0% de comissão da plataforma. Em pagamentos online, aplicam-se apenas as taxas do meio de pagamento.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                            <Button asChild className="h-11">
                                <Link
                                    href="/auth/login?mode=partner"
                                    prefetch={false}
                                    onClick={() => trackEvent("cta_clicked", { source: "shared_cta", target: "start_selling", ...getAcquisitionContext() })}
                                >
                                    Começar grátis
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* Dino */}
                    <div className="w-[160px] md:w-[220px] shrink-0 flex items-center justify-center relative z-10">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                            alt="Venda na Dudit"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}
