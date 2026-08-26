"use client"

import React from "react"
import {
    RocketIcon,
    SettingsIcon,
    PackageIcon,
    TruckIcon,
    UserIcon,
    ShoppingBagIcon,
    ServiceIcon,
    BriefcaseIcon,
    MoneyIcon,
    MegaphoneIcon,
    StoreIcon,
    FileTextIcon,
    HelpCircleIcon,
    KeyIcon,
    InfoIcon,
    StarIcon,
} from "@/lib/icons"
import Link from "next/link"
import { Button, Badge, InfoCard, ListItem } from "@/components/reusable"

const WavesBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <img
            src="https://img.dudit.com.br/static/banners/WavesPattern.png"
            alt=""
            className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white dark:via-dark-surface/50 dark:to-dark-surface" />
    </div>
))
WavesBackground.displayName = "WavesBackground"

export default function HelpHome() {
    return (
        <div className="flex-1 w-full max-w-[1000px] mx-auto px-6 lg:px-12 py-12 lg:py-20 animate-fade-in flex flex-col gap-24">

            {/* HERO SECTION - REFINED */}
            <header className="relative py-16 -mt-12 rounded-[40px] overflow-hidden border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                <WavesBackground />

                <div className="relative z-10 flex flex-col items-center text-center px-8">
                    <Badge variant="green" className="mb-8" icon={<RocketIcon />}>
                        CENTRAL DE AJUDA DUDIT
                    </Badge>

                    <h1 className="text-4xl lg:text-6xl font-black text-brand-dark dark:text-dark-heading mb-6 leading-tight tracking-tight">
                        Descubra o que tem por aqui
                    </h1>

                    <p className="text-lg lg:text-xl text-brand-inactive-text dark:text-dark-body leading-relaxed max-w-2xl mb-12">
                        Tudo que você precisa para gerenciar sua operação local em um só lugar. Venda, divulgue ou organize seu dia a dia sem complicação.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <Button className="h-12 px-8 rounded-full font-bold shadow-lg shadow-brand-green/20" asChild>
                            <Link href="/ajuda/login-registro/acessando-conta">
                                Começar Agora
                            </Link>
                        </Button>
                        <Button variant="outline" className="h-12 px-8 rounded-full font-bold bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm border-brand-border dark:border-dark-border" asChild>
                            <Link href="/ajuda/suporte">
                                Falar com Suporte
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            {/* QUICK START SECTION */}
            <section>
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-1.5 h-8 bg-brand-green rounded-full" />
                    <div>
                        <h2 className="text-2xl font-black text-brand-dark dark:text-dark-heading uppercase tracking-tight">
                            Primeiros Passos
                        </h2>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Guia essencial para configurar sua presença na Dudit</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ListItem
                        icon={<UserIcon className="text-brand-green" />}
                        title="Acessando sua conta"
                        description="Veja como entrar na plataforma e configurar seu acesso inicial."
                        className="px-6 py-5"
                        showChevron
                        onClick={() => window.location.href = "/ajuda/login-registro/acessando-conta"}
                    />
                    <ListItem
                        icon={<SettingsIcon className="text-brand-orange" />}
                        title="Configurando sua empresa"
                        description="Complete seu perfil e deixe sua vitrine pronta para o público."
                        className="px-6 py-5"
                        showChevron
                        onClick={() => window.location.href = "/ajuda/login-registro/cadastro-parceiro"}
                    />
                    <ListItem
                        icon={<PackageIcon className="text-blue-500" />}
                        title="Criando seus primeiros anúncios"
                        description="Adicione produtos ou serviços com fotos e descrições atraentes."
                        className="px-6 py-5"
                        showChevron
                        onClick={() => window.location.href = "/ajuda/gestao/produtos"}
                    />
                    <ListItem
                        icon={<TruckIcon className="text-purple-500" />}
                        title="Configurando delivery"
                        description="Defina taxas de entrega e horários de funcionamento."
                        className="px-6 py-5"
                        showChevron
                        onClick={() => window.location.href = "/ajuda/entregas/configurando-entregas-loja"}
                    />
                </div>
            </section>

            {/* MODULES GRID - DASHBOARD STYLE */}
            <section>
                <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-8 bg-brand-orange rounded-full" />
                        <div>
                            <h2 className="text-2xl font-black text-brand-dark dark:text-dark-heading uppercase tracking-tight">
                                Explore os Módulos
                            </h2>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Explore as funcionalidades detalhadas do ERP e Vitrine</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <ModuleCard icon={<ShoppingBagIcon size={24} />} title="Produtos e Estoque" link="/ajuda/produtos-estoque/visao-geral-produtos-estoque" color="green" />
                    <ModuleCard icon={<StoreIcon size={24} />} title="Vitrine Online" link="/ajuda/vitrine-online/visao-geral-vitrine-online" color="green" />
                    <ModuleCard icon={<ShoppingBagIcon size={24} />} title="Vendas" link="/ajuda/vendas/visao-geral-vendas" color="green" />
                    <ModuleCard icon={<TruckIcon size={24} />} title="Entregas" link="/ajuda/entregas/visao-geral-entregas" color="blue" />
                    <ModuleCard icon={<ServiceIcon size={24} />} title="Serviços" link="/ajuda/servicos/visao-geral-servicos" color="green" />
                    <ModuleCard icon={<UserIcon size={24} />} title="Clientes" link="/ajuda/clientes/visao-geral-clientes" color="green" />
                    <ModuleCard icon={<MoneyIcon size={24} />} title="Financeiro" link="/ajuda/financeiro/visao-geral-financeiro" color="green" />
                    <ModuleCard icon={<MegaphoneIcon size={24} />} title="Marketing" link="/ajuda/marketing/visao-geral-cupons" color="green" />
                    <ModuleCard icon={<HelpCircleIcon size={24} />} title="Primeiros Passos" link="/ajuda/login-registro/acessando-conta" color="blue" />
                </div>
            </section>

            {/* STRATEGY SECTION - TIPS & CARDS */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-1.5 h-8 bg-brand-dark dark:bg-dark-body rounded-full" />
                        <h2 className="text-2xl font-black text-brand-dark dark:text-dark-heading uppercase tracking-tight">
                            Dicas de Sucesso
                        </h2>
                    </div>

                    <InfoCard
                        color="green"
                        title="Venda local, resolve rápido"
                        message="A Dudit prioriza o que está perto. Certifique-se de que seu endereço está correto para aparecer nos resultados locais."
                        className="p-6"
                    />
                    <InfoCard
                        color="blue"
                        title="Fotos que convertem"
                        message="Anúncios com fotos claras e bem iluminadas vendem 3x mais. Use nosso editor simples para ajustar suas imagens."
                        className="p-6"
                    />
                    <InfoCard
                        color="purple"
                        title="Atendimento via WhatsApp"
                        message="Conecte seu número para receber pedidos direto no seu celular. Agilidade é a chave para fechar vendas."
                        className="p-6"
                    />
                </div>

                <div className="bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[32px] p-8 lg:p-10 flex flex-col gap-8">
                    <h3 className="text-xl font-black text-brand-dark dark:text-dark-heading mb-2">Ainda com dúvidas?</h3>
                    <p className="text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        Nossa equipe está pronta para te ajudar a mostrar seu negócio na Dudit e resolver qualquer problema técnico ou de uso.
                    </p>

                    <div className="space-y-3">
                        <ListItem
                            title="Falar com suporte"
                            left={<InfoIcon size={20} className="text-brand-green" />}
                            className="px-4 py-3 bg-white/50 dark:bg-dark-border/20 border-none"
                        />
                        <ListItem
                            title="Recuperar minha senha"
                            left={<KeyIcon size={20} className="text-brand-orange" />}
                            className="px-4 py-3 bg-white/50 dark:bg-dark-border/20 border-none"
                            onClick={() => window.location.href = "/auth/forgot-password"}
                        />
                        <ListItem
                            title="Seja um parceiro"
                            left={<StarIcon size={20} className="text-yellow-500" />}
                            className="px-4 py-3 bg-white/50 dark:bg-dark-border/20 border-none"
                            onClick={() => window.location.href = "/auth/signup"}
                        />
                    </div>

                    <Button variant="filled" className="w-full h-12 rounded-2xl font-bold" asChild>
                        <Link href="/ajuda/faq">
                            Acessar Central de FAQ
                        </Link>
                    </Button>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="pt-12 border-t border-brand-border dark:border-dark-border flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <img
                        src="https://img.dudit.com.br/static/Logo.png"
                        alt="Dudit"
                        className="h-6 w-auto opacity-50 grayscale"
                    />
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                        © 2026 Dudit Tecnologia. Todos os direitos reservados.
                    </p>
                </div>
                <div className="flex items-center gap-6 text-sm font-bold text-brand-inactive-text dark:text-dark-body">
                    <Link href="/institucional/termos" className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Termos</Link>
                    <Link href="/institucional/privacidade" className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Privacidade</Link>
                    <Link href="/" className="text-brand-green hover:underline tracking-tight">dudit.com.br</Link>
                </div>
            </footer>
        </div>
    )
}

function ModuleCard({ icon, title, link, color }: { icon: React.ReactNode, title: string, link: string, color: string }) {
    const colorStyles: Record<string, string> = {
        green: "bg-green-50/50 dark:bg-green-900/10 text-green-600 border-green-100/50 dark:border-green-900/20",
        orange: "bg-orange-50/50 dark:bg-orange-900/10 text-orange-600 border-orange-100/50 dark:border-orange-900/20",
        blue: "bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 border-blue-100/50 dark:border-blue-900/20",
        purple: "bg-purple-50/50 dark:bg-purple-900/10 text-purple-600 border-purple-100/50 dark:border-purple-900/20",
        cyan: "bg-cyan-50/50 dark:bg-cyan-900/10 text-cyan-600 border-cyan-100/50 dark:border-cyan-900/20",
        gray: "bg-gray-50/50 dark:bg-gray-800/10 text-gray-600 border-gray-100/50 dark:border-gray-800/20",
    }

    return (
        <Link
            href={link}
            className="group flex flex-col items-center justify-center p-8 rounded-[32px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:border-brand-dark/20 dark:hover:border-dark-body/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
        >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border transition-transform group-hover:scale-110 ${colorStyles[color]}`}>
                {icon}
            </div>
            <span className="text-sm font-black text-brand-dark dark:text-dark-heading uppercase tracking-tight">{title}</span>
        </Link>
    )
}
