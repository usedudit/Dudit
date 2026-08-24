"use client"

import React, { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { LockIcon, CheckCircleIcon, AlertCircleIcon, ArrowRightIcon } from "@/lib/icons"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { getPasswordRecoveryClient } from "@/lib/supabase/password-recovery-client"
import { Button, PasswordInput, PasswordStrengthMeter, InfoCard, Spinner } from "@/components/reusable"
import { calculatePasswordScore } from "@/lib/utils"
import { getErrorMessage } from "@/lib/utils/error-handlers"

// Background com ondas no padrão da Dudit
const WavesBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <img
            src="https://img.dudit.com.br/static/banners/WavesPattern.png"
            alt=""
            className="w-full h-full object-cover opacity-20"
        />
    </div>
))
WavesBackground.displayName = "WavesBackground"

type PageStatus = "checking" | "form" | "success" | "error"

function UpdatePasswordContent() {
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<PageStatus>("checking")
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [formError, setFormError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [countdown, setCountdown] = useState(3)
    const [activeAuthClient, setActiveAuthClient] = useState<any>(null)

    useEffect(() => {
        let isMounted = true
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null
        const recoveryClient = getPasswordRecoveryClient()

        const setRecoveryForm = (client: any) => {
            if (!isMounted) return
            setActiveAuthClient(client)
            setStatus("form")
        }

        // Register before initialization so PASSWORD_RECOVERY cannot be lost
        // while the client parses the implicit-flow hash.
        const { data: { subscription } } = recoveryClient.auth.onAuthStateChange((event: any, session: any) => {
            if (!isMounted) return
            if (event === "PASSWORD_RECOVERY" && session) {
                setRecoveryForm(recoveryClient)
            }
        })

        const checkRecoveryStatus = async () => {
            // 1. Verifica erros na URL (Query Params)
            const queryError = searchParams.get("error")
            const queryErrorCode = searchParams.get("error_code")
            const queryErrorDesc = searchParams.get("error_description")

            if (queryError || queryErrorCode || queryErrorDesc) {
                const raw = queryErrorDesc || queryErrorCode || queryError || "Link de recuperação inválido ou expirado."
                const message = getErrorMessage(decodeURIComponent(raw.replace(/\+/g, " ")))
                if (isMounted) {
                    setErrorMessage(message)
                    setStatus("error")
                }
                return
            }

            // 2. Verifica erros no Hash Fragment (Ex: Supabase #error=access_denied&error_code=otp_expired&...)
            if (typeof window !== "undefined" && window.location.hash) {
                const hashParams = new URLSearchParams(window.location.hash.slice(1))
                if (hashParams.has("error")) {
                    const rawDesc = hashParams.get("error_description") || hashParams.get("error_code") || "Link expirado ou inválido"
                    const message = getErrorMessage(rawDesc)
                    if (isMounted) {
                        setErrorMessage(message)
                        setStatus("error")
                    }
                    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
                    return
                }
            }

            // 3. Verifica fluxo PKCE via código na URL (?code=...)
            const code = searchParams.get("code")
            if (code) {
                try {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
                    if (error) {
                        if (isMounted) {
                            setErrorMessage(getErrorMessage(error))
                            setStatus("error")
                        }
                        return
                    }
                    if (data?.session && isMounted) {
                        // Legacy PKCE links are accepted only when an explicit
                        // code was supplied. Never fall back to an arbitrary
                        // session already present in the normal client.
                        setRecoveryForm(supabase)
                        window.history.replaceState(null, "", window.location.pathname)
                        return
                    }
                } catch (e: any) {
                    if (isMounted) {
                        setErrorMessage(getErrorMessage(e))
                        setStatus("error")
                    }
                    return
                }
            }

            // 4. Only the isolated recovery client can authorize this form.
            // A normal logged-in session must never unlock password recovery.
            try {
                const { data: { session }, error } = await recoveryClient.auth.getSession()
                if (error) throw error
                if (session && isMounted) {
                    setRecoveryForm(recoveryClient)
                    return
                }
            } catch (error: any) {
                if (isMounted && error) {
                    setErrorMessage(getErrorMessage(error))
                }
            }

            // Timeout de fallback: se nenhum recovery session foi identificado
            fallbackTimer = setTimeout(() => {
                if (isMounted) {
                    recoveryClient.auth.getSession().then(({ data, error }: any) => {
                        if (!isMounted) return
                        if (data?.session && !error) {
                            setRecoveryForm(recoveryClient)
                        } else {
                            if (error) setErrorMessage(getErrorMessage(error))
                            else setErrorMessage("Nenhum link de recuperação válido foi encontrado. Solicite um novo link para redefinir sua senha.")
                            setStatus("error")
                        }
                    })
                }
            }, 2500)

        }

        void checkRecoveryStatus()

        return () => {
            isMounted = false
            subscription.unsubscribe()
            if (fallbackTimer) clearTimeout(fallbackTimer)
        }
    }, [searchParams])

    // Countdown para redirecionamento após sucesso
    useEffect(() => {
        if (status !== "success") return

        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval)
                    window.location.assign("/auth/login")
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [status])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setFormError(null)

        if (!password || password.length < 8) {
            setFormError("A nova senha deve ter pelo menos 8 caracteres.")
            return
        }

        if (calculatePasswordScore(password) < 2) {
            setFormError("A nova senha deve ter força Média ou Forte.")
            return
        }

        if (password !== confirmPassword) {
            setFormError("As senhas não coincidem. Verifique e tente novamente.")
            return
        }

        setIsLoading(true)

        try {
            if (!activeAuthClient) {
                throw new Error("Nenhuma sessão de recuperação válida foi encontrada. Solicite um novo link.")
            }

            const { error } = await activeAuthClient.auth.updateUser({ password })
            if (error) throw error

            // A recovery session is single-purpose. It must not become a
            // normal logged-in session after the password change.
            await activeAuthClient.auth.signOut({ scope: "local" })
            setStatus("success")
        } catch (err: any) {
            setFormError(getErrorMessage(err))
        } finally {
            setIsLoading(false)
        }
    }

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
    }

    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray dark:bg-dark-background transition-colors duration-300">
            {/* HEADER */}
            <header className="w-full bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px] flex justify-between items-center h-full">
                    <Link href="/" prefetch={false} className="shrink-0 cursor-pointer">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={110}
                            height={32}
                            className="h-8 w-auto"
                        />
                    </Link>
                    <nav>
                        <Link href="/auth/login" prefetch={false}>
                            <Button variant="outline" className="h-10 px-5 text-sm font-medium">
                                Fazer Login
                            </Button>
                        </Link>
                    </nav>
                </div>
            </header>

            {/* MAIN */}
            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#003229] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <WavesBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[60px] pb-12 z-10 px-4">
                    <AnimatePresence mode="wait">
                        {/* 1. CHECKING STATE */}
                        {status === "checking" && (
                            <motion.div
                                key="checking"
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-4"
                            >
                                <div className="h-16 w-16 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center animate-pulse">
                                    <LockIcon size={32} />
                                </div>
                                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    Validando link de segurança...
                                </h2>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                    Aguarde um instante enquanto verificamos suas credenciais.
                                </p>
                                <div className="pt-2">
                                    <Spinner size={24} color="green" />
                                </div>
                            </motion.div>
                        )}

                        {/* 2. ERROR STATE (Expired or Invalid link) */}
                        {status === "error" && (
                            <motion.div
                                key="error"
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-8 md:p-10 flex flex-col items-center text-center space-y-6"
                            >
                                <div className="h-20 w-20 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                                    <AlertCircleIcon size={40} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                        Link expirado ou inválido
                                    </h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm max-w-sm mx-auto">
                                        {errorMessage || "Este link de recuperação expirou ou já foi utilizado. Por segurança, solicite um novo link de redefinição."}
                                    </p>
                                </div>

                                <div className="w-full space-y-3 pt-2">
                                    <Button
                                        onClick={() => window.location.assign("/auth/login?mode=forgot-password")}
                                        className="w-full h-[46px] font-semibold"
                                    >
                                        Solicitar novo link de recuperação
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => window.location.assign("/auth/login")}
                                        className="w-full h-[44px]"
                                    >
                                        Voltar para o Login
                                    </Button>
                                </div>

                                <div className="pt-4 border-t border-gray-100 dark:border-dark-border w-full text-center">
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Precisa de ajuda? <a href="mailto:contato@dudit.com.br" className="text-brand-green font-bold hover:underline">Fale com o suporte</a>
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* 3. FORM STATE (Active recovery session) */}
                        {status === "form" && (
                            <motion.div
                                key="form"
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[520px] p-8 md:p-10"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="h-12 w-12 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center shrink-0">
                                        <LockIcon size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                            Criar Nova Senha
                                        </h2>
                                        <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                                            Defina uma senha segura para acessar sua conta.
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="space-y-1">
                                        <PasswordInput
                                            name="password"
                                            label="Nova senha"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            placeholder="Digite sua nova senha"
                                            autoComplete="new-password"
                                        />
                                        <PasswordStrengthMeter password={password} />
                                    </div>

                                    <div>
                                        <PasswordInput
                                            name="confirmPassword"
                                            label="Confirmar nova senha"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            placeholder="Repita a nova senha"
                                            autoComplete="new-password"
                                        />
                                    </div>

                                    {formError && <InfoCard message={formError} color="red" />}

                                    <Button
                                        type="submit"
                                        disabled={isLoading || !password || !confirmPassword}
                                        className="w-full h-[46px] text-[15px] font-bold mt-4"
                                    >
                                        {isLoading ? <Spinner size={20} color="white" /> : "Salvar nova senha"}
                                    </Button>
                                </form>

                                <div className="mt-8 pt-6 border-t border-brand-border text-center">
                                    <Link
                                        href="/auth/login"
                                        prefetch={false}
                                        className="text-sm text-brand-inactive-text dark:text-dark-body hover:text-brand-green font-medium"
                                    >
                                        ← Cancelar e voltar para o Login
                                    </Link>
                                </div>
                            </motion.div>
                        )}

                        {/* 4. SUCCESS STATE */}
                        {status === "success" && (
                            <motion.div
                                key="success"
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-6"
                            >
                                <div className="h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                                    <CheckCircleIcon size={40} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                        Senha alterada com sucesso!
                                    </h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm max-w-sm">
                                        Sua senha foi redefinida com segurança. Por segurança, você será redirecionado para o login em <strong>{countdown}</strong> segundo{countdown === 1 ? "" : "s"}.
                                    </p>
                                </div>

                                <Button
                                    onClick={() => window.location.assign("/auth/login")}
                                    className="w-full h-[46px] font-semibold flex items-center justify-center gap-2"
                                >
                                    <span>Ir para o Login</span>
                                    <ArrowRightIcon size={18} />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    )
}

export default function UpdatePasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-brand-gray dark:bg-dark-background" />}>
            <UpdatePasswordContent />
        </Suspense>
    )
}
