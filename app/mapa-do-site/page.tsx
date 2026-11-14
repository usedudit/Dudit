"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar, Footer, SectionHeader, GridLines } from "@/components/InstitucionalShared";
import {
    Store,
    Wrench,
    Calculator,
    Compass,
    FileText,
    HelpCircle,
    ArrowUpRight,
    Sparkles,
    Shield,
    Users
} from "lucide-react";

interface SiteMapSection {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    links: {
        label: string;
        href: string;
        description?: string;
        badge?: string;
    }[];
}

const sitemapSections: SiteMapSection[] = [
    {
        title: "Institucional",
        description: "Conheça mais sobre a Dudit, nossa proposta e modelos de planos.",
        icon: Store,
        links: [
            { label: "Página Inicial Institucional", href: "/institucional/inicio", description: "Visão geral da plataforma para vendas locais e nacionais" },
            { label: "Sobre a Dudit", href: "/institucional/sobre", description: "Nossa história, missão e como facilitamos o comércio" },
            { label: "Planos e Preços", href: "/institucional/planos", description: "Plano gratuito e assinaturas com 0% de comissão sobre vendas", badge: "0% Taxa" },
            { label: "Segmentos Atendidos", href: "/institucional/segmentos", description: "Hub de soluções especializadas por tipo de negócio" },
            { label: "Fale Conosco", href: "/institucional/contato", description: "Canais de contato com a equipe da Dudit" },
        ],
    },
    {
        title: "Soluções por Segmento",
        description: "Páginas dedicadas com ferramentas feitas sob medida para cada nicho.",
        icon: Wrench,
        links: [
            {
                label: "Oficinas Mecânicas e Auto Centers",
                href: "/segmentos/oficinas-e-tecnicos",
                description: "Ordens de serviço detalhadas, controle de peças e orçamentos pelo WhatsApp",
            },
            {
                label: "Assistência Técnica e Celulares",
                href: "/segmentos/assistencia-tecnica-celulares",
                description: "OS com ficha de entrada, fotos do aparelho e histórico do conserto",
            },
            {
                label: "Salões de Beleza e Barbearias",
                href: "/segmentos/saloes-e-barbearias",
                description: "Agendamento online 24h, gestão de profissionais e comissões de equipe",
            },
            {
                label: "Confeitarias, Docerias e Marmitarias",
                href: "/segmentos/confeitarias-e-alimentacao",
                description: "Cardápio digital para WhatsApp, pedidos organizados e 0% de comissão por venda",
            },
            {
                label: "Lojas de Roupas, Calçados e Acessórios",
                href: "/segmentos/lojas-de-roupas-e-calcados",
                description: "Grade de estoque por cor e tamanho, etiquetas de código de barras e PDV",
            },
            {
                label: "Autônomos e Prestadores de Serviços",
                href: "/segmentos/autonomos-e-prestadores-de-servicos",
                description: "Vitrine de serviços, orçamentos em PDF, agenda e financeiro em um só lugar",
            },
        ],
    },
    {
        title: "Ferramentas Gratuitas",
        description: "Calculadoras práticas e utilitários para precificação e gestão de pequenos negócios.",
        icon: Calculator,
        links: [
            { label: "Hub de Ferramentas", href: "/ferramentas", description: "Todas as calculadoras e ferramentas gratuitas em um só lugar" },
            { label: "Calculadora de Taxas de Marketplace", href: "/ferramentas/calculadora-taxas-marketplace", description: "Compare custos de comissão e saiba quanto economiza com a Dudit" },
            { label: "Calculadora de Margem de Lucro e Markup", href: "/ferramentas/calculadora-margem-lucro-preco-venda", description: "Defina o preço de venda ideal considerando custos e impostos" },
            { label: "Calculadora de Ponto de Equilíbrio", href: "/ferramentas/calculadora-ponto-equilibrio", description: "Descubra o volume de vendas necessário para cobrir os custos fixos" },
            { label: "Gerador de Link de WhatsApp", href: "/ferramentas/gerador-link-whatsapp", description: "Crie links wa.me personalizados com mensagem pronta para a bio" },
        ],
    },
    {
        title: "Vitrine & Plataforma",
        description: "Encontre produtos, serviços e gerencie suas compras ou loja.",
        icon: Compass,
        links: [
            { label: "Explorar", href: "/explorar", description: "Encontre produtos, serviços e comércios na sua região ou com envio nacional" },
            { label: "Cadastrar meu Negócio", href: "/auth/login?mode=partner", description: "Crie sua loja ou perfil profissional gratuitamente", badge: "Grátis" },
            { label: "Central de Ajuda e Tutoriais", href: "/ajuda", description: "Guias passo a passo sobre pedidos, PDV, estoque e entregas" },
            { label: "Termos de Uso", href: "/institucional/termos", description: "Termos e condições gerais de uso da plataforma" },
            { label: "Política de Privacidade", href: "/institucional/privacidade", description: "Diretrizes de proteção e tratamento de dados (LGPD)" },
        ],
    },
];

