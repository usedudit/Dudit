"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { InstagramIcon, TwitterIcon } from "@/lib/icons"

interface FooterProps {
    setView?: (view: any) => void
    /** Exibe o footer também no mobile (usado nas páginas institucionais). */
    showOnMobile?: boolean
}

const Footer: React.FC<FooterProps> = ({ setView, showOnMobile = false }) => {
    const [isPWA, setIsPWA] = useState(false)

    useEffect(() => {
        if (typeof window !== "undefined") {
            const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone
            if (isStandalone) {
                setIsPWA(true)
            }
        }
    }, [])

    if (isPWA) {
        return null
    }

    return (
        <footer className={`${showOnMobile ? "block" : "hidden lg:block"} bg-brand-dark dark:bg-dark-surface py-16 border-t border-white/10 relative mt-auto w-full`}>
            <div className="max-w-[1400px] mx-auto px-4 lg:px-2 relative z-10">

                {/* Seção Superior */}
                <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">

                    {/* Logo + Descrição Local & Nacional */}
                    <div className="md:w-1/3">
                        <Link href="/" prefetch={false} className="inline-block mb-6">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <p className="text-gray-400 dark:text-dark-body text-sm leading-relaxed max-w-sm">
                            Compre de quem tá perto ou receba de qualquer lugar do Brasil. Uma vitrine simples para vender na sua cidade e enviar para todo o país com 0% de comissão.
                        </p>

                        {/* Redes Sociais */}
                        <div className="flex gap-4 mt-6">
                            <a
                                href="https://instagram.com/usedudit"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                                title="Siga a Dudit no Instagram"
                            >
                                <InstagramIcon className="w-4 h-4 text-gray-400 dark:text-dark-body group-hover:text-white" />
                            </a>
                            <a
                                href="https://twitter.com/usedudit"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                                title="Siga a Dudit no Twitter"
                            >
                                <TwitterIcon className="w-4 h-4 text-gray-400 dark:text-dark-body group-hover:text-white" />
                            </a>
                        </div>
                    </div>

                    {/* Colunas de Links */}
                    <div className="flex-1 flex flex-wrap justify-between gap-8">

                        {/* Coluna 1: Comprar e Vender */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">Comprar e Vender</h4>
                            <ul className="space-y-3">
                                <li><Link href="/explorar" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Explorar produtos e cidades</Link></li>
                                <li><Link href="/auth/login?mode=partner" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Criar minha loja grátis</Link></li>
                                <li><Link href="/institucional/segmentos" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Soluções por segmento</Link></li>
                                <li><Link href="/institucional/planos" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Planos com 0% de comissão</Link></li>
                                <li><Link href="/mapa-do-site" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Mapa do Site</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 2: Calculadoras para Negócios */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">Calculadoras do Negócio</h4>
                            <ul className="space-y-3">
                                <li><Link href="/ferramentas/calculadora-taxas-marketplace" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Calculadora de Taxas</Link></li>
                                <li><Link href="/ferramentas/calculadora-margem-lucro-preco-venda" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Preço de Venda & Markup</Link></li>
                                <li><Link href="/ferramentas/calculadora-ponto-equilibrio" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Ponto de Equilíbrio</Link></li>
                                <li><Link href="/ferramentas/gerador-link-whatsapp" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Link de WhatsApp para Bio</Link></li>
                                <li><Link href="/ferramentas" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Todas as calculadoras</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 3: A Dudit */}
                        <div>
                            <h4 className="text-sm font-semibold text-white mb-6">A Dudit</h4>
                            <ul className="space-y-3">
                                <li><Link href="/institucional/inicio" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Como a Dudit funciona</Link></li>
                                <li><Link href="/institucional/sobre" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Por que a Dudit existe</Link></li>
                                <li><Link href="/blog" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Blog do Dino</Link></li>
                                <li><Link href="/ajuda" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Central de Ajuda</Link></li>
                                <li><Link href="/institucional/contato" prefetch={false} className="text-sm text-gray-400 dark:text-dark-body hover:text-brand-green transition-colors">Fale com a gente</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Barra Inferior: Legal */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
                    <p className="text-gray-500 dark:text-dark-body text-xs text-center md:text-left">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                    </p>

                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-dark-body">
                        <Link href="/institucional/termos" prefetch={false} className="hover:text-gray-300 transition-colors">Termos de uso</Link>
                        <span>•</span>
                        <Link href="/institucional/privacidade" prefetch={false} className="hover:text-gray-300 transition-colors">Privacidade</Link>
                        <span>•</span>
                        <Link href="/mapa-do-site" prefetch={false} className="hover:text-brand-green transition-colors">Mapa do Site</Link>
                    </div>
                </div>

            </div>
        </footer>
    )
}

export { Footer as MarketplaceFooter }
export default Footer
