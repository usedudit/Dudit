"use client"

import { motion, AnimatePresence } from "framer-motion"
import { PhoneIcon, LockIcon } from "@/lib/icons"
import { Button, PhoneInput, PasswordInput, PasswordStrengthMeter, InfoCard } from "@/components/reusable"
import { SectionCard, DisplayRow, Divider, Feedback, PageHeader, EmailChangeBlock, fade, View, EditField } from "./profile-shared"

interface SecurityViewProps {
    navigate: (view: View) => void
    accountData: any
    setAccountData: any
    editing: Record<EditField, boolean>
    setEdit: (field: EditField, val: boolean) => void
    isLoading: boolean
    error: string | null
    success: string | null
    isChangingSecEmail: boolean
    setIsChangingSecEmail: (v: boolean) => void
    secOtpSent: boolean
    setSecOtpSent: (v: boolean) => void
    newSecEmail: string
    setNewSecEmail: (v: string) => void
    secEmailOtp: string
    setSecEmailOtp: (v: string) => void
    secCanResend: boolean
    secResendTimer: number
    secEmailHandlers: any
    passwordData: any
    setPasswordData: any
    hasPassword: boolean
    authProvider: string
    handleChangePassword: () => void
    handleSavePhone: (field: "phone" | "secPhone") => void
    clearMessages: () => void
    onDeleteClick?: () => void
}

export const SecurityView = ({
    navigate,
    accountData,
    setAccountData,
    editing,
    setEdit,
    isLoading,
    error,
    success,
    isChangingSecEmail,
    setIsChangingSecEmail,
    secOtpSent,
    setSecOtpSent,
    newSecEmail,
    setNewSecEmail,
    secEmailOtp,
    setSecEmailOtp,
    secCanResend,
    secResendTimer,
    secEmailHandlers,
    passwordData,
    setPasswordData,
    hasPassword,
    authProvider,
    handleChangePassword,
    handleSavePhone,
    clearMessages,
    onDeleteClick,
}: SecurityViewProps) => (
    <motion.div key="password" {...fade} className="max-w-[800px] mx-auto space-y-6">
        <PageHeader title="Segurança" subtitle="Gerencie seu acesso e segurança da conta." onBack={() => navigate("main")} />

        <SectionCard title="Acesso e segurança">
            <div className="space-y-4">
                {/* Phone */}
                <AnimatePresence mode="wait">
                    {!editing.secPhone ? (
                        <motion.div key="sec-phone-display" {...fade}>
                            <DisplayRow icon={PhoneIcon} value={accountData.phone} description="Telefone de contato vinculado à conta." onEdit={() => setEdit("secPhone", true)} />
                        </motion.div>
                    ) : (
                        <motion.div key="sec-phone-edit" {...fade} className="space-y-4">
                            <PhoneInput
                                label="Telefone"
                                id="secPhone"
                                name="secPhone"
                                placeholder="(00) 00000-0000"
                                value={accountData.phone}
                                onChange={e => setAccountData((d: any) => ({ ...d, phone: e.target.value }))}
                            />
                            <Feedback error={error} success={success} />
                            <div className="flex gap-2">
                                <Button type="button" onClick={() => handleSavePhone("secPhone")} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar"}</Button>
                                <Button type="button" variant="outline" onClick={() => setEdit("secPhone", false)}>Cancelar</Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Divider />

                {/* Email */}
                <EmailChangeBlock
                    idPrefix="sec"
                    currentEmail={accountData.email}
                    isChanging={isChangingSecEmail}
                    onStartChange={() => { setIsChangingSecEmail(true); setSecOtpSent(false); setNewSecEmail(""); setSecEmailOtp(""); clearMessages() }}
                    newEmailVal={newSecEmail}
                    setNewEmailVal={setNewSecEmail}
                    otpSentVal={secOtpSent}
                    otpVal={secEmailOtp}
                    setOtpVal={setSecEmailOtp}
                    canResendVal={secCanResend}
                    resendTimerVal={secResendTimer}
                    handlers={secEmailHandlers}
                    isLoading={isLoading}
                    error={error}
                    success={success}
                />

                <Divider />

                {/* Password */}
                <AnimatePresence mode="wait">
                    {!editing.password ? (
                        <motion.div key="pwd-display" {...fade}>
                            <DisplayRow
                                icon={LockIcon}
                                value={hasPassword ? "••••••••" : "Não definida"}
                                description={hasPassword ? "Senha de acesso à conta." : `Você utiliza login via ${authProvider}. Defina uma senha para também acessar com e-mail e senha.`}
                                onEdit={() => setEdit("password", true)}
                            />
                        </motion.div>
                    ) : (
                        <motion.div key="pwd-edit" {...fade} className="space-y-4">
                            {!hasPassword && (
                                <div className="flex items-center">
                                    <InfoCard
                                        message={<>Você utiliza login via <strong className="capitalize">{authProvider}</strong>. Deseja definir uma senha para também acessar com e-mail e senha?</>}
                                        color="orange"
                                    />
                                </div>
                            )}
                            {hasPassword && (
                                <>
                                    <InfoCard
                                        message="Ao alterar sua senha, todos os outros dispositivos conectados serão deslogados automaticamente. Apenas este dispositivo atual permanecerá conectado."
                                        color="gray"
                                    />
                                    <PasswordInput
                                        label="Senha atual *"
                                        id="currentPassword"
                                        name="currentPassword"
                                        value={passwordData.currentPassword}
                                        onChange={e => setPasswordData((d: any) => ({ ...d, currentPassword: e.target.value }))}
                                        placeholder="Digite sua senha atual"
                                    />
                                </>
                            )}
                            <div>
                                <PasswordInput
                                    label={hasPassword ? "Nova senha *" : "Definir senha *"}
                                    id="newPassword"
                                    name="newPassword"
                                    value={passwordData.newPassword}
                                    onChange={e => setPasswordData((d: any) => ({ ...d, newPassword: e.target.value }))}
                                    placeholder="Mínimo 6 caracteres"
                                />
                                <PasswordStrengthMeter password={passwordData.newPassword} />
                            </div>
                            <PasswordInput
                                label="Confirmar senha *"
                                id="confirmPassword"
                                name="confirmPassword"
                                value={passwordData.confirmPassword}
                                onChange={e => setPasswordData((d: any) => ({ ...d, confirmPassword: e.target.value }))}
                                placeholder="Digite a senha novamente"
                            />
                            <Feedback error={error} success={success} />
                            <div className="flex gap-2">
                                <Button type="button" onClick={handleChangePassword} disabled={isLoading}>{isLoading ? (hasPassword ? "Alterando..." : "Definindo...") : (hasPassword ? "Alterar senha" : "Definir senha")}</Button>
                                <Button type="button" variant="outline" onClick={() => setEdit("password", false)}>Cancelar</Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </SectionCard>

        {onDeleteClick && (
            <SectionCard title="Exclusão de conta">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <span className="block text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                Encerrar minha conta definitivamente
                            </span>
                            <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                                Ao excluir sua conta, você perderá o acesso à plataforma e todos os dados associados serão apagados permanentemente após o prazo de carência de 48 horas.
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900 dark:hover:bg-red-950 text-xs font-bold shrink-0 self-start sm:self-center"
                            onClick={onDeleteClick}
                        >
                            Excluir conta
                        </Button>
                    </div>
                </div>
            </SectionCard>
        )}
    </motion.div>
)