export default function MapaDoSitePage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === "home") router.push("/institucional/inicio");
        else if (page === "segments") router.push("/institucional/segmentos");
        else if (page === "pricing") router.push("/institucional/planos");
        else if (page === "terms") router.push("/institucional/termos");
        else if (page === "privacidade") router.push("/institucional/privacidade");
        else if (page === "about") router.push("/institucional/sobre");
        else if (page === "start-selling") router.push("/auth/login?mode=partner");
        else if (page === "explore") router.push("/explorar");
        else router.push("/");
    };

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <Navbar onNavigate={onNavigate} />

            <main className="flex-1 pt-28 pb-20">
                {/* Hero */}
                <section className="relative bg-white py-12 border-b border-gray-100">
                    <GridLines />
                    <div className="max-w-[1400px] mx-auto px-4 relative z-10 text-center">
                        <span className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3 block">
                            ESTRUTURA DE CONTEÚDO
                        </span>
                        <h1 className="text-4xl md:text-5xl font-bold text-brand-dark mb-4 tracking-tight">
                            Mapa do Site
                        </h1>
                        <p className="text-brand-inactive-text text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                            Acesse rapidamente todas as soluções, segmentos atendidos, calculadoras gratuitas e páginas institucionais da Dudit.
                        </p>
                    </div>
                </section>

                {/* Seções em Grid */}
                <section className="max-w-[1400px] mx-auto px-4 py-16">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {sitemapSections.map((section, idx) => {
                            const IconComponent = section.icon;
                            return (
                                <div
                                    key={idx}
                                    className="bg-brand-slate/40 border border-gray-100 rounded-3xl p-8 hover:border-brand-green/30 transition-colors flex flex-col justify-between"
                                >
                                    <div>
                                        {/* Header da seção */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-2xl bg-brand-green/10 flex items-center justify-center text-brand-dark">
                                                <IconComponent className="w-5 h-5 text-brand-green" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-brand-dark">{section.title}</h2>
                                                <p className="text-xs text-brand-inactive-text">{section.description}</p>
                                            </div>
                                        </div>

                                        {/* Links da seção */}
                                        <ul className="divide-y divide-gray-100 mt-6">
                                            {section.links.map((link, linkIdx) => (
                                                <li key={linkIdx} className="py-3.5 first:pt-0 last:pb-0">
                                                    <Link
                                                        href={link.href}
                                                        className="group flex items-start justify-between gap-4"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-semibold text-brand-dark group-hover:text-brand-green transition-colors">
                                                                    {link.label}
                                                                </span>
                                                                {link.badge && (
                                                                    <span className="bg-brand-green/10 text-brand-green font-bold text-[10px] px-2 py-0.5 rounded-full">
                                                                        {link.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {link.description && (
                                                                <p className="text-xs text-brand-inactive-text mt-0.5 line-clamp-1">
                                                                    {link.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-brand-green transition-all transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 mt-1" />
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}

