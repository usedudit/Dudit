"use client"

import { motion } from "framer-motion"
import { UserIcon, MapPinIcon, LockIcon, StarIcon, NotificationIcon } from "@/lib/icons"
import { fade, View } from "./profile-shared"
import { ListItem } from "../reusable"

interface MainViewProps {
  navigate: (view: View) => void
}

export const MainView = ({ navigate }: MainViewProps) => (
  <motion.div key="main" {...fade}>
    <div className="hidden lg:block items-center mb-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
          Meu perfil
        </h1>
        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">Gerencie suas informações pessoais e configurações de segurança.</p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ListItem icon={UserIcon} title="Informações da conta" description="Gerencie seus dados pessoais, email e telefone de contato." className="px-4 py-3 gap-4" onClick={() => navigate("informacoes-da-conta")} showChevron />
      <ListItem icon={MapPinIcon} title="Endereço" description="Atualize seu endereço de entrega ou cobrança." className="px-4 py-3 gap-4" onClick={() => navigate("enderecos")} showChevron />
      <ListItem icon={LockIcon} title="Segurança" description="Altere sua senha de acesso à conta." className="px-4 py-3 gap-4" onClick={() => navigate("seguranca")} showChevron />
      <ListItem icon={StarIcon} title="Minhas avaliações" description="Veja e edite suas avaliações de produtos e serviços." className="px-4 py-3 gap-4" onClick={() => navigate("avaliacoes")} showChevron />
      <ListItem icon={NotificationIcon} title="Notificações" description="Gerencie suas preferências de notificação por categoria." className="px-4 py-3 gap-4" onClick={() => navigate("notificacoes")} showChevron />
    </div>
  </motion.div>
)