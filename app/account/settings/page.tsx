"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Header } from "@/components/header"
import { Button, PhoneInput } from "@/components/reusable"
import { Input } from "@/components/reusable"
import { useToast } from "@/components/ui/use-toast"
import type { User } from "@supabase/supabase-js"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"


// force-dynamic removed — has no effect in client components

export default function AccountSettingsPage() {
  const { user: authUser, supabase: supabaseClient } = useSupabase()
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
  })
  const [originalFormData, setOriginalFormData] = useState(formData)

  useEffect(() => {
    if (authUser === undefined) return // Aguarda o carregamento do provedor

    if (!authUser) {
      router.push("/auth/login")
      return
    }

    const fetchUserData = async () => {
      try {
        setUser(authUser)

        // Fetch user profile
        const { data: profile } = await supabaseClient
          .from("user_profiles")
          .select("full_name, phone")
          .eq("user_id", authUser.id)
          .maybeSingle()

        if (profile) {
          const newFormData = {
            firstName: profile.full_name ? profile.full_name.split(" ")[0] : "",
            lastName: profile.full_name ? profile.full_name.split(" ").slice(1).join(" ") : "",
            email: authUser.email || "",
            phone: profile.phone || "",
            birthDate: "",
          }
          setFormData(newFormData)
          setOriginalFormData(newFormData)
        } else {
          setFormData((prev) => ({ ...prev, email: authUser.email || "" }))
          setOriginalFormData((prev) => ({ ...prev, email: authUser.email || "" }))
        }
      } catch (error) {
        console.error("Error fetching user data:", error)
        toast({
          title: "Erro",
          description: "Erro ao carregar dados da conta",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [authUser, router, toast, supabaseClient])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSaveChanges = async () => {
    if (!authUser || !supabaseClient) return

    setIsSaving(true)
    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim()

      const { error } = await supabaseClient
        .from("user_profiles")
        .update({
          full_name: fullName,
          phone: formData.phone,
        })
        .eq("user_id", authUser.id)

      if (error) throw error

      setOriginalFormData(formData)
      toast({
        title: "Sucesso",
        description: "Dados da conta atualizados com sucesso",
      })
    } catch (error) {
      console.error("Error saving profile:", error)
      toast({
        title: "Erro",
        description: "Erro ao salvar dados da conta",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-page-bg dark:bg-dark-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <p className="text-brand-inactive-text dark:text-dark-body">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-page-bg dark:bg-dark-background">
      <Header />

      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="flex-shrink-0 p-3 w-10 h-10">
              <ChevronLeftIcon className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-heading">ConfiguraÃ§Ãµes da Conta</h1>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                Gerencie seus dados pessoais e preferÃªncias
              </p>
            </div>
          </div>

          {/* Main Settings Card */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-6 space-y-6">
            {/* InformaÃ§Ãµes Pessoais */}
            <div>
              <h2 className="text-lg font-semibold text-brand-dark dark:text-dark-heading mb-4">
                InformaÃ§Ãµes Pessoais
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Primeiro Nome"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="Seu primeiro nome"
                  />
                  <Input
                    label="Ãšltimo Nome"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Seu Ãºltimo nome"
                  />
                </div>

                <Input
                  label="E-mail"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled
                  placeholder="Seu e-mail"
                />

                <PhoneInput
                  label="Telefone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+55 (00) 00000-0000"
                />

                <Input
                  label="Data de Nascimento"
                  name="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-brand-border dark:border-dark-border"></div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setFormData(originalFormData)}
                disabled={!hasChanges || isSaving}
              >
                Descartar AlteraÃ§Ãµes
              </Button>
              <Button
                onClick={handleSaveChanges}
                disabled={!hasChanges || isSaving}
                leftIcon={<SaveIcon className="w-4 h-4" />}
              >
                {isSaving ? "Salvando..." : "Salvar AlteraÃ§Ãµes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
