"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"

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
      fill="#022C2B"
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

const slides = [
  {
    title: "Tudo no lugar, do seu jeito",
    subtitle: "Dê tchau para a bagunça. Gerencie produtos, serviços e pedidos em um só lugar, sem complicação.",
    image: "/images/dino-gerente.png", // Dino com Crachá
  },
  {
    title: "O controle total na sua mão",
    subtitle: "Saiba quanto vendeu e o que tem no estoque em segundos. Chega de quebrar a cabeça com contas.",
    image: "/images/dino-sucesso.png", // Dino com Joinha
  },
  {
    title: "Sua loja na vitrine do bairro",
    subtitle: "Seus vizinhos vão te achar online! Venda na Vitrine da Dudit com taxa zero e comissão zero.",
    image: "/images/dino-vitrine.png", // Dino Acenando
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export const PartnerVisuals = React.memo(() => {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1)
      setCurrent((prev) => (prev + 1) % slides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const goTo = (index: number) => {
    setDirection(index > current ? 1 : -1)
    setCurrent(index)
  }

  const slide = slides[current]

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
  }

  return (
    <div className="flex-1 relative hidden lg:flex flex-col justify-center items-center p-12 overflow-hidden">

      {/* ── Blob shapes decorativas (substituindo o quadrado) ── */}

      {/* Blob grande - topo direita */}
      <BlobTeal className="absolute -top-20 -right-20 w-[420px] h-[420px] opacity-90 pointer-events-none" />

      {/* Blob médio - meio esquerda */}
      <BlobGreenAccent className="absolute top-1/3 -left-24 w-[280px] h-[280px] opacity-60 pointer-events-none" />

      {/* Blob pequeno - baixo centro */}
      <BlobGreenLight className="absolute -bottom-16 left-1/3 w-[200px] h-[200px] opacity-40 pointer-events-none" />

      {/* ── Conteúdo principal ── */}
      <div className="relative z-10 w-full max-w-[500px] flex flex-col items-center">

        {/* Imagem do slide */}
        <div className="relative w-full h-[260px] mb-8">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={current + "-visual"}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <img
                src={slide.image}
                alt={slide.title}
                className="h-full w-full object-contain drop-shadow-2xl"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Texto */}
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={current + "-text"}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
            className="text-center px-2"
          >
            <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
              {slide.title}
            </h2>
            <p className="text-green-100/70 text-base leading-relaxed font-light">
              {slide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Dots */}
        <div className="flex items-center gap-3 mt-8">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="relative flex items-center justify-center focus:outline-none"
              aria-label={`Ir para slide ${i + 1}`}
            >
              <motion.div
                animate={{
                  width: i === current ? 24 : 8,
                  opacity: i === current ? 1 : 0.4,
                }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="h-2 rounded-full bg-green-400"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 right-8 text-white/40 text-[11px]">
        © {new Date().getFullYear()} Dudit Inc.{" "}
        <Link href="/terms" prefetch={false} className="hover:text-white ml-2">
          Termos
        </Link>{" "}
        &bull;{" "}
        <Link href="/privacy" prefetch={false} className="hover:text-white">
          Privacidade
        </Link>
      </div>
    </div>
  )
})

PartnerVisuals.displayName = "PartnerVisuals"