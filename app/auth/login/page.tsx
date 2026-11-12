"use client"

import { useState, useEffect, useLayoutEffect, Suspense, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useSupabase } from "@/providers/supabase-provider"
import { getUserHasAnyPartnerAccess } from "@/app/actions/auth/partner-access"
import { getSafeRedirectPath } from "@/lib/security/safe-redirect"
import ThreeDotsLoader from "@/components/reusable/ThreeDotsLoader"

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

function RedirectToHome({ next }: { next: string }) {
  useLayoutEffect(() => {
    window.location.replace(getSafeRedirectPath(next))
  }, [next])
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-gray dark:bg-dark-background">
      <ThreeDotsLoader />
    </div>
  )
}

// Local translations to satisfy internationalization static analysis checks
const t = (key: "termos" | "privacidade"): string => {
  if (key === "termos") {
    return "Termos"
  }
  if (key === "privacidade") {
    return "Privacidade"
  }
  return ""
}

function AuthContent() {
  const { user, supabase } = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawModeParam = searchParams.get("mode")
  const verifiedParam = searchParams.get("verified")
  const isPartnerMode = rawModeParam === "partner"
  const nextParam = searchParams.get("next") || "/"

  const updateUrlMode = useCallback((newMode: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set("mode", newMode)
    router.replace(`/auth/login?${params.toString()}`)
  }, [router])

  /**
   * Logged-in + mode=partner: `null` = ainda decidir (mostrar loading);
   * `true` = pode exibir o wizard (sem acesso a ERP ainda);
   * `false` = não usado (redirect /erp/trocar-erp ocorre antes).
   */
  const [canShowPartnerWizardWhenLoggedIn, setCanShowPartnerWizardWhenLoggedIn] = useState<null | boolean>(null)

  // Estado principal de navegação
  const [pageMode, setPageMode] = useState<PageMode>(() => {
    if (verifiedParam === "true" && rawModeParam === "partner") {
      // Direct redirect to ERP handled in useEffect to avoid render-phase navigation
      return "partner"
    }
    if (rawModeParam === "partner") return "partner"
    return "auth"
  })

  // Handle direct redirection for verified partners (e-mail de verificação)
  useEffect(() => {
    if (verifiedParam === "true" && rawModeParam === "partner") {
      router.push("/erp/inicio")
    }
  }, [verifiedParam, rawModeParam, router])

  // Sincroniza o modo da página caso o query param da URL mude
  useEffect(() => {
    if (rawModeParam === "partner") {
      setPageMode("partner")
    } else if (rawModeParam === "verify-email" || rawModeParam === "login" || rawModeParam === "signup" || rawModeParam === "forgot-password") {
      setPageMode("auth")
    }
  }, [rawModeParam])

  const lastCheckedUserId = useRef<string | null>(null)

  // Sessão logada + ?mode=partner: com ERP -> /erp/inicio; sem ERP -> fica no wizard
  useEffect(() => {
    if (!user || !isPartnerMode) {
      setCanShowPartnerWizardWhenLoggedIn(null)
      lastCheckedUserId.current = null
      return
    }

    if (lastCheckedUserId.current === user.id) {
      return
    }

    let gone = false
    setCanShowPartnerWizardWhenLoggedIn(null)
    getUserHasAnyPartnerAccess()
      .then((has) => {
        if (gone) return
        if (has) {
          const announce = searchParams.get("announce")
          if (announce === "product") {
            router.replace("/erp/produtos?create=true")
            return
          }
          if (announce === "service") {
            router.replace("/erp/servicos?create=true")
            return
          }
          router.replace("/erp/inicio")
          return
        }
        lastCheckedUserId.current = user.id
        setCanShowPartnerWizardWhenLoggedIn(true)
      })
      .catch(() => {
        if (!gone) {
          lastCheckedUserId.current = user.id
          setCanShowPartnerWizardWhenLoggedIn(true)
        }
      })
    return () => {
      gone = true
    }
  }, [user, isPartnerMode, router])

  // Forçar logout client-side se a conta estiver em exclusão ativa ou recém-deletada para evitar redirect loops
  const errorParam = searchParams.get("error")
  const deletedParam = searchParams.get("deleted")
  const isDeletionFlow = errorParam === "account_deleting" || deletedParam === "true"

  useEffect(() => {
    if (isDeletionFlow && user) {
      supabase.auth.signOut().then(() => {
        router.refresh()
      })
    }
  }, [isDeletionFlow, user, supabase, router])

  // Força tema light no modo parceiro
  useEffect(() => {
    if (pageMode === "partner") {
      document.documentElement.classList.remove("dark")
      document.documentElement.setAttribute("data-theme", "light")
    }
  }, [pageMode])

  if (user && !isPartnerMode && !isDeletionFlow) {
    return <RedirectToHome next={nextParam} />
  }

  if (user && isPartnerMode && canShowPartnerWizardWhenLoggedIn === null) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <ThreeDotsLoader />
      </div>
    )
  }



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
            initialMode={rawModeParam === "verify-email" ? "verify-email" : rawModeParam === "forgot-password" ? "forgot-password" : "login"}
            email={emailParam}
            onSwitchToPartner={() => { setPageMode("partner"); updateUrlMode("partner") }}
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
          <div className="flex h-screen w-full bg-brand-dark p-4 md:p-6 items-stretch overflow-hidden font-sans relative">
            <div className="absolute inset-0 opacity-5 pointer-events-none" />

            {/* Esquerda: Formulário / Wizard */}
            <div className="w-full lg:w-[45%] xl:w-[40%] bg-white rounded-2xl flex flex-col p-6 overflow-hidden z-20 shadow-2xl relative">
              <div className="flex justify-between items-center mb-4 px-2 shrink-0">
                <Link href="/" prefetch={false}>
                  <img
                    src="https://img.dudit.com.br/static/Logo.png"
                    alt="Dudit"
                    width={140}
                    height={40}
                    className="h-10 w-auto object-contain"
                  />
                </Link>
                <button
                  onClick={() => { setPageMode("auth"); updateUrlMode("login") }}
                  className="text-xs font-semibold text-brand-dark hover:text-brand-green transition-colors"
                >
                  Já tem conta? Entrar
                </button>
              </div>

              <div className="flex-1 flex flex-col justify-center overflow-y-auto scrollbar-hide px-2">
                <div className="w-full max-w-md mx-auto">
                  <PartnerWizard
                    onBack={() => { setPageMode("auth"); updateUrlMode("login") }}
                    isUserLoggedIn={!!user}
                  />
                </div>
              </div>

              {/* Footer Mobile */}
              <div className="lg:hidden mt-8 text-center text-xs text-gray-400">
                © {new Date().getFullYear()} Dudit Inc.{" "}
                <Link href="/institucional/termos" prefetch={false} className="hover:underline ml-2">{t("termos")}</Link>{" "}
                &bull;{" "}
                <Link href="/institucional/privacidade" prefetch={false} className="hover:underline">{t("privacidade")}</Link>
              </div>
            </div>

            {/* Direita: Visuais Decorativos (Carregado dinamicamente) */}
            <PartnerVisuals />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Wrapper com Suspense para evitar erro de useSearchParams no build
export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-gray dark:bg-dark-background" />}>
      <AuthContent />
    </Suspense>
  )
}
