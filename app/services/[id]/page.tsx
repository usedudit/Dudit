"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useSupabase } from "@/providers/supabase-provider"

// Importação estática (Leve, carregamento imediato)
import AuthView from "@/components/auth/AuthView"

// Importações Dinâmicas (Code Splitting - Só carrega se precisar)
const PartnerVisuals = dynamic(
  () => import("@/components/auth/PartnerVisuals").then(mod => mod.PartnerVisuals),
  { ssr: false }
)
const PartnerWizard = dynamic(
  () => import("@/components/auth/PartnerWizard").then(mod => mod.PartnerWizard),
  { ssr: false }
)

type PageMode = "auth" | "partner"
type AuthMode = "login" | "signup" | "verify-email" | "forgot-password"

function AuthContent() {
  const { user } = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasCheckedUser = useRef(false)

  // Estado para controlar se o usuário já está logado
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false)

  const rawModeParam = searchParams.get("mode")
  const verifiedParam = searchParams.get("verified")

  // Estado principal de navegação
  const [pageMode, setPageMode] = useState<PageMode>(() => {
    if (verifiedParam === "true" && rawModeParam === "partner") {
      // Direct redirect to ERP handled in useEffect to avoid render-phase navigation
      return "partner"
    }
    if (rawModeParam === "partner") return "partner"
    return "auth"
  })

  // Handle direct redirection for verified partners
  useEffect(() => {
    if (verifiedParam === "true" && rawModeParam === "partner") {
      router.push("/erp/inicio")
    }
  }, [verifiedParam, rawModeParam, router])

  // Checa sessão do usuário ao carregar
  useEffect(() => {
    if (user) {
      setIsUserLoggedIn(true)
    }
  }, [user])

  // Força tema light no modo parceiro
  useEffect(() => {
    if (pageMode === "partner") {
      document.documentElement.classList.remove("dark")
      document.documentElement.setAttribute("data-theme", "light")
    }
  }, [pageMode])

  // Layout específico do Modo Parceiro (VISUAL ORIGINAL MANTIDO)
  const PartnerLayout = () => (
    <div className="flex h-screen w-full bg-[#022C2B] p-4 md:p-6 items-stretch overflow-hidden font-sans relative">
      <div className="absolute inset-0 opacity-5 pointer-events-none" />

      {/* Esquerda: Formulário / Wizard */}
      <div className="w-full lg:w-[45%] xl:w-[40%] bg-white rounded-2xl flex flex-col p-6 overflow-hidden z-20 shadow-2xl relative">
        <div className="flex justify-between items-center mb-4 px-2 shrink-0">
          <Link href="/" prefetch={false}>
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={90}
              height={28}
              className="h-7 w-auto"
            />
          </Link>
          <button
            onClick={() => setPageMode("auth")}
            className="text-xs font-semibold text-brand-dark hover:text-brand-green transition-colors"
          >
            Já tem conta? Entrar
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center overflow-y-auto scrollbar-hide px-2">
          <div className="w-full max-w-md mx-auto">
            <PartnerWizard
              onBack={() => setPageMode("auth")}
              isUserLoggedIn={isUserLoggedIn}
            />
          </div>
        </div>

        {/* Footer Mobile */}
        <div className="lg:hidden mt-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Dudit Inc.{" "}
          <Link href="/institucional/termos" prefetch={false} className="hover:underline ml-2">Termos</Link>{" "}
          &bull;{" "}
          <Link href="/institucional/privacidade" prefetch={false} className="hover:underline">Privacidade</Link>
        </div>
      </div>

      {/* Direita: Visuais Decorativos (Carregado dinamicamente) */}
      <PartnerVisuals />
    </div>
  )

  const emailParam = searchParams.get("email") || ""

  return (
    <AnimatePresence mode="wait">
      {pageMode === "auth" ? (
        <motion.div
          key="auth-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="w-full h-full"
        >
          <AuthView
            initialMode={rawModeParam === "verify-email" ? "verify-email" : "login"}
            email={emailParam}
            onSwitchToPartner={() => setPageMode("partner")}
          />
        </motion.div>
      ) : (
        <motion.div
          key="partner-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="w-full h-full"
        >
          <PartnerLayout />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Wrapper com Suspense para evitar erro de useSearchParams no build
export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-gray" />}>
      <AuthContent />
    </Suspense>
  )
}
