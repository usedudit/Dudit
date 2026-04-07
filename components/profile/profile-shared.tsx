"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ChevronRightIcon, ChevronLeftIcon, MailIcon } from "@/lib/icons"
import { Button, Input, EmailInput, InfoCard } from "@/components/reusable"

// ─── Animation ────────────────────────────────────────────────────────────────

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type View = "main" | "account" | "address" | "password" | "two-factor"
export type EditField = "name" | "cpf" | "phone" | "password" | "address" | "secPhone" | "secEmail"

// ─── Shared Components ────────────────────────────────────────────────────────

export const SectionCard = ({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) => (
  <div className={`bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden ${className}`}>
    <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-emerald-900/10 font-bold text-brand-dark dark:text-dark-heading">
      {title}
    </div>
    <div className="p-6">{children}</div>
  </div>
)

export const DisplayRow = ({
  icon: Icon,
  value,
  description,
  onEdit,
}: {
  icon: any
  value: string
  description: string
  onEdit: () => void
}) => (
  <div className="flex items-center gap-4">
    <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
      <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
        {value || <span className="text-brand-inactive-text">Não informado</span>}
      </p>
      <p className="text-xs text-brand-inactive-text">{description}</p>
    </div>
    <Button type="button" variant="outline" onClick={onEdit}>Alterar</Button>
  </div>
)

export const Divider = () => <div className="border-t border-brand-border dark:border-dark-border my-4" />

export const Feedback = ({ error, success }: { error: string | null; success: string | null }) => (
  <>
    {error && (
      <div className="flex items-center">
        <InfoCard
          className="w-full"
          message={error}
          color="red"
        />
      </div>
    )}
    {success && (
      <div className="flex items-center">
        <InfoCard
          className="w-full"
          message={success}
          color="green"
        />
      </div>
    )}
  </>
)

export const PageHeader = ({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle: string
  onBack: () => void
}) => (
  <div className="mb-8 flex items-center gap-4">
    <div className="hidden md:flex">
      <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
      </Button>
    </div>
    <div>
      <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">{title}</h1>
      <p className="text-md text-brand-inactive-text mt-1">{subtitle}</p>
    </div>
  </div>
)

export const ProfileCard = ({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: any
  title: string
  description: string
  onClick?: () => void
}) => (
  <div
    onClick={onClick}
    className="group flex items-center gap-4 p-5 rounded-2xl border bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-dark-heading/30 transition-all cursor-pointer h-full"
  >
    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 flex items-center justify-center flex-shrink-0 transition-colors">
      <Icon size={20} className="text-brand-dark dark:text-dark-heading" />
    </div>
    <div className="flex-1">
      <h3 className="text-base font-bold mb-1 text-brand-dark dark:text-dark-heading">{title}</h3>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-tight">{description}</p>
    </div>
    <ChevronRightIcon size={18} className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />
  </div>
)

interface EmailHandlers {
  sendOtp: () => Promise<void>
  verifyOtp: () => Promise<void>
  cancel: () => void
}

export const EmailChangeBlock = ({
  idPrefix,
  currentEmail,
  isChanging,
  onStartChange,
  newEmailVal,
  setNewEmailVal,
  otpSentVal,
  otpVal,
  setOtpVal,
  canResendVal,
  resendTimerVal,
  handlers,
  isLoading,
  error,
  success,
}: {
  idPrefix: string
  currentEmail: string
  isChanging: boolean
  onStartChange: () => void
  newEmailVal: string
  setNewEmailVal: (v: string) => void
  otpSentVal: boolean
  otpVal: string
  setOtpVal: (v: string) => void
  canResendVal: boolean
  resendTimerVal: number
  handlers: EmailHandlers
  isLoading: boolean
  error: string | null
  success: string | null
}) => (
  <AnimatePresence mode="wait">
    {!isChanging ? (
      <motion.div key="email-display" {...fade}>
        <DisplayRow icon={MailIcon} value={currentEmail} description="Email pelo qual você recebe as comunicações." onEdit={onStartChange} />
      </motion.div>
    ) : !otpSentVal ? (
      <motion.div key="email-input" {...fade} className="space-y-4">
        <EmailInput
          label="Novo email"
          id={`${idPrefix}-newEmail`}
          name="newEmail"
          value={newEmailVal}
          onChange={e => setNewEmailVal(e.target.value)}
          placeholder="novo@email.com"
        />
        <Feedback error={error} success={success} />
        <div className="flex gap-2">
          <Button type="button" onClick={handlers.sendOtp} disabled={isLoading || !canResendVal}>
            {isLoading ? "Enviando..." : canResendVal ? "Enviar código" : `Aguarde (${resendTimerVal}s)`}
          </Button>
          <Button type="button" variant="outline" onClick={handlers.cancel}>Cancelar</Button>
        </div>
      </motion.div>
    ) : (
      <motion.div key="email-otp" {...fade} className="space-y-4">
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
          Código enviado para <strong className="text-brand-dark dark:text-dark-heading">{newEmailVal}</strong>
        </p>
        <Input
          label="Código de verificação"
          id={`${idPrefix}-emailOtp`}
          name="emailOtp"
          type="text"
          maxLength={6}
          value={otpVal}
          onChange={e => setOtpVal(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />
        <Feedback error={error} success={success} />
        <div className="flex gap-2">
          <Button type="button" onClick={handlers.verifyOtp} disabled={isLoading}>{isLoading ? "Verificando..." : "Verificar código"}</Button>
          <Button type="button" variant="outline" onClick={handlers.sendOtp} disabled={!canResendVal || isLoading}>
            {canResendVal ? "Reenviar" : `Reenviar (${resendTimerVal}s)`}
          </Button>
          <Button type="button" variant="outline" onClick={handlers.cancel}>Cancelar</Button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
)
