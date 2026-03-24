"use client"

import { motion } from "framer-motion"
import { LockIcon } from "@/lib/icons"
import { SectionCard, PageHeader, fade, View } from "./profile-shared"

interface TwoFactorViewProps {
  navigate: (view: View) => void
}

export const TwoFactorView = ({ navigate }: TwoFactorViewProps) => (
  <motion.div key="two-factor" {...fade} className="max-w-[800px] mx-auto space-y-6">
    <PageHeader title="Autenticação 2FA" subtitle="Adicione uma camada extra de segurança na sua conta usando um aplicativo autenticador." onBack={() => navigate("main")} />
    <SectionCard title="Autenticação em Duas Etapas">
      <div className="flex items-center gap-4 py-2">
        <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <LockIcon size={20} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Funcionalidade em desenvolvimento</p>
      </div>
    </SectionCard>
  </motion.div>
)
