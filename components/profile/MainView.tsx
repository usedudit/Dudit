"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"
import { UserIcon, MapPinIcon, LockIcon, StarIcon, NotificationIcon, MoonIcon } from "@/lib/icons"
import { fade, View } from "./profile-shared"
import { ListItem } from "../reusable"

interface MainViewProps {
  navigate: (view: View) => void
}

export const MainView = ({ navigate }: MainViewProps) => {
  const { theme, setTheme } = useTheme()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const isDark = theme === "dark"

  const handleThemeToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isTransitioning) return

    const newTheme = isDark ? "light" : "dark"

    // @ts-ignore
    if (!document.startViewTransition) {
      setTheme(newTheme)
      return
    }

    const x = event.clientX
    const y = event.clientY
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    setIsTransitioning(true)

    // @ts-ignore
    const transition = document.startViewTransition(() => {
      setTheme(newTheme)
    })

    transition.ready.then(() => {
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      document.documentElement.animate(
        { clipPath: clipPath },
        {
          duration: 500,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      )
    })

    transition.finished.finally(() => {
      setIsTransitioning(false)
    })
  }

  return (
    <motion.div key="main" {...fade}>
      <div className="hidden lg:block items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
            Meu perfil
          </h1>
          <p className="text-md text-brand-inactive-text mt-1">Gerencie suas informações pessoais e configurações de segurança.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ListItem icon={UserIcon} title="Informações da conta" description="Gerencie seus dados pessoais, email e telefone de contato." className="px-4 py-3 gap-4" onClick={() => navigate("informacoes-da-conta")} showChevron />
        <ListItem icon={MapPinIcon} title="Endereço" description="Atualize seu endereço de entrega ou cobrança." className="px-4 py-3 gap-4" onClick={() => navigate("enderecos")} showChevron />
        <ListItem icon={LockIcon} title="Segurança" description="Altere sua senha de acesso à conta." className="px-4 py-3 gap-4" onClick={() => navigate("seguranca")} showChevron />
        <ListItem icon={LockIcon} title="Autenticação 2FA" description="Adicione uma camada extra de segurança com autenticador." className="px-4 py-3 gap-4" onClick={() => navigate("two-factor")} showChevron />
        <ListItem icon={StarIcon} title="Minhas avaliações" description="Veja e edite suas avaliações de produtos e serviços." className="px-4 py-3 gap-4" onClick={() => navigate("avaliacoes")} showChevron />
        <ListItem icon={NotificationIcon} title="Notificações" description="Gerencie suas preferências de notificação por categoria." className="px-4 py-3 gap-4" onClick={() => navigate("notificacoes")} showChevron />
        <ListItem
          icon={MoonIcon}
          title="Modo escuro"
          description={isDark ? "Ativado" : "Desativado"}
          className="px-4 py-3 gap-4"
          right={
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label="Alternar modo escuro"
              onClick={handleThemeToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDark ? "bg-brand-green" : "bg-gray-300 dark:bg-dark-border"
                }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${isDark ? "translate-x-5" : "translate-x-1"
                  }`}
              />
            </button>
          }
        />
      </div>
    </motion.div>
  )
}