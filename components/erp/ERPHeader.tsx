"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { MenuIcon, MoonIcon, LogoutIcon, NotificationIcon, ChevronDownIcon, ChevronLeftIcon, UserIcon, CreditCardIcon, HelpCircleIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "../reusable/Dropdown"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { StoreSwitcher } from "../store-switcher"
import { getUserInitials, getAvatarColor } from "@/lib/utils/user-profile-image"
import { useSidebar } from "@/lib/sidebar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { cn } from "@/lib/utils"
import BottomSheet from "../BottomSheet"

// Ícone selector (duas setas)
const ChevronsUpDown = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </svg>
)

const ChevronRight = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)

interface ERPHeaderProps {
  sidebarOpen?: boolean
  setSidebarOpen?: (arg: boolean) => void
  pageTitle?: string
  backHref?: string // Link to go back (e.g., /erp/products)
  onBack?: () => void // Custom back logic (e.g. discard changes)
  isSubPage?: boolean // Force ChevronLeftIcon even without backHref
  userProfile?: {
    fullName: string
    email: string
    initials: string
    avatarColor: string
  }
}

export function ERPHeader({ sidebarOpen, setSidebarOpen, pageTitle = "", backHref, onBack, isSubPage, userProfile }: ERPHeaderProps) {
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const { profile, isLoading: isProfileLoading } = useUserProfile(userProfile ? { full_name: userProfile.fullName, address: null } : null)

  const [userName, setUserName] = useState(userProfile?.fullName || profile?.full_name || "Usuário")
  const [userEmail, setUserEmail] = useState(userProfile?.email || "")
  const [userInitials, setUserInitials] = useState(userProfile?.initials || getUserInitials(userProfile?.fullName || profile?.full_name || "U"))
  const [avatarColor, setAvatarColor] = useState(userProfile?.avatarColor || getAvatarColor(userProfile?.fullName || profile?.full_name || "Usuário"))
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { setIsMobileOpen, headerOverride } = useSidebar()

  // Update local state when profile data arrives
  useEffect(() => {
    if (profile?.full_name && !userProfile?.fullName) {
      setUserName(profile.full_name)
      setUserInitials(getUserInitials(profile.full_name))
      setAvatarColor(getAvatarColor(profile.full_name))
    }
  }, [profile, userProfile])
  // supabase singleton imported directly

  const handleThemeChange = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isTransitioning) return

    // @ts-ignore
    if (!document.startViewTransition) {
      setTheme(theme === "dark" ? "light" : "dark")
      return
    }

    const x = event.clientX
    const y = event.clientY
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    setIsTransitioning(true)

    // @ts-ignore
    const transition = document.startViewTransition(() => {
      setTheme(theme === "dark" ? "light" : "dark")
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

  const handleThemeButtonClick = (newTheme: string) => {
    if (isTransitioning) return

    // @ts-ignore
    if (!document.startViewTransition) {
      setTheme(newTheme)
      return
    }

    const x = window.innerWidth - 24
    const y = 24
    const endRadius = Math.hypot(x, window.innerHeight - y)

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  const displayTitle = headerOverride?.title || pageTitle || "Painel"
  const displayBackHref = headerOverride?.backHref || backHref
  const displayOnBack = headerOverride?.onBack || onBack
  const displayIsSubPage = headerOverride?.isSubPage || isSubPage
  const showBackButton = !!(displayBackHref || displayOnBack || displayIsSubPage)

  return (
    <header className="sticky top-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 relative">
          <div className="flex items-center gap-3">
            {showBackButton ? (
              <button
                className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading md:hidden"
                onClick={() => {
                  if (displayOnBack) displayOnBack()
                  else if (displayBackHref) router.push(displayBackHref)
                  else router.back()
                }}
              >
                <ChevronLeftIcon className="w-6 h-6" />
              </button>
            ) : (
              <button
                className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading md:hidden"
                aria-controls="sidebar"
                aria-expanded={sidebarOpen}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsMobileOpen(true)
                  if (setSidebarOpen) setSidebarOpen(!sidebarOpen)
                }}
              >
                <MenuIcon className="w-6 h-6" />
              </button>
            )}

            {/* --- ÁREA DO BREADCRUMB CORRIGIDA --- */}
            <div className="hidden md:flex items-center gap-2">

              {/* Botão Unificado (Ícone + Nome + Setas) */}
              <button
                className="group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-1.5 h-full">
                  {/* 2. Nome do Local (Alinhado) */}
                  {/* Envolto em div para garantir pointer-events-none se necessário para evitar hover duplo */}
                  <div className="text-sm font-semibold text-brand-dark dark:text-dark-heading leading-none pb-[1px]">
                    <StoreSwitcher />
                  </div>

                  {/* 3. Ícone Duas Setas (Selector) */}
                  <ChevronsUpDown className="w-4 h-4 text-brand-inactive-text/70 dark:text-dark-body/70" />
                </div>
              </button>

              {/* Separador Chevron Right */}
              <ChevronRight className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

              {/* Título da Página */}
              <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                {displayTitle}
              </h1>

            </div>
            {/* ------------------------------------ */}
          </div>

          {/* Mobile centered title */}
          <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 md:hidden">
            <h1 className="text-lg sm:text-xl font-bold text-brand-dark dark:text-dark-heading whitespace-nowrap">
              {displayTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-full w-9 h-9 p-0 hidden md:flex items-center justify-center"
            >
              <NotificationIcon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
            </Button>

            <div className="h-6 w-px bg-brand-border dark:border-dark-border" />

            <div className="md:hidden flex items-center" onClick={() => setIsProfileOpen(true)}>
              <div
                className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm cursor-pointer border border-brand-border dark:border-dark-border shadow-sm`}
              >
                {userInitials || getUserInitials(userName)}
              </div>
            </div>

            <Dropdown
              trigger={
                <div className="hidden md:flex items-center space-x-2 p-1 cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors group">
                  <div
                    className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border group-hover:shadow-sm transition-all`}
                  >
                    {userInitials || getUserInitials(userName)}
                  </div>
                  <ChevronDownIcon
                    className="w-4 h-4 mr-2 text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors"
                  />
                </div>
              }
              align="right"
              showChevron={false}
              width="w-64"
            >
              <div className="px-4 py-3 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border shadow-sm`}
                  >
                    {userInitials || getUserInitials(userName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                        {userName}
                      </p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white whitespace-nowrap">
                        PRO
                      </span>
                    </div>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{userEmail}</p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Modo escuro</span>
                  </div>
                  <button
                    onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${theme === "dark" ? "bg-brand-green" : "bg-gray-300 dark:bg-dark-border"
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-1"
                        }`}
                    />
                  </button>
                </div>
              </div>

              <div className="py-2">
                <DropdownItem>
                  <Link href="/profile" prefetch={true} className="flex items-center gap-3 w-full">
                    <UserIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                    <span className="text-[14px] font-normal text-brand-inactive-text hover:text-brand-dark">Meu perfil</span>
                  </Link>
                </DropdownItem>
                <DropdownItem onClick={() => { }}>
                  <CreditCardIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                  <span className="text-[14px] font-normal text-brand-inactive-text hover:text-brand-dark">Meu plano</span>
                </DropdownItem>
                <DropdownItem onClick={() => { }}>
                  <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                  <span className="text-[14px] font-normal text-brand-inactive-text hover:text-brand-dark">Central de ajuda</span>
                </DropdownItem>
              </div>

              <div className="py-2 border-t border-brand-border dark:border-dark-border mt-1">
                <DropdownItem
                  onClick={handleSignOut}
                  className="text-brand-red dark:text-brand-red"
                >
                  <div className="w-4 h-4 bg-red-500 rounded flex items-center justify-center shadow-sm">
                    <LogoutIcon className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[14px] font-semibold">Sair da sessão</span>
                </DropdownItem>
              </div>

              <div className="px-4 py-3 border-t border-brand-border dark:border-dark-border">
                <div className="flex items-center justify-between text-[10px] text-brand-inactive-text/60 dark:text-dark-body/60 font-medium">
                  <span>v.1.5.69</span>
                  <span>•</span>
                  <span>Termos e Condições</span>
                </div>
              </div>
            </Dropdown>
          </div>
        </div>
      </div>
      <BottomSheet isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)}>
        <div className="flex flex-col py-1">
          <div className="flex items-center space-x-4 mb-6 px-2 mt-4">
            <div
              className={`w-14 h-14 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-xl border border-brand-border dark:border-dark-border shadow-md`}
            >
              {userInitials || getUserInitials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">
                  {userName}
                </p>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-500 text-white whitespace-nowrap">
                  PRO
                </span>
              </div>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body truncate">{userEmail}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-dark-border/30 border border-transparent hover:border-brand-border/30 dark:hover:border-dark-border/50 transition-all">
              <div className="flex items-center gap-3">
                <MoonIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Modo escuro</span>
              </div>
              <button
                onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${theme === "dark" ? "bg-brand-green" : "bg-gray-300 dark:bg-dark-border"
                  }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            <Link
              href="/profile"
              onClick={() => setIsProfileOpen(false)}
              prefetch={true}
              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-all w-full text-left"
            >
              <UserIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Meu perfil</span>
            </Link>

            <button
              onClick={() => setIsProfileOpen(false)}
              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-all w-full text-left"
            >
              <CreditCardIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Meu plano</span>
            </button>

            <button
              onClick={() => setIsProfileOpen(false)}
              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-all w-full text-left"
            >
              <HelpCircleIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Central de ajuda</span>
            </button>

            <div className="h-px bg-brand-border dark:bg-dark-border my-2 mx-2 opacity-50" />

            <button
              onClick={handleSignOut}
              className="flex items-center gap-4 p-4 rounded-2xl bg-red-50/50 dark:bg-red-900/10 text-brand-red w-full text-left transition-all hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center shadow-sm">
                <LogoutIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[16px] font-bold">Sair da sessão</span>
            </button>
          </nav>

          <div className="mt-8 mb-4 px-4 flex items-center justify-between text-[11px] text-brand-inactive-text/50 dark:text-dark-body/50 font-medium tracking-wide">
            <span>versão 1.5.69</span>
            <span className="hover:underline cursor-pointer">Termos e Condições</span>
          </div>
        </div>
      </BottomSheet>
    </header>
  )
}