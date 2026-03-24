"use client"

import { motion } from "framer-motion"
import { UserIcon, MapPin, LockIcon } from "@/lib/icons"
import { ProfileCard, fade, View } from "./profile-shared"

interface MainViewProps {
  navigate: (view: View) => void
}

export const MainView = ({ navigate }: MainViewProps) => (
  <motion.div key="main" {...fade}>
    {/* Header */}
    <div className="flex items-center mb-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
          Meu perfil
        </h1>
        <p className="text-md text-brand-inactive-text mt-1">Gerencie suas informações pessoais e configurações de segurança.</p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ProfileCard icon={UserIcon} title="Informações da conta" description="Gerencie seus dados pessoais, email e telefone de contato." onClick={() => navigate("account")} />
      <ProfileCard icon={MapPin} title="Endereço" description="Atualize seu endereço de entrega ou cobrança." onClick={() => navigate("address")} />
      <ProfileCard icon={LockIcon} title="Segurança" description="Altere sua senha de acesso à conta." onClick={() => navigate("password")} />
      <ProfileCard icon={LockIcon} title="Autenticação 2FA" description="Adicione uma camada extra de segurança com autenticador." onClick={() => navigate("two-factor")} />
    </div>
  </motion.div>
)
