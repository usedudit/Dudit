"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { MailIcon } from "@/lib/icons"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { generateNameFromEmail, getEmailProvider } from "@/lib/utils"
import { Button, EmailInput, PasswordInput, PasswordStrengthMeter, Checkbox, InfoCard, Spinner, Turnstile, type TurnstileRef } from "@/components/reusable"
import { SupportModal } from "@/components/support/SupportModal"
import { calculatePasswordScore } from "@/lib/utils"
import { getErrorMessage } from "@/lib/utils/error-handlers"
import { preCheckLogin, handleLoginResult } from "@/app/actions/auth/lockout"
import { recordLegalConsent } from "@/app/actions/auth/legal-consent"
import { CURRENT_LEGAL_DOCUMENTS } from "@/lib/legal/constants"
import { getPasswordRecoveryClient } from "@/lib/supabase/password-recovery-client"

// Types
type AuthMode = "login" | "signup" | "verify-email" | "forgot-password"

// Só aceita caminhos internos para evitar open-redirect
function getSafeNext(rawNext: string | null): string {
    if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")) {
        return rawNext
    }
    return "/"
}


// Otimização: Static Background Memoized
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

// --- COMPONENTE PRINCIPAL ---
export default function AuthView({
    initialMode = "login",
    email: initialEmail = "",
    onSwitchToPartner
}: {
    initialMode?: AuthMode,
    email?: string,
    onSwitchToPartner: () => void
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextParam = searchParams.get("next") || "/"
    const [mode, setMode] = useState<AuthMode>(initialMode)
    const [email, setEmail] = useState(initialEmail)
    const [password, setPassword] = useState("")
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
    const turnstileRef = useRef<TurnstileRef>(null)

    // Timer states
    const [resendTimer, setResendTimer] = useState(60)
    const [canResend, setCanResend] = useState(false)
    const [retryCount, setRetryCount] = useState(0)
    const [verifyContext, setVerifyContext] = useState<"signup" | "recovery">("signup")
    const isSubmittingRef = useRef(false)
    const [isSupportOpen, setIsSupportOpen] = useState(false)

    const changeMode = (newMode: AuthMode) => {
        setMode(newMode)
        const params = new URLSearchParams(window.location.search)
        params.set("mode", newMode)
        router.replace(`/auth/login?${params.toString()}`)
    }

    // Limpar token e resetar Turnstile ao mudar de modo
    useEffect(() => {
        setTurnstileToken(null)
        turnstileRef.current?.reset()
    }, [mode])

    // Update mode if initialMode prop changes (e.g. from query params)
    useEffect(() => {
        if (initialMode) {
            setMode(initialMode)
        }
    }, [initialMode])

    useEffect(() => {
        if (initialEmail) {
            setEmail(initialEmail)
        }
    }, [initialEmail])

    // Logic to handle timer decrement
    useEffect(() => {
        let timer: NodeJS.Timeout
        if (mode === "verify-email" && resendTimer > 0) {
            timer = setTimeout(() => setResendTimer(prev => prev - 1), 1000)
        } else if (resendTimer === 0) {
            setCanResend(true)
        }
        return () => {
            if (timer) clearTimeout(timer)
        }
    }, [mode, resendTimer])

    // Logic to handle Supabase Auth implicit flow (hash fragments)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = window.location.hash

            if (hash.includes("error=")) {
                const errorDescriptionMatch = hash.match(/error_description=([^&]+)/)
                const errorDescription = errorDescriptionMatch ? decodeURIComponent(errorDescriptionMatch[1].replace(/\+/g, ' ')) : "Erro na autenticação"
                setError(getErrorMessage(errorDescription))
                window.history.replaceState(null, '', window.location.pathname + window.location.search)
            } else if (hash.includes("access_token=")) {
                setIsLoading(true)
                supabase.auth.getSession().then((res: any) => {
                    const { data, error } = res
                    if (error) {
                        setError(getErrorMessage(error))
                        setIsLoading(false)
                    } else if (data?.session) {
                        window.location.assign(getSafeNext(nextParam))
                    } else {
                        setIsLoading(false)
                    }
                })
            }
        }
    }, [nextParam])

    const handleGoogleAuth = async () => {
        if (isSubmittingRef.current || isLoading) return
        isSubmittingRef.current = true
        setIsLoading(true)
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br")
            await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(getSafeNext(nextParam))}`, queryParams: { access_type: "offline", prompt: "consent" } },
            })
        } catch (e: any) {
            console.error("[AUTH GOOGLE ERROR]", e)
            setError(getErrorMessage(e))
            isSubmittingRef.current = false
            setIsLoading(false)
        }
    }

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSubmittingRef.current || isLoading) return
        isSubmittingRef.current = true
        setIsLoading(true)
        setError(null)

        try {
            const cleanEmail = email.trim().toLowerCase()

            if (mode === "signup") {
                if (calculatePasswordScore(password) < 2) throw new Error("A senha deve ser média ou forte.")

                const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br")
                const { data, error } = await supabase.auth.signUp({
                    email: cleanEmail,
                    password,
                    options: {
                        data: { full_name: generateNameFromEmail(cleanEmail) },
                        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(getSafeNext(nextParam))}`,
                        captchaToken: turnstileToken || undefined,
                    },
                })
                if (error) {
                    console.error("[AUTH SIGNUP ERROR]", error)
                    setTurnstileToken(null)
                    turnstileRef.current?.reset()
                    throw error
                }

                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    setTurnstileToken(null)
                    turnstileRef.current?.reset()
                    throw new Error("Este email já está cadastrado.")
                }

                if (data.user) {
                    try {
                        await Promise.all(
                            CURRENT_LEGAL_DOCUMENTS.map((doc) =>
                                recordLegalConsent({ userId: data.user!.id, tipo: doc.tipo, versao: doc.versao, origem: "signup" })
                            )
                        )
                    } catch (e) {
                        console.error("[AUTH] Falha ao registrar aceite dos documentos legais:", e)
                    }
                }

                setVerifyContext("signup")
                changeMode("verify-email")

            } else {
                try {
                    const preCheck = await preCheckLogin(cleanEmail)
                    if (!preCheck.allowed) {
                        setError(preCheck.error || "Acesso temporariamente bloqueado.")
                        setTurnstileToken(null)
                        turnstileRef.current?.reset()
                        setIsLoading(false)
                        return
                    }
                } catch (preCheckErr) {
                    console.warn("[AUTH] preCheckLogin warning (proceeding to auth):", preCheckErr)
                }

                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                    email: cleanEmail,
                    password,
                    options: {
                        captchaToken: turnstileToken || undefined,
                    },
                })

                if (signInError) {
                    console.error("[AUTH LOGIN ERROR]", signInError)
                    setTurnstileToken(null)
                    turnstileRef.current?.reset()
                    try {
                        const lockoutRes = await handleLoginResult(cleanEmail, false)
                        if (lockoutRes?.error) {
                            setError(lockoutRes.error)
                            setIsLoading(false)
                            return
                        }
                    } catch (lockoutErr) {
                        console.warn("[AUTH] handleLoginResult warning:", lockoutErr)
                    }

                    if (signInError.message?.includes("Email not confirmed") || (signInError as any).code === "email_not_confirmed") {
                        setError("Este e-mail ainda não foi confirmado. Verifique a caixa de entrada do seu e-mail para ativar sua conta.")
                        setIsLoading(false)
                        return
                    }

                    setError(getErrorMessage(signInError))
                    setIsLoading(false)
                    return
                }

                // Check if account is in deletion process immediately after authentication
                if (signInData?.user?.id) {
                    try {
                        const { checkUserDeletionStatusAction } = await import("@/app/actions/shared/account")
                        const delStatus = await checkUserDeletionStatusAction(signInData.user.id)
                        if (delStatus.isDeleting) {
                            await supabase.auth.signOut()
                            setError("Esta conta está em processo de exclusão definitiva e o acesso foi desativado.")
                            setTurnstileToken(null)
                            turnstileRef.current?.reset()
                            setIsLoading(false)
                            return
                        }
                    } catch (checkErr) {
                        console.warn("[AUTH] Error checking user deletion status:", checkErr)
                    }
                }

                try {
                    await handleLoginResult(cleanEmail, true)
                } catch (clearErr) {
                    console.warn("[AUTH] clearFailedLogins warning:", clearErr)
                }

                // Hard navigation to ensure all server cookies, headers, and fresh layout state are synchronized
                window.location.assign(getSafeNext(nextParam))
            }
        } catch (e: any) {
            console.error("[AUTH SUBMIT EXCEPTION]", e)
            setError(getErrorMessage(e))
            setTurnstileToken(null)
            turnstileRef.current?.reset()
        } finally {
            isSubmittingRef.current = false
            setIsLoading(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSubmittingRef.current || isLoading) return
        isSubmittingRef.current = true
        setIsLoading(true)
        setError(null)
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br")
            const recoveryClient = getPasswordRecoveryClient()

            await recoveryClient.auth.signOut({ scope: "local" })

            const { error } = await recoveryClient.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
                redirectTo: `${origin}/auth/update-password`,
                captchaToken: turnstileToken || undefined,
            })
            if (error) {
                console.error("[AUTH RESET PASSWORD ERROR]", error)
                setTurnstileToken(null)
                turnstileRef.current?.reset()
                throw error
            }
            setVerifyContext("recovery")
            changeMode("verify-email")
        } catch (e: any) {
            console.error("[AUTH RESET PASSWORD EXCEPTION]", e)
            setError(getErrorMessage(e))
            setTurnstileToken(null)
            turnstileRef.current?.reset()
        } finally {
            isSubmittingRef.current = false
            setIsLoading(false)
        }
    }

    const handleResendEmail = async () => {
        if (!canResend || isSubmittingRef.current || isLoading) return
        isSubmittingRef.current = true
        setIsLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.resend({ type: "signup", email })
            if (error) throw error

            const nextRetryCount = retryCount + 1
            const nextTimer = 60 * Math.pow(2, nextRetryCount)

            setRetryCount(nextRetryCount)
            setResendTimer(nextTimer)
            setCanResend(false)
        } catch (e: any) {
            setError(getErrorMessage(e))
        } finally {
            isSubmittingRef.current = false
            setIsLoading(false)
        }
    }

    // Animation variants
    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 }
    }

    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray dark:bg-dark-background transition-colors duration-300">
            {/* HEADER */}
            <header className="w-full bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px] flex justify-between items-center h-full">
                    <Link href="/" prefetch={false} className="shrink-0 cursor-pointer">
                        <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto" />
                    </Link>
                    <nav>
                        <Button onClick={onSwitchToPartner} className="h-10 px-6 text-sm font-medium">Anuncie grátis</Button>
                    </nav>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#003229] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <WavesBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[60px] pb-12 z-10 px-4">
                    <AnimatePresence mode="wait">

                        {/* 1. VERIFY EMAIL CARD */}
                        {mode === "verify-email" && (
                            <motion.div
                                key="verify"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-6"
                            >
                                <div className="mx-auto h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                                    <MailIcon size={40} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                        {verifyContext === "signup" ? "Verifique seu email" : "Link enviado!"}
                                    </h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                                        {verifyContext === "signup"
                                            ? <>Enviamos um link de confirmação para <strong>{email}</strong></>
                                            : <>Enviamos as instruções de recuperação para <strong>{email}</strong></>
                                        }
                                    </p>
                                </div>

                                {(() => {
                                    const provider = getEmailProvider(email)
                                    return (
                                        <Button onClick={() => window.open(provider ? provider.url : "mailto:" + email)} className="w-full h-[44px]">
                                            {provider ? `Abrir ${provider.name}` : "Abrir Email"}
                                        </Button>
                                    )
                                })()}

                                {verifyContext === "signup" && (
                                    <div className="text-sm">
                                        {canResend ? (
                                            <Button variant="link" onClick={handleResendEmail} disabled={isLoading}>Reenviar Email</Button>
                                        ) : (
                                            <div className="text-brand-inacitive-text">
                                                {resendTimer > 60 ? (
                                                    <span>Reenviar em {Math.floor(resendTimer / 60)}:{(resendTimer % 60).toString().padStart(2, "0")}</span>
                                                ) : (
                                                    <span>Reenviar em 00:{resendTimer.toString().padStart(2, "0")}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button onClick={() => changeMode("login")} className="text-sm text-brand-inactive-text dark:text-dark-body hover:text-brand-green mt-4 font-medium">← Voltar para Login</button>
                            </motion.div>
                        )}

                        {/* 2. FORGOT PASSWORD CARD */}
                        {mode === "forgot-password" && (
                            <motion.div
                                key="forgot"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-8 md:p-10"
                            >
                                <div className="mb-6">
                                    <h2 className="text-2xl text-brand-dark dark:text-dark-heading mb-2 font-medium">
                                        Redefinir Senha
                                    </h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                                        Digite seu e-mail para receber o link de redefinição.
                                    </p>
                                </div>

                                <form onSubmit={handleResetPassword} className="space-y-6">
                                    <EmailInput
                                        name="email"
                                        label="Digite seu e-mail"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="seu@email.com"
                                    />

                                    {error && <InfoCard message={error} color="red" />}

                                    <Turnstile
                                        ref={turnstileRef}
                                        action="forgot-password"
                                        onSuccess={(token) => setTurnstileToken(token)}
                                        onExpire={() => setTurnstileToken(null)}
                                        onError={() => setTurnstileToken(null)}
                                    />

                                    <div className="flex items-center justify-between pt-2 gap-2">
                                        <Button
                                            variant="outlinered"
                                            className="w-full sm:w-full h-[42px]"
                                            onClick={() => { setError(null); changeMode("login") }}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button type="submit" disabled={isLoading}
                                            className="w-full sm:w-full h-[42px]">
                                            {isLoading ? <Spinner size={18} color="white" /> : "Redefinir senha"}
                                        </Button>
                                    </div>
                                </form>

                                <div className="mt-8 pt-6 border-t border-brand-border text-center">
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        Precisa de ajuda? <button type="button" onClick={() => setIsSupportOpen(true)} className="text-brand-green font-bold hover:underline">Fale com a gente</button>
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* 3. MAIN AUTH CARD (LOGIN / SIGNUP) */}
                        {(mode === "login" || mode === "signup") && (
                            <motion.div
                                key="main-auth"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[880px] min-h-[460px] p-6 md:p-10 flex flex-col md:flex-row relative"
                            >
                                {/* Social Column */}
                                <div className="flex-1 flex flex-col md:pr-8 mb-8 md:mb-0">
                                    <h2 className="text-2xl text-brand-dark dark:text-dark-heading mb-8 font-medium">
                                        {mode === "login" ? "Entre com suas redes sociais" : "Crie com suas redes"}
                                    </h2>
                                    <Button type="button" variant="outline" onClick={handleGoogleAuth} className="w-full gap-3 pl-4 bg-transparent">
                                        <div className="w-6 flex justify-center">
                                            <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                                                <path d="M17.64 9.20443C17.64 8.56625 17.5827 7.95262 17.4764 7.36353H9V10.8449H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8194H14.9564C16.6582 14.2526 17.64 11.9453 17.64 9.20443Z" fill="#4285F4" />
                                                <path d="M8.99976 18C11.4298 18 13.467 17.1941 14.9561 15.8195L12.0475 13.5613C11.2416 14.1013 10.2107 14.4204 8.99976 14.4204C6.65567 14.4204 4.67158 12.8372 3.96385 10.71V4.95818H0.957031V13.0418C2.43794 15.9831 5.48158 18 8.99976 18Z" fill="#34A853" />
                                                <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96385 10.71Z" fill="#FBBC05" />
                                                <path d="M8.99976 3.57955C10.3211 3.57955 11.5075 4.03364 12.4402 4.92545L15.0216 2.34409C13.4629 0.891818 11.4257 0 8.99976 0C5.48158 0 2.43794 2.01682 0.957031 4.95818L3.96385 7.29C4.67158 5.16273 6.65567 3.57955 8.99976 3.57955Z" fill="#EA4335" />
                                            </svg>
                                        </div>
                                        <span className="flex-1 text-center pr-6">Entrar com Google</span>
                                    </Button>
                                </div>

                                {/* Divider */}
                                <div className="relative md:w-[1px] bg-gray-200 dark:bg-dark-border my-6 md:my-0 flex items-center justify-center">
                                    <span className="absolute bg-white dark:bg-dark-surface px-2 text-brand-inactive-text dark:text-dark-body text-xs uppercase">ou</span>
                                </div>

                                {/* Form Column */}
                                <div className="flex-1 flex flex-col md:pl-8">
                                    <h2 className="text-2xl text-brand-dark dark:text-dark-heading mb-8 font-medium">
                                        {mode === "login" ? "Digite o seu e-mail e senha" : "Preencha seus dados"}
                                    </h2>

                                    <form onSubmit={handleAuthSubmit} className="space-y-5">
                                        <EmailInput name="email" label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="E-mail" />

                                        <div className="relative">
                                            <PasswordInput
                                                name="password"
                                                label="Senha"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                placeholder="Senha"
                                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                            />
                                            {mode === "signup" && <PasswordStrengthMeter password={password} />}
                                        </div>

                                        {mode === "login" && (
                                            <div className="mt-2 text-right">
                                                <button type="button" onClick={() => changeMode("forgot-password")} className="text-brand-green text-[13px] font-bold hover:underline">
                                                    Esqueci minha senha
                                                </button>
                                            </div>
                                        )}

                                        {mode === "signup" && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <Checkbox id="terms" checked={acceptedTerms} onChange={(checked) => setAcceptedTerms(checked as boolean)} />
                                                <label htmlFor="terms" className="text-sm text-brand-inactive-text dark:text-dark-body cursor-pointer">Aceito os <Link href="institucional/termos" prefetch={false} className="underline text-brand-dark dark:text-dark-heading">Termos de uso</Link></label>
                                            </div>
                                        )}

                                        {searchParams.get("deleted") === "true" && (
                                            <InfoCard
                                                title="Conta excluída com sucesso"
                                                message="Sua solicitação de exclusão foi processada. A conta foi desativada e todos os dados associados estão sendo removidos."
                                                color="green"
                                            />
                                        )}

                                        {searchParams.get("error") === "account_deleting" && (
                                            <InfoCard
                                                title="Conta em processo de exclusão"
                                                message="Esta conta está em processo de exclusão definitiva e não pode mais ser acessada."
                                                color="red"
                                            />
                                        )}

                                        {error && <InfoCard message={error} color="red" />}

                                        <Turnstile
                                            key={mode}
                                            ref={turnstileRef}
                                            action={mode === "login" ? "login" : "signup"}
                                            onSuccess={(token) => setTurnstileToken(token)}
                                            onExpire={() => setTurnstileToken(null)}
                                            onError={() => setTurnstileToken(null)}
                                        />

                                        <Button type="submit" disabled={isLoading || (mode === "signup" && !acceptedTerms)} className="w-full h-[44px] text-[15px] font-bold mt-2">
                                            {isLoading ? <Spinner size={18} color="white" /> : mode === "login" ? "Entrar" : "Criar Conta"}
                                        </Button>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {(mode === "login" || mode === "signup") && (
                        <div className="mt-8 text-center space-y-4">
                            <p className="text-gray-500 dark:text-dark-body text-[14px]">
                                {mode === "login" ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
                                <button onClick={() => { setError(null); changeMode(mode === "login" ? "signup" : "login") }} className="text-brand-green font-bold hover:underline">
                                    {mode === "login" ? "Crie a sua" : "Entrar"}
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />

            <SupportModal
                isOpen={isSupportOpen}
                onClose={() => setIsSupportOpen(false)}
                userEmail={email}
            />
        </div>
    )
}
