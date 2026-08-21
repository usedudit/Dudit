"use client"

import { motion, AnimatePresence } from "framer-motion"
import { UserIcon, IdentityCardIcon, PhoneIcon } from "@/lib/icons"
import { Button, Input, PhoneInput, CpfCnpjInput } from "@/components/reusable"
import { SectionCard, DisplayRow, Divider, Feedback, PageHeader, EmailChangeBlock, fade, View, EditField } from "./profile-shared"

interface AccountViewProps {
  navigate: (view: View) => void
  accountData: any
  setAccountData: any
  editing: Record<EditField, boolean>
  setEdit: (field: EditField, val: boolean) => void
  isLoading: boolean
  error: string | null
  success: string | null
  isChangingEmail: boolean
  setIsChangingEmail: (v: boolean) => void
  otpSent: boolean
  setOtpSent: (v: boolean) => void
  newEmail: string
  setNewEmail: (v: string) => void
  emailOtp: string
  setEmailOtp: (v: string) => void
  canResend: boolean
  resendTimer: number
  accountEmailHandlers: any
  handleSavePhone: (field: "phone" | "secPhone") => void
  handleSaveName: () => void
  handleSaveCpf: () => void
  clearMessages: () => void
}

export const AccountView = ({
  navigate,
  accountData,
  setAccountData,
  editing,
  setEdit,
  isLoading,
  error,
  success,
  isChangingEmail,
  setIsChangingEmail,
  otpSent,
  setOtpSent,
  newEmail,
  setNewEmail,
  emailOtp,
  setEmailOtp,
  canResend,
  resendTimer,
  accountEmailHandlers,
  handleSavePhone,
  handleSaveName,
  handleSaveCpf,
  clearMessages,
}: AccountViewProps) => (
  <motion.div key="account" {...fade} className="w-full">
    <PageHeader title="Informações da conta" subtitle="Gerencie seus dados pessoais e de contato." onBack={() => navigate("main")} />

    <SectionCard title="Dados da conta">
      <div className="space-y-4">
        <EmailChangeBlock
          idPrefix="acc"
          currentEmail={accountData.email}
          isChanging={isChangingEmail}
          onStartChange={() => { setIsChangingEmail(true); setOtpSent(false); setNewEmail(""); setEmailOtp(""); clearMessages() }}
          newEmailVal={newEmail}
          setNewEmailVal={setNewEmail}
          otpSentVal={otpSent}
          otpVal={emailOtp}
          setOtpVal={setEmailOtp}
          canResendVal={canResend}
          resendTimerVal={resendTimer}
          handlers={accountEmailHandlers}
          isLoading={isLoading}
          error={error}
          success={success}
        />

        <Divider />

        <AnimatePresence mode="wait">
          {!editing.phone ? (
            <motion.div key="phone-display" {...fade}>
              <DisplayRow icon={PhoneIcon} value={accountData.phone} description="Seu telefone de contato." onEdit={() => setEdit("phone", true)} />
            </motion.div>
          ) : (
            <motion.div key="phone-edit" {...fade} className="space-y-4">
              <PhoneInput
                label="Telefone"
                id="phone"
                name="phone"
                placeholder="(00) 00000-0000"
                value={accountData.phone}
                onChange={e => setAccountData((d: any) => ({ ...d, phone: e.target.value }))}
              />
              <Feedback error={error} success={success} />
              <div className="flex gap-2">
                <Button type="button" onClick={() => handleSavePhone("phone")} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar"}</Button>
                <Button type="button" variant="outline" onClick={() => setEdit("phone", false)}>Cancelar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionCard>

    <SectionCard title="Informações pessoais">
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {!editing.name ? (
            <motion.div key="name-display" {...fade}>
              <DisplayRow icon={UserIcon} value={accountData.fullName} description="Seu nome completo exibido na conta." onEdit={() => setEdit("name", true)} />
            </motion.div>
          ) : (
            <motion.div key="name-edit" {...fade} className="space-y-4">
              <Input
                label="Nome completo *"
                id="fullName"
                name="fullName"
                value={accountData.fullName}
                onChange={e => setAccountData((d: any) => ({ ...d, fullName: e.target.value }))}
              />
              <Feedback error={error} success={success} />
              <div className="flex gap-2">
                <Button type="button" onClick={handleSaveName} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar"}</Button>
                <Button type="button" variant="outline" onClick={() => setEdit("name", false)}>Cancelar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Divider />

        <AnimatePresence mode="wait">
          {!editing.cpf ? (
            <motion.div key="cpf-display" {...fade}>
              <DisplayRow icon={IdentityCardIcon} value={accountData.cpf} description="Seu CPF cadastrado na conta." onEdit={() => setEdit("cpf", true)} />
            </motion.div>
          ) : (
            <motion.div key="cpf-edit" {...fade} className="space-y-4">
              <CpfCnpjInput
                label="CPF"
                id="cpf"
                name="cpf"
                placeholder="000.000.000-00"
                value={accountData.cpf}
                onChange={e => setAccountData((d: any) => ({ ...d, cpf: e.target.value }))}
              />
              <Feedback error={error} success={success} />
              <div className="flex gap-2">
                <Button type="button" onClick={handleSaveCpf} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar"}</Button>
                <Button type="button" variant="outline" onClick={() => setEdit("cpf", false)}>Cancelar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionCard>
  </motion.div>
)
