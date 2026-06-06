"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { updateProfileAction, requestEmailChangeAction, verifyEmailChangeAction } from "@/app/actions/profile"
import { changePasswordAction } from "@/app/actions/shared/password"
import { useNotification } from "@/hooks/use-notification"
import { useRouter, useSearchParams } from "next/navigation"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import { MarketplaceHeader } from "../marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"

import { View, EditField } from "./profile-shared"
import { MainView } from "./MainView"
import { AccountView } from "./AccountView"
import { AddressView } from "./AddressView"
import { SecurityView } from "./SecurityView"
import { TwoFactorView } from "./TwoFactorView"
import { ReviewsView } from "./ReviewsView"

interface UserProfilePageProps {
    userId: string
    profile: any
    addresses: any[]
    initialFullName?: string
    email: string
    hasPassword: boolean
    authProvider: string
}

export function UserProfilePage({ userId, profile, addresses: initialAddresses, initialFullName, email, hasPassword, authProvider }: UserProfilePageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialTab = searchParams.get("tab") as View | null

    const [currentView, setCurrentView] = useState<View>(initialTab || "main")

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tabFromUrl = params.get("tab") as View | null

        if (tabFromUrl && tabFromUrl !== currentView) {
            setCurrentView(tabFromUrl)
        } else if (!tabFromUrl && currentView !== "main") {
            setCurrentView("main")
        }
    }, [])

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search)
            const tabFromUrl = params.get("tab") as View | null
            setCurrentView(tabFromUrl || "main")
        }

        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [userAddresses, setUserAddresses] = useState<any[]>(initialAddresses || [])
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState<Record<EditField, boolean>>({
        name: false, cpf: false, phone: false, password: false, address: false,
        secPhone: false, secEmail: false,
    })

    // Email change flow (account page)
    const [isChangingEmail, setIsChangingEmail] = useState(false)
    const [newEmail, setNewEmail] = useState("")
    const [emailOtp, setEmailOtp] = useState("")
    const [otpSent, setOtpSent] = useState(false)
    const [canResend, setCanResend] = useState(true)
    const [resendTimer, setResendTimer] = useState(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const nextResendRef = useRef(0)
    const resendAttempts = useRef(0)

    // Email change flow (security page)
    const [isChangingSecEmail, setIsChangingSecEmail] = useState(false)
    const [newSecEmail, setNewSecEmail] = useState("")
    const [secEmailOtp, setSecEmailOtp] = useState("")
    const [secOtpSent, setSecOtpSent] = useState(false)
    const [secCanResend, setSecCanResend] = useState(true)
    const [secResendTimer, setSecResendTimer] = useState(0)
    const secTimerRef = useRef<NodeJS.Timeout | null>(null)
    const secNextResendRef = useRef(0)
    const secResendAttempts = useRef(0)

    const [accountData, setAccountData] = useState({
        fullName: profile?.full_name || initialFullName || "",
        cpf: profile?.cpf || "",
        phone: profile?.phone ? formatE164ToDisplay(profile.phone) : "",
        email,
    })

    const [addressData, setAddressData] = useState({
        zipCode: profile?.zip_code || "",
        street: profile?.street || "",
        number: profile?.number || "",
        complement: profile?.complement || "",
        neighborhood: profile?.neighborhood || "",
        city: profile?.city || "",
        state: profile?.state || "",
    })

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })

    useEffect(() => {
        if (isChangingEmail && nextResendRef.current > Date.now()) {
            const remaining = Math.ceil((nextResendRef.current - Date.now()) / 1000)
            startTimer(timerRef, setResendTimer, setCanResend, nextResendRef, remaining, false)
        }
    }, [isChangingEmail])

    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current)
        if (secTimerRef.current) clearInterval(secTimerRef.current)
    }, [])

    // ── Helpers ───────────────────────────────────────────────────────────────

    const clearMessages = () => { setError(null); setSuccess(null) }

    const setEdit = (field: EditField, val: boolean) => {
        clearMessages()
        setEditing(e => ({ ...e, [field]: val }))
    }

    const navigate = (view: View) => {
        clearMessages()
        setEditing({ name: false, cpf: false, phone: false, password: false, address: false, secPhone: false, secEmail: false })
        setIsChangingEmail(false)
        setIsChangingSecEmail(false)

        setCurrentView(view)

        const url = view === "main" ? "/perfil" : `/perfil?tab=${view}`
        window.history.pushState(null, "", url)
    }

    const startTimer = (
        ref: React.MutableRefObject<NodeJS.Timeout | null>,
        setTimer: any,
        setCanSend: (v: boolean) => void,
        nextRef: React.MutableRefObject<number>,
        seconds: number,
        setRef = true,
    ) => {
        if (setRef) nextRef.current = Date.now() + seconds * 1000
        setCanSend(false)
        setTimer(seconds)
        if (ref.current) clearInterval(ref.current)
        ref.current = setInterval(() => {
            setTimer((prev: number) => {
                if (prev <= 1) {
                    clearInterval(ref.current!); ref.current = null
                    setCanSend(true); nextRef.current = 0
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    const saveField = async (
        fn: (csrfToken: string) => Promise<{ error?: string }>,
        successMsg: string,
        onSuccess?: () => void,
    ) => {
        setIsLoading(true); clearMessages()
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const result = await fn(token)
            if (result.error) {
                setError(result.error)
                notifyError("Erro ao salvar", result.error)
            }
            else {
                setSuccess(successMsg)
                notifySuccess("Sucesso", successMsg)
                onSuccess?.()
            }
        } catch {
            setError("Erro de validação de segurança. Tente novamente.")
            notifyError("Erro de segurança", "Tente novamente mais tarde.")
        } finally {
            setIsLoading(false)
        }
    }

    // ── Save handlers ─────────────────────────────────────────────────────────

    const handleSaveName = () => {
        if (!accountData.fullName.trim()) { setError("O nome completo é obrigatório"); return }
        saveField((token) => updateProfileAction({ fullName: accountData.fullName, csrf_token: token }), "Nome atualizado!", () => setEdit("name", false))
    }

    const handleSaveCpf = () =>
        saveField((token) => updateProfileAction({ cpf: accountData.cpf, csrf_token: token }), "CPF atualizado!", () => setEdit("cpf", false))

    const handleSavePhone = (field: "phone" | "secPhone" = "phone") =>
        saveField((token) => updateProfileAction({ phone: accountData.phone, csrf_token: token }), "Telefone atualizado!", () => setEdit(field, false))

    const handleSaveAddress = () => {
        const { zipCode, street, number, neighborhood, city, state } = addressData
        if (!zipCode || !street || !number || !neighborhood || !city || !state) {
            setError("Preencha todos os campos obrigatórios"); return
        }
        saveField((token) => updateProfileAction({ ...addressData, csrf_token: token }), "Endereço atualizado!", () => setEdit("address", false))
    }

    const handleChangePassword = async () => {
        if (passwordData.newPassword.length < 6) { setError("A senha deve ter pelo menos 6 caracteres"); return }
        if (passwordData.newPassword !== passwordData.confirmPassword) { setError("As senhas não coincidem"); return }
        if (hasPassword && !passwordData.currentPassword) { setError("Digite sua senha atual"); return }
        setIsLoading(true); clearMessages()
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const result = await changePasswordAction({
                currentPassword: hasPassword ? passwordData.currentPassword : undefined,
                newPassword: passwordData.newPassword,
                confirmPassword: passwordData.confirmPassword,
                csrf_token: token,
            })
            if (result.error) {
                setError(result.error)
                notifyError("Erro", result.error)
            }
            else {
                notifySuccess("Sucesso", "Senha alterada com sucesso!")
                // Automatically restore session using the new password, then refresh UI
                const { supabaseBrowser: supabase } = await import("@/lib/supabase/browser-client")
                await supabase.auth.signInWithPassword({
                    email: email,
                    password: passwordData.newPassword
                })

                // Sign out all OTHER devices/sessions (keeps current session active)
                await supabase.auth.signOut({ scope: 'others' })

                // Give a moment for the toast to be visible before reloading
                setTimeout(() => {
                    window.location.reload()
                }, 1500)
            }
        } catch {
            setError("Erro ao alterar senha")
            notifyError("Erro", "Erro ao alterar senha")
        }
        finally { setIsLoading(false) }
    }

    // ── Email change helpers ──────────────────────────────────────────────────

    const makeEmailHandlers = (
        emailVal: string,
        setEmailVal: (v: string) => void,
        setOtpVal: (v: string) => void,
        setOtpSentVal: (v: boolean) => void,
        setCanResendVal: (v: boolean) => void,
        setResendTimerVal: (v: number) => void,
        tRef: React.MutableRefObject<NodeJS.Timeout | null>,
        nRef: React.MutableRefObject<number>,
        attemptsRef: React.MutableRefObject<number>,
        setChanging: (v: boolean) => void,
        otpVal: string,
    ) => ({
        sendOtp: async () => {
            if (!emailVal || !emailVal.includes("@")) { setError("Digite um email válido"); return }
            if (nRef.current > Date.now()) { setError("Aguarde antes de enviar outro código"); return }
            setIsLoading(true); clearMessages()
            const result = await requestEmailChangeAction(emailVal)
            if (result.error) {
                setError(result.error)
                notifyError("Erro", result.error)
            }
            else {
                setOtpSentVal(true); setSuccess("Código enviado para o novo email!")
                notifySuccess("Código enviado", "Verifique sua caixa de entrada.")
                attemptsRef.current += 1
                if (attemptsRef.current >= 3) {
                    setError("Limite de tentativas atingido.")
                    notifyError("Atenção", "Limite de tentativas atingido.")
                    setCanResendVal(false); setIsLoading(false); return
                }
                startTimer(tRef, setResendTimerVal, setCanResendVal, nRef, attemptsRef.current * 60)
            }
            setIsLoading(false)
        },
        verifyOtp: async () => {
            if (!otpVal || otpVal.length !== 6) { setError("Digite o código de 6 dígitos"); return }
            setIsLoading(true); clearMessages()
            const result = await verifyEmailChangeAction(emailVal, otpVal)
            if (result.error) {
                setError(result.error)
                notifyError("Erro de verificação", result.error)
            }
            else {
                setSuccess("Email alterado com sucesso!")
                notifySuccess("Sucesso", "Email alterado com sucesso!")
                setAccountData(d => ({ ...d, email: emailVal }))
                setChanging(false); setOtpSentVal(false); setEmailVal(""); setOtpVal("")
                attemptsRef.current = 0; nRef.current = 0
                if (tRef.current) { clearInterval(tRef.current); tRef.current = null }
            }
            setIsLoading(false)
        },
        cancel: () => { setChanging(false); setOtpSentVal(false); setEmailVal(""); setOtpVal(""); clearMessages() },
    })

    const accountEmailHandlers = makeEmailHandlers(
        newEmail, setNewEmail, setEmailOtp, setOtpSent, setCanResend, setResendTimer,
        timerRef, nextResendRef, resendAttempts, setIsChangingEmail, emailOtp,
    )

    const secEmailHandlers = makeEmailHandlers(
        newSecEmail, setNewSecEmail, setSecEmailOtp, setSecOtpSent, setSecCanResend, setSecResendTimer,
        secTimerRef, secNextResendRef, secResendAttempts, setIsChangingSecEmail, secEmailOtp,
    )

    const formattedAddress = () => {
        const { street, number, complement, neighborhood, city, state, zipCode } = addressData
        if (!street && !city) return ""
        return [
            street && number ? `${street}, ${number}` : street,
            complement, neighborhood,
            city && state ? `${city} - ${state}` : city || state,
            zipCode,
        ].filter(Boolean).join(", ")
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const getViewTitle = () => {
        switch (currentView) {
            case "main": return "Meu perfil"
            case "informacoes-da-conta": return "Informações da conta"
            case "enderecos": return "Endereço"
            case "seguranca": return "Segurança"
            case "two-factor": return "Autenticação 2FA"
            case "avaliacoes": return "Minhas avaliações"
            default: return "Meu perfil"
        }
    }

    return (
        <>
            <MarketplaceHeader simpleTitle={getViewTitle()} />
            <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
                <style>{`.animate-fade-in{animation:fadeIn 0.4s ease-out forwards}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
                <div className="container mx-auto px-4 max-w-[1300px] mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                    <AnimatePresence mode="wait">
                        {currentView === "main" && <MainView key="main" navigate={navigate} />}
                        {currentView === "informacoes-da-conta" && (
                            <AccountView
                                key="account"
                                navigate={navigate}
                                accountData={accountData}
                                setAccountData={setAccountData}
                                editing={editing}
                                setEdit={setEdit}
                                isLoading={isLoading}
                                error={error}
                                success={success}
                                isChangingEmail={isChangingEmail}
                                setIsChangingEmail={setIsChangingEmail}
                                otpSent={otpSent}
                                setOtpSent={setOtpSent}
                                newEmail={newEmail}
                                setNewEmail={setNewEmail}
                                emailOtp={emailOtp}
                                setEmailOtp={setEmailOtp}
                                canResend={canResend}
                                resendTimer={resendTimer}
                                accountEmailHandlers={accountEmailHandlers}
                                handleSavePhone={handleSavePhone}
                                handleSaveName={handleSaveName}
                                handleSaveCpf={handleSaveCpf}
                                clearMessages={clearMessages}
                            />
                        )}
                        {currentView === "enderecos" && (
                            <AddressView
                                key="address"
                                navigate={navigate}
                                userId={userId}
                                addresses={userAddresses}
                                setAddresses={setUserAddresses}
                                isLoading={isLoading}
                                setIsLoading={setIsLoading}
                                error={error}
                                setError={setError}
                                success={success}
                                setSuccess={setSuccess}
                                clearMessages={clearMessages}
                            />
                        )}
                        {currentView === "seguranca" && (
                            <SecurityView
                                key="password"
                                navigate={navigate}
                                accountData={accountData}
                                setAccountData={setAccountData}
                                editing={editing}
                                setEdit={setEdit}
                                isLoading={isLoading}
                                error={error}
                                success={success}
                                isChangingSecEmail={isChangingSecEmail}
                                setIsChangingSecEmail={setIsChangingSecEmail}
                                secOtpSent={secOtpSent}
                                setSecOtpSent={setSecOtpSent}
                                newSecEmail={newSecEmail}
                                setNewSecEmail={setNewSecEmail}
                                secEmailOtp={secEmailOtp}
                                setSecEmailOtp={setSecEmailOtp}
                                secCanResend={secCanResend}
                                secResendTimer={secResendTimer}
                                secEmailHandlers={secEmailHandlers}
                                passwordData={passwordData}
                                setPasswordData={setPasswordData}
                                hasPassword={hasPassword}
                                authProvider={authProvider}
                                handleChangePassword={handleChangePassword}
                                handleSavePhone={handleSavePhone}
                                clearMessages={clearMessages}
                            />
                        )}
                        {currentView === "two-factor" && <TwoFactorView key="2fa" navigate={navigate} />}
                        {currentView === "avaliacoes" && <ReviewsView key="avaliacoes" navigate={navigate} />}
                    </AnimatePresence>
                </div>
                <MarketplaceFooter />
            </div>
        </>
    )
}
