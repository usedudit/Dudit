"use client"

import React, { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { MailIcon, HelpCircleIcon } from "@/lib/icons"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { generateNameFromEmail } from "@/lib/utils"
import { Button, EmailInput, Input, PasswordInput, PasswordStrengthMeter, Checkbox, InfoCard, Spinner } from "@/components/reusable"
import { calculatePasswordScore } from "@/lib/utils"
import { getErrorMessage } from "@/lib/utils/error-handlers"

// Types
type AuthMode = "login" | "signup" | "verify-email" | "forgot-password"

// Helpers
function getEmailProvider(email: string) {
    const domain = email?.split("@")[1]?.toLowerCase()
    if (!domain) return null

    const providers: Record<string, { name: string; url: string; icon: string }> = {
        "gmail.com": { name: "Gmail", url: "https://mail.google.com", icon: "📧" },
        "googlemail.com": { name: "Gmail", url: "https://mail.google.com", icon: "📧" },
        "outlook.com": { name: "Outlook", url: "https://outlook.live.com", icon: "📨" },
        "hotmail.com": { name: "Outlook", url: "https://outlook.live.com", icon: "📨" },
        "live.com": { name: "Outlook", url: "https://outlook.live.com", icon: "📨" },
        "yahoo.com": { name: "Yahoo Mail", url: "https://mail.yahoo.com", icon: "📬" },
        "protonmail.com": { name: "Proton Mail", url: "https://mail.proton.me", icon: "🔒" },
        "proton.me": { name: "Proton Mail", url: "https://mail.proton.me", icon: "🔒" },
        "icloud.com": { name: "iCloud Mail", url: "https://www.icloud.com/mail", icon: "☁️" },
        "me.com": { name: "iCloud Mail", url: "https://www.icloud.com/mail", icon: "☁️" },
    }

    return providers[domain] || null
}


// Otimização: Static Background Memoized
const CityBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <svg className="w-full h-full" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
            <circle cx="410" cy="110" r="16" fill="white" opacity="0.2" />
            <path d="M480 140 Q 500 110, 520 110 T 560 140 Z" fill="none" stroke="#044d4b" strokeWidth="2" />
            <path d="M360 150 Q 375 130, 390 130 T 420 150 Z" fill="none" stroke="#044d4b" strokeWidth="2" transform="translate(0, 10)" />
            <path d="M630 130 Q 650 110, 670 110 T 700 130 Z" fill="none" stroke="white" strokeWidth="2" opacity="0.3" />
            <path d="M260 320 V190 H300 V320 M270 320 V200 M290 320 V200" stroke="#044d4b" strokeWidth="2" fill="none" />
            <path d="M690 320 V110 H715 V320 M720 320 V80 H750 V320" stroke="#044d4b" strokeWidth="2" fill="none" />
            <line x1="725" y1="90" x2="745" y2="90" stroke="#044d4b" strokeWidth="2" />
            <line x1="725" y1="110" x2="745" y2="110" stroke="#044d4b" strokeWidth="2" />
            <line x1="725" y1="130" x2="745" y2="130" stroke="#044d4b" strokeWidth="2" />
            <path d="M760 320 V160 H775 V180 H780 V320" stroke="#044d4b" strokeWidth="2" fill="none" />
            <path d="M300 190 V140 H450 V200" stroke="#044d4b" strokeWidth="2" fill="none" />
        </svg>
    </div>
))
CityBackground.displayName = "CityBackground"

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

    // Timer states
    const [resendTimer, setResendTimer] = useState(60)
    const [canResend, setCanResend] = useState(false)
    const [retryCount, setRetryCount] = useState(0)
    const [verifyContext, setVerifyContext] = useState<"signup" | "recovery">("signup")

    // supabase singleton imported directly

    // Logic to handle timer decrement (Fix for the reported bug)
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
        // If the user lands on the page with #access_token=... or #error=... in the URL
        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = window.location.hash

            if (hash.includes("error=")) {
                const errorDescriptionMatch = hash.match(/error_description=([^&]+)/)
                const errorDescription = errorDescriptionMatch ? decodeURIComponent(errorDescriptionMatch[1].replace(/\+/g, ' ')) : "Erro na autenticação"
                setError(errorDescription)
                // Clear the hash without reloading
                window.history.replaceState(null, '', window.location.pathname + window.location.search)
            } else if (hash.includes("access_token=")) {
                setIsLoading(true)
                // supabase-js atuomatically parses the hash into a session
                supabase.auth.getSession().then((res: any) => {
                    const { data, error } = res;
                    if (error) {
                        setError(getErrorMessage(error))
                        setIsLoading(false)
                    } else if (data?.session) {
                        // Successfully logged in via hash fragment, redirect
                        router.push(nextParam)
                        router.refresh()
                    } else {
                        setIsLoading(false)
                    }
                })
            }
        }
    }, [supabase.auth, router, nextParam])

    const handleGoogleAuth = async () => {
        setIsLoading(true)
        try {
            await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `https://dudit.com.br/auth/callback?next=${encodeURIComponent(nextParam)}`, queryParams: { access_type: "offline", prompt: "consent" } },
            })
        } catch (e: any) {
            setError(getErrorMessage(e))
            setIsLoading(false)
        }
    }

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            if (mode === "signup") {
                if (calculatePasswordScore(password) < 2) throw new Error("A senha deve ser média ou forte.")

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: generateNameFromEmail(email) }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}` },
                })
                if (error) throw error

                // SECURITY: Supabase returns a user with empty identities when email already exists
                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    throw new Error("Este email já está cadastrado.")
                }

                // SECURITY FIX (CRIT-01): User profile is now created automatically
                // by a database trigger on auth.users - no client action needed.

                setVerifyContext("signup")
                setMode("verify-email")

            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) {
                    if (error.message.includes("Email not confirmed")) {
                        setVerifyContext("signup")
                        setMode("verify-email")
                        return
                    }
                    throw error
                }
                router.push(nextParam)
                router.refresh()
            }
        } catch (e: any) {
            setError(getErrorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/update-password`,
            })
            if (error) throw error
            setVerifyContext("recovery")
            setMode("verify-email")
        } catch (e: any) {
            setError(getErrorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    const handleResendEmail = async () => {
        if (!canResend) return
        setIsLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.resend({ type: "signup", email })
            if (error) throw error

            const nextRetryCount = retryCount + 1
            const nextTimer = 60 * Math.pow(2, nextRetryCount) // Exponential backoff: 60, 120, 240, etc.

            setRetryCount(nextRetryCount)
            setResendTimer(nextTimer)
            setCanResend(false)
        } catch (e: any) {
            setError(getErrorMessage(e))
        } finally {
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
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray">
            {/* HEADER */}
            <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px] flex justify-between items-center h-full">
                    <Link href="/" prefetch={false} className="shrink-0 cursor-pointer">
                        <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto" />
                    </Link>
                    <nav>
                        <Button onClick={onSwitchToPartner} className="h-10 px-6 text-sm font-medium">Seja Parceiro</Button>
                    </nav>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#003d32] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <CityBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[60px] pb-12 z-10 px-4">
                    <AnimatePresence mode="wait">

                        {/* 1. VERIFY EMAIL CARD */}
                        {mode === "verify-email" && (
                            <motion.div
                                key="verify"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-6"
                            >
                                <div className="mx-auto h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                                    <MailIcon size={40} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-brand-dark mb-2">
                                        {verifyContext === "signup" ? "Verifique seu email" : "Link enviado!"}
                                    </h2>
                                    <p className="text-brand-inactive-text text-sm">
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

                                <button onClick={() => setMode("login")} className="text-sm text-brand-inactive-text hover:text-brand-green mt-4 font-medium">← Voltar para Login</button>
                            </motion.div>
                        )}

                        {/* 2. FORGOT PASSWORD CARD */}
                        {mode === "forgot-password" && (
                            <motion.div
                                key="forgot"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white rounded-lg shadow-xl w-full max-w-[500px] p-8 md:p-10"
                            >
                                <div className="mb-6">
                                    <h2 className="text-2xl text-brand-dark mb-2 font-medium">
                                        Redefinir Senha
                                    </h2>
                                    <p className="text-brand-inactive-text text-sm">
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

                                    <div className="flex items-center justify-between pt-2">
                                        <Button
                                            variant="outlinered"
                                            className="w-full sm:w-auto h-12 font-bold"
                                            onClick={() => { setError(null); setMode("login") }}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button type="submit" disabled={isLoading} className="px-8 h-[42px]">
                                            {isLoading ? <Spinner size={18} color="white" /> : "Redefinir senha"}
                                        </Button>
                                    </div>
                                </form>

                                <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                                    <p className="text-[13px] text-gray-500">
                                        Precisa de ajuda? <a href="#" className="text-brand-green font-bold hover:underline">Fale com a gente</a>
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* 3. MAIN AUTH CARD (LOGIN / SIGNUP) */}
                        {(mode === "login" || mode === "signup") && (
                            <motion.div
                                key="main-auth"
                                variants={cardVariants} initial="hidden" animate="visible" exit="exit"
                                className="bg-white rounded-lg shadow-xl w-full max-w-[880px] min-h-[460px] p-6 md:p-10 flex flex-col md:flex-row relative"
                            >
                                {/* Social Column */}
                                <div className="flex-1 flex flex-col md:pr-8 mb-8 md:mb-0">
                                    <h2 className="text-2xl text-brand-dark mb-8 font-medium">
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
                                <div className="relative md:w-[1px] bg-gray-200 my-6 md:my-0 flex items-center justify-center">
                                    <span className="absolute bg-white px-2 text-brand-inactive-text text-xs uppercase">ou</span>
                                </div>

                                {/* Form Column */}
                                <div className="flex-1 flex flex-col md:pl-8">
                                    <h2 className="text-2xl text-brand-dark mb-8 font-medium">
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
                                                <button type="button" onClick={() => setMode("forgot-password")} className="text-brand-green text-[13px] font-bold hover:underline">
                                                    Esqueci minha senha
                                                </button>
                                            </div>
                                        )}

                                        {mode === "signup" && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <Checkbox id="terms" checked={acceptedTerms} onChange={(checked) => setAcceptedTerms(checked as boolean)} />
                                                <label htmlFor="terms" className="text-sm text-gray-600 cursor-pointer">Aceito os <Link href="/terms" prefetch={false} className="underline text-slate-800">Termos</Link></label>
                                            </div>
                                        )}

                                        {error && <InfoCard message={error} color="red" />}

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
                            <p className="text-gray-500 text-[14px]">
                                {mode === "login" ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
                                <button onClick={() => { setError(null); setMode(mode === "login" ? "signup" : "login") }} className="text-brand-green font-bold hover:underline">
                                    {mode === "login" ? "Crie a sua" : "Entrar"}
                                </button>
                            </p>
                        </div>
                    )}

                    <div className="mt-16 flex items-center text-gray-500 text-[14px]">
                        <HelpCircleIcon className="mr-2 h-5 w-5" />
                        <span>Precisa de ajuda? <a href="#" className="text-brand-green font-bold hover:underline">Fale com a gente</a></span>
                    </div>
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    )
}
