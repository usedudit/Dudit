"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function HomeSellerBanner() {
    return (
        <section className="w-full relative overflow-hidden rounded-2xl lg:rounded-3xl bg-[#b7eb38] dark:bg-[#0c2e27] border border-[#a2dd26] dark:border-dark-border shadow-xs my-2">
            {/* Linhas circulares sutis no background inspiradas no banner da Dudit */}
            <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10 flex items-center justify-center overflow-hidden">
                <svg viewBox="0 0 800 400" className="w-[1200px] h-[600px] text-[#09211b] dark:text-white" fill="none" stroke="currentColor">
                    <circle cx="400" cy="200" r="140" strokeWidth="1" />
                    <circle cx="400" cy="200" r="230" strokeWidth="1" />
                    <circle cx="400" cy="200" r="320" strokeWidth="1" />
                    <circle cx="400" cy="200" r="410" strokeWidth="1" />
                </svg>
            </div>

            <div className="relative z-10 px-5 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-7 flex flex-col md:flex-row items-center md:items-center justify-between gap-5 lg:gap-8">
                {/* Lado Esquerdo: Dino + Textos */}
                <div className="flex items-center gap-4 sm:gap-6 w-full md:w-auto flex-1">
                    {/* Imagem do Dino */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-white/70 dark:bg-white/10 p-2 flex items-center justify-center shrink-0 border border-white/60 dark:border-white/10 shadow-xs">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                            alt="Dino Dudit"
                            className="w-full h-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/images/dino-cavalete.png"
                            }}
                        />
                    </div>

                    {/* Textos */}
                    <div className="min-w-0 flex-1">
                        <span className="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-[#1c4d12] dark:text-[#a0de24] mb-1 inline-block">
                            Para profissionais e vendedores
                        </span>
                        <h3 className="text-base sm:text-xl lg:text-2xl font-extrabold text-[#09211b] dark:text-white leading-snug">
                            Pronto para vender na sua cidade e em todo o Brasil?
                        </h3>
                        <p className="text-xs sm:text-sm text-[#1c4d12]/90 dark:text-gray-300 font-medium leading-relaxed mt-1 max-w-2xl line-clamp-2 sm:line-clamp-none">
                            Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda sem comissão.
                        </p>
                    </div>
                </div>

                {/* Lado Direito: Botão CTA + Link de Planos */}
                <div className="flex flex-col items-center md:items-end w-full md:w-auto shrink-0 pt-2 md:pt-0">
                    <Link
                        href="/auth/login?mode=partner"
                        className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#09211b] hover:bg-[#09211b]/90 text-white dark:bg-[#79c325] dark:text-[#09211b] dark:hover:bg-[#8ee024] font-bold text-sm shadow-sm transition-all whitespace-nowrap group"
                    >
                        <span>Começar grátis</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link
                        href="/institucional/planos"
                        className="text-xs font-semibold text-[#1c4d12] dark:text-[#a0de24] hover:underline text-center md:text-right mt-2"
                    >
                        Ver planos e como funciona
                    </Link>
                </div>
            </div>
        </section>
    )
}
