"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"

const BlobTeal = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      fill="#0E3A39"
      d="M47.4,-61.3C59.3,-52.2,65.6,-35.5,68.8,-18.5C72,1.5,72,21.9,63.3,37.1C54.6,52.3,37.2,62.4,18.5,67.8C-0.2,73.2,-20.2,74,-37.3,66.2C-54.4,58.4,-68.5,41.9,-73.6,23.1C-78.7,4.2,-74.8,-17.1,-64,-33.1C-53.2,-49.1,-35.5,-59.9,-18.3,-65.6C1,-71.3,35.5,-70.4,47.4,-61.3Z"
      transform="translate(100 100)"
    />
  </svg>
)

const BlobGreenAccent = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      fill="#09211b"
      d="M38.9,-50.2C52.3,-41.3,66.2,-31.3,70.3,-17.9C74.4,-4.5,68.7,12.3,59.8,26.2C50.9,40,38.8,51,24.5,58.3C10.2,65.6,-6.3,69.2,-22.1,65.2C-37.9,61.2,-53,49.6,-61.3,34.5C-69.6,19.4,-71.1,0.8,-66.1,-15.8C-61.1,-32.4,-49.6,-47,-36,-55.9C-22.4,-64.8,-6.7,-68,8.2,-66.8C23.1,-65.6,25.5,-59.1,38.9,-50.2Z"
      transform="translate(100 100)"
    />
  </svg>
)

const BlobGreenLight = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      fill="#166534"
      d="M54.2,-65.1C68.1,-55.3,75.9,-37.2,76.6,-19.4C77.3,-1.6,70.9,15.9,61.1,30.1C51.3,44.3,38.1,55.2,23,61.8C7.9,68.4,-9.1,70.7,-25.2,66C-41.3,61.3,-56.5,49.6,-65.1,34.3C-73.7,19,-75.7,0,-70.7,-16.9C-65.7,-33.8,-53.7,-48.6,-39.4,-58.4C-25.1,-68.2,-8.6,-73,9.3,-73.8C27.2,-74.6,40.3,-74.9,54.2,-65.1Z"
      transform="translate(100 100)"
    />
  </svg>
)

export interface StepVisualData {
  title: string
  subtitle: string
  image: string
}

const VISUALS_BY_MODE: Record<string, Record<number, StepVisualData>> = {
  desapego: {
    1: {
      title: "Anuncie seus produtos e serviços",
      subtitle: "A Dudit organiza seus itens para você anunciar com seu link próprio e negociar no WhatsApp.",
      image: "https://img.dudit.com.br/static/mascots/Segmentos.png",
    },
    2: {
      title: "Seu primeiro cadastro",
      subtitle: "Cadastre com nome e valor para começar a divulgar e combinar vendas com segurança.",
      image: "https://img.dudit.com.br/static/mascots/Produtos.png",
    },
    3: {
      title: "Pronto para divulgar!",
      subtitle: "Seu link exclusivo já pode ser compartilhado com interessados e grupos do WhatsApp.",
      image: "https://img.dudit.com.br/static/mascots/HappyDino.png",
    },
  },
  erp: {
    1: {
      title: "Gestão completa do negócio",
      subtitle: "PDV no balcão, controle de estoque, financeiro e equipe integrados em um só lugar.",
      image: "https://img.dudit.com.br/static/mascots/Gestao.png",
    },
    2: {
      title: "Cadastre seu primeiro item",
      subtitle: "Cadastre seus itens comerciais para abastecer o estoque e iniciar vendas no balcão.",
      image: "https://img.dudit.com.br/static/mascots/Servicos.png",
    },
    3: {
      title: "Que ótimo, seu sistema está configurado!",
      subtitle: "Tudo pronto para operar o balcão, acompanhar relatórios e gerenciar seu negócio.",
      image: "https://img.dudit.com.br/static/mascots/HappyDino.png",
    },
  },
  quick: {
    1: {
      title: "Seu negócio do seu jeito",
      subtitle: "A Dudit organiza sua vitrine e catálogo sem complicação ou telas que você não vai usar.",
      image: "https://img.dudit.com.br/static/mascots/Gestao.png",
    },
    2: {
      title: "Seu catálogo em 30 segundos",
      subtitle: "Cadastre com nome e preço direto ao ponto para começar a divulgar para seus clientes.",
      image: "https://img.dudit.com.br/static/mascots/Segmentos.png",
    },
    3: {
      title: "Parabéns, está tudo pronto!",
      subtitle: "Seu link exclusivo já pode ser compartilhado com seus clientes pelo WhatsApp.",
      image: "https://img.dudit.com.br/static/mascots/HappyDino.png",
    },
  },
}

export const ERPOnboardingVisuals = React.memo(({
  currentStep,
  totalSteps = 3,
  businessMode = "quick",
}: {
  currentStep: number
  totalSteps?: number
  businessMode?: "desapego" | "quick" | "showcase" | "erp"
}) => {
  const modeKey = businessMode === "desapego" ? "desapego" : (businessMode === "erp" ? "erp" : "quick")
  const modeVisuals = VISUALS_BY_MODE[modeKey] || VISUALS_BY_MODE.quick
  const visual = modeVisuals[currentStep] || modeVisuals[1]

  const variants = {
    enter: { x: 30, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -30, opacity: 0 },
  }

  return (
    <div className="flex-1 relative hidden lg:flex flex-col justify-center items-center p-8 overflow-hidden bg-brand-dark rounded-2xl">
      {/* Conteúdo Principal */}
      <div className="relative z-10 w-full max-w-[420px] flex flex-col items-center">
        {/* Imagem do mascote Dino */}
        <div className="relative w-full h-[240px] mb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep + "-visual"}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <img
                src={visual.image}
                alt={visual.title}
                className="h-full w-full object-contain drop-shadow-2xl"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Texto explicativo */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep + "-text"}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
            className="text-center px-4"
          >
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {visual.title}
            </h3>
            <p className="text-green-100/75 text-sm leading-relaxed font-light">
              {visual.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Indicador de passos */}
        <div className="flex items-center gap-2 mt-6">
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const s = idx + 1
            return (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${s === currentStep
                  ? "w-8 bg-brand-green"
                  : s < currentStep
                    ? "w-2 bg-brand-green/50"
                    : "w-2 bg-white/20"
                  }`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
})

ERPOnboardingVisuals.displayName = "ERPOnboardingVisuals"
