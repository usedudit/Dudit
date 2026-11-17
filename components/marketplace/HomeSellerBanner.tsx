"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import Button from "../reusable/Button"

export function HomeSellerBanner() {
    return (
        <section className="w-full relative overflow-hidden rounded-2xl md:rounded-3xl bg-[#09211b] dark:bg-[#061814] border border-[#0e3b2e] shadow-sm my-4">
            {/* ─── Padrão de arcos arredondados estilo Enjoei no rodapé (com o verde da Dudit) ─── */}
            <div className="absolute -bottom-1 left-0 right-0 h-20 sm:h-24 md:h-28 overflow-hidden pointer-events-none select-none opacity-25 dark:opacity-20 z-0">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="dudit-banner-loops" width="80" height="120" patternUnits="userSpaceOnUse">
                            <path
                                d="M 20 120 V 40 A 20 20 0 0 1 60 40 V 120"
                                fill="none"
                                stroke="#79c325"
                                strokeWidth="18"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#dudit-banner-loops)" />
                </svg>
            </div>

            {/* Linhas circulares sutis no background inspiradas na marca Dudit */}
            <div className="absolute inset-0 pointer-events-none opacity-10 flex items-center justify-center overflow-hidden z-0">
                <svg viewBox="0 0 800 400" className="w-[1200px] h-[600px] text-white" fill="none" stroke="currentColor">
                    <circle cx="400" cy="200" r="140" strokeWidth="1" />
                    <circle cx="400" cy="200" r="230" strokeWidth="1" />
                    <circle cx="400" cy="200" r="320" strokeWidth="1" />
                    <circle cx="400" cy="200" r="410" strokeWidth="1" />
                </svg>
            </div>

            {/* Conteúdo do Banner */}
            <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-10 lg:px-14 lg:py-12 flex flex-col md:flex-row items-center md:items-end justify-between gap-6 md:gap-8">
                {/* Lado Esquerdo: Título, textos e ações (no formato Enjoei) */}
                <div className="w-full md:flex-1 max-w-2xl text-left">
                    <span className="text-[11px] sm:text-xs font-black tracking-wider uppercase text-[#79c325] mb-2 inline-block">
                        Para profissionais e lojistas
                    </span>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-black uppercase tracking-tight text-white leading-[1.1] mb-3 sm:mb-4">
                        Pronto para vender na sua cidade e em todo o Brasil?
                    </h2>
                    <p className="text-xs sm:text-sm md:text-base text-gray-200 dark:text-gray-300 font-medium leading-relaxed mb-6 sm:mb-8 max-w-xl">
                        Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda sem comissão. Tudo o que seu negócio precisa para crescer.
                    </p>

                    {/* Botões no lugar dos badges de Play Store / App Store */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <Link href="/auth/login?mode=partner">
                            <Button
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm sm:text-base font-bold shadow-md hover:shadow-lg transition-all"
                            >
                                Começar grátis
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Link href="/institucional/planos">
                            <Button
                                variant="link"
                                className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm text-gray-300 hover:text-white underline underline-offset-4 decoration-gray-400"
                            >
                                Ver planos e como funciona
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Lado Direito: Dino mascote posicionado no canto inferior direito (onde ficavam os celulares) */}
                <div className="relative shrink-0 flex items-end justify-center self-center md:self-end mt-2 md:mt-0 w-[190px] sm:w-[230px] md:w-[250px] lg:w-[290px]">
                    <img
                        src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                        alt="Dino vendedor Dudit"
                        className="w-full h-auto object-contain select-none drop-shadow-2xl translate-y-2 md:translate-y-4 pointer-events-none"
                        loading="lazy"
                        onError={(e) => {
                            const target = e.currentTarget
                            if (!target.src.includes("Carousel1.png")) {
                                target.src = "https://img.dudit.com.br/static/mascots/Carousel1.png"
                            }
                        }}
                    />
                </div>
            </div>
        </section>
    )
}
