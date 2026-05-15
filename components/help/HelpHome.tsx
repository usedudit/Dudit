"use client"

import React from "react"
import { motion } from "framer-motion"
import {
    RocketIcon,
    SettingsIcon,
    PackageIcon,
    TruckIcon,
    UserIcon,
    ShoppingBagIcon,
    BriefcaseIcon,
    HomeIcon,
    MoneyIcon,
    FileTextIcon,
    HelpCircleIcon,
    ChevronRightIcon,
    SearchIcon,
    KeyIcon,
    InfoIcon
} from "@/lib/icons"
import Link from "next/link"
import { Button } from "@/components/reusable"

export default function HelpHome() {
    return (
        <div className="max-w-[900px] mx-auto px-6 lg:px-12 py-12 lg:py-20 animate-fade-in">

            {/* HERO SECTION */}
            <header className="mb-20">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-brand-green/10 flex items-center justify-center text-brand-green">
                        <RocketIcon size={24} />
                    </div>
                    <span className="text-sm font-bold text-brand-green uppercase tracking-widest">Boas-vindas à Dudit</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-black text-brand-dark dark:text-dark-heading mb-6 leading-tight">
                    Dudit — Descubra o que tem por aqui
                </h1>
                <p className="text-xl text-gray-500 dark:text-dark-body leading-relaxed max-w-2xl">
                    Tudo que você precisa para gerenciar sua operação local em um só lugar. Um ambiente para ver o que tem na sua cidade — e também vender, divulgar ou organizar seu dia a dia sem complicação.
                </p>
            </header>

            {/* SECTION: O QUE É A DUDIT */}
            <section className="mb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-gray-50 dark:bg-dark-surface rounded-[32px] p-8 lg:p-12 border border-gray-100 dark:border-dark-border">
                    <div>
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4">
                            Simples de usar, pronto para vender
                        </h2>
                        <p className="text-gray-600 dark:text-dark-body leading-relaxed mb-6">
                            A Dudit é o lugar onde as pessoas vão ver o que tem por perto. Se você precisa de algo rápido, olha na Dudit. Se você tem algo a oferecer, a Dudit faz você aparecer para quem está por perto e resolve seu dia a dia.
                        </p>
                        <div className="space-y-4">
                            <FeatureItem text="Venda local, resolve rápido" />
                            <FeatureItem text="Apareça pra quem tá perto" />
                            <FeatureItem text="Sem taxas e sem depender de marketplaces" />
                        </div>
                    </div>
                    <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white dark:border-dark-border">
                        <img
                            src="https://img.dudit.com.br/static/Help_Home_Dashboard.png"
                            alt="Plataforma Dudit"
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
            </section>

            {/* SECTION: PARA CADA TIPO DE NEGÓCIO */}
            <section className="mb-24">
                <div className="flex flex-col items-center text-center mb-12">
                    <h2 className="text-3xl font-bold text-brand-dark dark:text-dark-heading mb-4">Qual o seu objetivo?</h2>
                    <p className="text-gray-500 dark:text-dark-body">Soluções pensadas para quem vende produtos, presta serviços ou aluga.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <BusinessCard
                        icon={<ShoppingBagIcon />}
                        title="Vender Produtos"
                        description="Gire seu estoque rápido e venda direto para vizinhos, sem taxas abusivas."
                        short="Apareça pra quem tá perto e venda mais rápido na sua cidade"
                    />
                    <BusinessCard
                        icon={<BriefcaseIcon />}
                        title="Prestar Serviços"
                        description="Pare de depender só de indicação. Divulgue seu trabalho e organize seus atendimentos."
                        short="Apareça pra mais clientes e organize seus atendimentos"
                    />
                    <BusinessCard
                        icon={<HomeIcon />}
                        title="Alugar Itens"
                        description="Tem algo parado aí? Coloque para alugar e faça ele render com gente da sua cidade."
                        short="Coloque pra alugar e encontre gente da sua cidade"
                    />
                </div>
            </section>

            {/* SECTION: PRIMEIROS PASSOS */}
            <section className="mb-24">
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-8 flex items-center gap-2">
                    <div className="w-2 h-6 bg-brand-green rounded-full" />
                    Primeiros Passos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <OnboardingCard
                        icon={<UserIcon size={20} />}
                        title="Acessando sua conta"
                        description="Veja como entrar na plataforma e configurar seu acesso inicial."
                        link="/ajuda/login-registro/acessando-conta"
                    />
                    <OnboardingCard
                        icon={<SettingsIcon size={20} />}
                        title="Configurando sua empresa"
                        description="Complete seu perfil e deixe sua vitrine pronta para o público."
                        link="/ajuda/login-registro/cadastro-parceiro"
                    />
                    <OnboardingCard
                        icon={<PackageIcon size={20} />}
                        title="Criando seus primeiros anúncios"
                        description="Adicione produtos ou serviços com fotos e descrições atraentes."
                        link="/ajuda/gestao/produtos"
                    />
                    <OnboardingCard
                        icon={<TruckIcon size={20} />}
                        title="Configurando delivery"
                        description="Defina taxas de entrega e horários de funcionamento."
                        link="/ajuda/configuracoes/delivery"
                    />
                </div>
            </section>

            {/* SECTION: MÓDULOS DA PLATAFORMA */}
            <section className="mb-24">
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-8 flex items-center gap-2">
                    <div className="w-2 h-6 bg-brand-green rounded-full" />
                    Explore os Módulos
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ModuleCard icon={<ShoppingBagIcon size={24} />} title="Catálogo" link="/ajuda/gestao/produtos" />
                    <ModuleCard icon={<TruckIcon size={24} />} title="Delivery" link="/ajuda/gestao/delivery" />
                    <ModuleCard icon={<MoneyIcon size={24} />} title="Financeiro" link="/ajuda/financeiro" />
                    <ModuleCard icon={<UserIcon size={24} />} title="Clientes" link="/ajuda/gestao/clientes" />
                    <ModuleCard icon={<FileTextIcon size={24} />} title="Pedidos" link="/ajuda/gestao/pedidos" />
                    <ModuleCard icon={<SettingsIcon size={24} />} title="Configurações" link="/ajuda/configuracoes" />
                    <ModuleCard icon={<BriefcaseIcon size={24} />} title="Serviços" link="/ajuda/gestao/servicos" />
                    <ModuleCard icon={<HelpCircleIcon size={24} />} title="Suporte" link="/ajuda/suporte" />
                </div>
            </section>

            {/* SECTION: AJUDA RÁPIDA */}
            <section className="bg-brand-green/5 dark:bg-brand-green/10 rounded-[32px] p-8 lg:p-12 border border-brand-green/10">
                <div className="flex flex-col md:flex-row gap-12 items-center">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4">Ainda com dúvidas?</h2>
                        <p className="text-gray-600 dark:text-dark-body mb-8">
                            Nossa equipe está pronta para te ajudar a mostrar seu negócio na Dudit e resolver qualquer problema.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Button variant="filled" className="rounded-full h-12 px-8">
                                <InfoIcon className="mr-2" size={18} /> Falar com suporte
                            </Button>
                            <Button variant="outline" className="rounded-full h-12 px-8 border-brand-green/20 text-brand-green">
                                Central de FAQ
                            </Button>
                        </div>
                    </div>
                    <div className="w-full md:w-64 space-y-2">
                        <QuickLink icon={<KeyIcon size={16} />} text="Recuperar senha" href="/auth/forgot-password" />
                        <QuickLink icon={<SearchIcon size={16} />} text="Ver o que tem por aqui" href="/" />
                        <QuickLink icon={<UserIcon size={16} />} text="Ser um parceiro" href="/auth/signup" />
                    </div>
                </div>
            </section>

            <footer className="mt-24 pt-12 border-t border-gray-100 dark:border-dark-border text-center">
                <p className="text-sm text-gray-400 dark:text-dark-body mb-4">
                    Se você precisar de algo e pensar “vou olhar na Dudit”, nós vencemos.
                </p>
                <div className="flex items-center justify-center gap-2 text-brand-green font-bold text-sm">
                    <span>dudit.com.br</span>
                    <div className="w-1 h-1 rounded-full bg-brand-green/30" />
                    <span>2026</span>
                </div>
            </footer>
        </div>
    )
}

