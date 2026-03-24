"use client"

import { Button } from "@/components/reusable"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useEffect, useState, useRef } from "react"
import type { User } from "@supabase/supabase-js"
import { ShoppingCart } from "@/lib/icons"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useCart } from "@/hooks/use-cart"
import { useSupabase } from "@/providers/supabase-provider"
import { createClient } from "@/lib/supabase/client"

export function Header() {
    const router = useRouter()
    const { user, sessionData, supabase: contextSupabase } = useSupabase()
    const [userName, setUserName] = useState<string>("")
    const [theme, setTheme] = useState<"light" | "dark">("light")
  
    const { profile } = useUserProfile()
    const { cartCount } = useCart()

    const isPartner = !!sessionData?.isPartner

    useEffect(() => {
        if (user) {
            if (profile?.full_name) {
                setUserName(profile.full_name)
            } else {
                setUserName(user.user_metadata?.full_name || user.email || "Usuário")
            }
        }
    }, [user, profile])

    useEffect(() => {
        // Carregar tema salvo
        const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null
        if (savedTheme) {
            setTheme(savedTheme)
            document.documentElement.classList.toggle("dark", savedTheme === "dark")
        }
    }, [])

    const handleSignOut = async () => {
        await contextSupabase.auth.signOut()
        router.push("/")
    }

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
    localStorage.setItem("theme", newTheme)
    document.documentElement.classList.toggle("dark", newTheme === "dark")
  }

  const handlePartnerClick = () => {
    if (isPartner) {
      // Se tem acesso a algum ERP (próprio ou convidado), vai pro switch que decide o fluxo
      router.push("/erp/switch")
    } else {
      // Se não é parceiro (logado ou não), vai pro login com modo partner
      router.push("/auth/login?mode=partner")
    }
  }

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold" prefetch={false}>
          Lookali
        </Link>

        <nav className="flex items-center gap-4">
          <Button onClick={handlePartnerClick} variant="outline">
            {isPartner ? "Central do Parceiro" : "Seja Parceiro"}
          </Button>

          {user && (
            <Button asChild variant="outline" className="relative bg-transparent">
              <Link href="/cart" prefetch={false}>
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </Button>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">{userName}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account/settings" prefetch={false}>Configurações da Conta</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile" prefetch={false}>Perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-orders" prefetch={false}>Meus Pedidos</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/cart" prefetch={false}>Sacola</Link>
                </DropdownMenuItem>
                {isPartner && (
                  <DropdownMenuItem asChild>
                    <Link href="/erp/settings" prefetch={false}>Configurações da Loja</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleTheme}>
                  Tema: {theme === "light" ? "Claro" : "Escuro"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/auth/login?mode=login" prefetch={false}>Entrar</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/login?mode=signup" prefetch={false}>Criar conta</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
