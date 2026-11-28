"use client"

import React, { useState } from "react"
import {
    RocketIcon,
    SettingsIcon,
    PackageIcon,
    TruckIcon,
    UserIcon,
    ShoppingBagIcon,
    ServiceIcon,
    MoneyIcon,
    MegaphoneIcon,
    StoreIcon,
    KeyIcon,
    InfoIcon,
    StarIcon,
    AnalyticsIcon,
    RepeatIcon,
    CreditCardIcon,
} from "@/lib/icons"
import Link from "next/link"
import { Button, Badge, InfoCard, ListItem, FormSection } from "@/components/reusable"
import { SupportModal } from "@/components/support/SupportModal"
import { trackEvent, getAcquisitionContext } from "@/lib/analytics"

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
    const [isSupportOpen, setIsSupportOpen] = useState(false)

    return (
        <>
            <div className="flex-1 w-full max-w-[1000px] mx-auto px-6 lg:px-12 py-12 lg:py-20 animate-fade-in flex flex-col gap-24">

                {/* HERO SECTION - REFINED */}
                <header className="relative py-16 -mt-12 rounded-[40px] overflow-hidden border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                    <WavesBackground />

                    <div className="relative z-10 flex flex-col items-center text-center px-8">
                        <Badge variant="green" className="mb-8" icon={<RocketIcon />}>
                            Central de ajuda Dudit
                        </Badge>

                        <h1 className="text-4xl lg:text-6xl font-black text-brand-dark dark:text-dark-heading mb-6 leading-tight tracking-tight">
                            Como podemos ajudar?
                        </h1>

                        <p className="text-lg lg:text-xl text-brand-inactive-text dark:text-dark-body leading-relaxed max-w-2xl mb-12">
                            Encontre tutoriais passo a passo para vender no balcão, na sua cidade e em todo o Brasil, configurar integrações e organizar seu negócio sem complicação.
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-4">
                            <Button className="h-12" asChild>
                                <Link href="/ajuda/login-registro/acessando-conta">
                                    Começar Agora
                                </Link>
                            </Button>
                            <Button variant="outline" className="h-12" onClick={() => setIsSupportOpen(true)}>
                                Falar com Suporte
                            </Button>
                        </div>
                    </div>
                </header>

                {/* QUICK START SECTION */}
                <FormSection title="Primeiros Passos" description="Guia essencial para configurar sua presença na Dudit">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Link href="/ajuda/login-registro/acessando-conta" className="block">
                            <ListItem
                                icon={<UserIcon className="text-brand-green" />}
                                title="Acessando sua conta"
                                description="Veja como entrar na plataforma e configurar seu acesso inicial."
                                className="px-6 py-5"
                                showChevron
                            />
                        </Link>
                        <Link href="/ajuda/login-registro/cadastro-parceiro" className="block">
                            <ListItem
                                icon={<SettingsIcon className="text-brand-orange" />}
                                title="Configurando sua empresa"
                                description="Complete seu perfil e deixe sua vitrine pronta para o público."
                                className="px-6 py-5"
                                showChevron
                            />
                        </Link>
                        <Link href="/ajuda/produtos-estoque/como-cadastrar-produto" className="block">
                            <ListItem
                                icon={<PackageIcon className="text-blue-500" />}
                                title="Criando seus primeiros anúncios"
                                description="Adicione produtos ou serviços com fotos e descrições atraentes."
                                className="px-6 py-5"
                                showChevron
                            />
                        </Link>
                        <Link href="/ajuda/entregas/configurando-entregas-loja" className="block">
                            <ListItem
                                icon={<TruckIcon className="text-purple-500" />}
                                title="Configurando delivery e envios"
                                description="Defina taxas de entrega local, frete nacional e horários de funcionamento."
                                className="px-6 py-5"
                                showChevron
                            />
                        </Link>
                    </div>
                </FormSection>

                {/* MODULES GRID - DASHBOARD STYLE */}
                <FormSection title="Explore os Módulos" description="Explore as funcionalidades detalhadas do sistema, integrações e da vitrine">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <Link href="/ajuda/produtos-estoque/visao-geral-produtos-estoque" className="block"><ListItem className="px-4 py-3" icon={<ShoppingBagIcon />} title="Produtos e Estoque" /></Link>
                        <Link href="/ajuda/vitrine-online/visao-geral-vitrine-online" className="block"><ListItem className="px-4 py-3" icon={<StoreIcon />} title="Vitrine Online" /></Link>
                        <Link href="/ajuda/vendas/visao-geral-vendas" className="block"><ListItem className="px-4 py-3" icon={<ShoppingBagIcon />} title="Vendas" /></Link>
                        <Link href="/ajuda/entregas/visao-geral-entregas" className="block"><ListItem className="px-4 py-3" icon={<TruckIcon />} title="Entregas" /></Link>
                        <Link href="/ajuda/servicos/visao-geral-servicos" className="block"><ListItem className="px-4 py-3" icon={<ServiceIcon />} title="Serviços" /></Link>
                        <Link href="/ajuda/clientes/visao-geral-clientes" className="block"><ListItem className="px-4 py-3" icon={<UserIcon />} title="Clientes" /></Link>
                        <Link href="/ajuda/financeiro/visao-geral-financeiro" className="block"><ListItem className="px-4 py-3" icon={<MoneyIcon />} title="Financeiro" /></Link>
                        <Link href="/ajuda/marketing/visao-geral-cupons" className="block"><ListItem className="px-4 py-3" icon={<MegaphoneIcon />} title="Marketing" /></Link>
                        <Link href="/ajuda/integracoes" className="block"><ListItem className="px-4 py-3" icon={<RocketIcon />} title="Integrações & ERPs" /></Link>
                        <Link href="/ajuda/desempenho/visao-geral-desempenho" className="block"><ListItem className="px-4 py-3" icon={<AnalyticsIcon />} title="Desempenho" /></Link>
                        <Link href="/ajuda/assinaturas/planos-recorrentes" className="block"><ListItem className="px-4 py-3" icon={<RepeatIcon />} title="Assinaturas" /></Link>
                        <Link href="/ajuda/configuracoes/visao-geral-configuracoes" className="block"><ListItem className="px-4 py-3" icon={<SettingsIcon />} title="Configurações" /></Link>
                        <Link href="/ajuda/planos/planos-e-limites" className="block"><ListItem className="px-4 py-3" icon={<CreditCardIcon />} title="Planos e Limites" /></Link>
                        <Link href="/ajuda/marketplace" className="block"><ListItem className="px-4 py-3" icon={<ShoppingBagIcon />} title="Comprando na Dudit" /></Link>
                        <Link href="/ajuda/boas-vindas" className="block"><ListItem className="px-4 py-3" icon={<RocketIcon />} title="Boas-vindas" /></Link>
                        <Link href="/ajuda/login-registro" className="block"><ListItem className="px-4 py-3" icon={<KeyIcon />} title="Login e Registro" /></Link>
                    </div>
                </FormSection>

                {/* STRATEGY SECTION - TIPS & CARDS */}
                <FormSection title="Dicas de Sucesso" description="Confira nossas dicas para aproveitar ao máximo a plataforma">
                    <div className="space-y-6">
                        <InfoCard
                            color="green"
                            title="Venda local, resolve rápido"
                            message="A Dudit prioriza o que está perto. Certifique-se de que seu endereço está correto para aparecer nos resultados locais."
                            className="p-6"
                        />
                        <InfoCard
                            color="blue"
                            title="Fotos que convertem"
                            message="Anúncios com fotos claras e bem iluminadas costumam vender muito mais. Use nosso editor simples para ajustar suas imagens."
                            className="p-6"
                        />
                        <InfoCard
                            color="purple"
                            title="Atendimento via WhatsApp"
                            message="Conecte seu número para receber pedidos direto no seu celular. Agilidade é a chave para fechar vendas."
                            className="p-6"
                        />
                    </div>

                    <div className="bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-6 flex flex-col gap-6">
                        <h3 className="text-xl font-black text-brand-dark dark:text-dark-heading">Ainda com dúvidas?</h3>
                        <p className="text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            Nossa equipe está pronta para te ajudar a mostrar seu negócio na Dudit e resolver qualquer problema técnico ou de uso.
                        </p>

                        <div className="space-y-3">
                            <Link
                                href="/auth/login?mode=partner"
                                className="block"
                                onClick={() => trackEvent("cta_clicked", { source: "ajuda_home", target: "start_selling", ...getAcquisitionContext() })}
                            >
                                <ListItem
                                    title="Anunciar grátis"
                                    left={<StarIcon className="text-brand-green" />}
                                    className="px-4 py-3 border-x-0 border-t-0 border-b-1 rounded-none"
                                />
                            </Link>
                            <ListItem
                                title="Falar com suporte"
                                left={<InfoIcon className="text-brand-blue" />}
                                className="px-4 py-3 border-x-0 border-t-0 border-b-1 rounded-none"
                                onClick={() => setIsSupportOpen(true)}
                            />
                            <Link href="/auth/login?mode=forgot-password" className="block">
                                <ListItem
                                    title="Recuperar minha senha"
                                    left={<KeyIcon className="text-brand-orange" />}
                                    className="px-4 py-3 border-x-0 border-b-0 rounded-none"
                                />
                            </Link>
                        </div>
                    </div>
                </FormSection>

                {/* FOOTER */}
                <footer className="pt-12 border-t border-brand-border dark:border-dark-border flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                            © 2026 Dudit. Todos os direitos reservados.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <Link href="/institucional/inicio" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Início</Link>
                        <Link href="/institucional/planos" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Planos</Link>
                        <Link href="/blog" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Blog</Link>
                        <Link href="/ferramentas" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Ferramentas</Link>
                        <Link href="/institucional/termos" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Termos</Link>
                        <Link href="/institucional/privacidade" prefetch={false} className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors">Privacidade</Link>
                    </div>
                </footer>
            </div>

            <SupportModal
                isOpen={isSupportOpen}
                onClose={() => setIsSupportOpen(false)}
            />
        </>
    )
}