function FeatureItem({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-green flex items-center justify-center">
                <ChevronRightIcon size={12} className="text-white" />
            </div>
            <span className="text-[15px] font-medium text-gray-700 dark:text-dark-heading">{text}</span>
        </div>
    )
}

function BusinessCard({ icon, title, description, short }: { icon: React.ReactNode, title: string, description: string, short: string }) {
    return (
        <div className="p-6 rounded-2xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-brand-green/10 flex items-center justify-center text-brand-green mb-4">
                {icon}
            </div>
            <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">{title}</h4>
            <p className="text-sm text-gray-500 dark:text-dark-body mb-4 leading-relaxed">{description}</p>
            <div className="mt-auto pt-4 border-t border-gray-50 dark:border-dark-border">
                <span className="text-[11px] font-bold text-brand-green uppercase tracking-wider">{short}</span>
            </div>
        </div>
    )
}

function OnboardingCard({ icon, title, description, link }: { icon: React.ReactNode, title: string, description: string, link: string }) {
    return (
        <Link href={link} className="flex gap-4 p-5 rounded-2xl border border-gray-100 dark:border-dark-border hover:border-brand-green/30 hover:bg-brand-green/[0.02] dark:hover:bg-brand-green/5 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-dark-border flex items-center justify-center text-gray-400 group-hover:text-brand-green transition-colors shrink-0">
                {icon}
            </div>
            <div>
                <h4 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-1 group-hover:text-brand-green transition-colors">{title}</h4>
                <p className="text-sm text-gray-500 dark:text-dark-body leading-relaxed">{description}</p>
            </div>
        </Link>
    )
}

function ModuleCard({ icon, title, link }: { icon: React.ReactNode, title: string, link: string }) {
    return (
        <Link href={link} className="flex flex-col items-center text-center p-6 rounded-2xl bg-gray-50 dark:bg-dark-surface border border-transparent hover:border-brand-green/20 hover:bg-white dark:hover:bg-dark-border transition-all duration-200">
            <div className="text-gray-400 mb-3">{icon}</div>
            <span className="text-sm font-bold text-gray-700 dark:text-dark-heading">{title}</span>
        </Link>
    )
}

function QuickLink({ icon, text, href }: { icon: React.ReactNode, text: string, href: string }) {
    return (
        <Link href={href} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/50 dark:bg-dark-surface hover:bg-white dark:hover:bg-dark-border text-sm font-medium text-gray-600 dark:text-dark-body transition-all hover:translate-x-1">
            <div className="text-gray-400">{icon}</div>
            {text}
        </Link>
    )
}
