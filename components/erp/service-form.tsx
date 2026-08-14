"use client"

import type React from "react"
import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button, InfoCard } from "@/components/reusable"
import { Card, CardContent } from "@/components/ui/card"
import { Input, MoneyInput } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createServiceAction } from "@/app/actions/erp/servicos"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"
import { CSRFTokenInput } from "@/components/security/csrf-token-input"

interface ServiceFormProps {
  partnerId: string
}

export function ServiceForm({ partnerId }: ServiceFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
  })

  const initialSnapshot = useMemo(() => JSON.stringify({
    name: "",
    description: "",
    price: 0,
  }), [])

  const currentSnapshot = useMemo(() => JSON.stringify(formData), [formData])
  const isDirty = currentSnapshot !== initialSnapshot

  const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)
  const handleBack = useCallback(() => handleNavigation("/erp/servicos" as any), [handleNavigation])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const result = await createServiceAction({ ...formData, partnerId })

      if ((result as any).error) {
        setError((result as any).error)
      } else {
        router.push("/erp/servicos")
        // No router.refresh() needed - push already navigates
      }
    } catch (err) {
      console.error("ServiceForm: Erro na exception:", err)
      setError("Erro ao salvar serviço")
    } finally {
      setIsLoading(false)
    }
  }



  return (
    <form onSubmit={handleSubmit}>
      <CSRFTokenInput />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do serviço*</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={150}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="price">Preço (R$)*</Label>
            <MoneyInput
              id="price"
              name="price"
              required
              value={formData.price}
              onChange={(val) => setFormData({ ...formData, price: val })}
            />
          </div>

          {error && <InfoCard message={error} color="red" />}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={handleBack}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? "Salvando..." : "Criar serviço"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
    </form>
  )
}
