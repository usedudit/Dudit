"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-notification"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PhoneInput, EmailInput, CpfCnpjInput } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createSupplierAction, updateSupplierAction } from "@/app/actions/erp/suppliers"
import { CSRFTokenInput } from "@/components/security/csrf-token-input"

interface SupplierFormProps {
  partnerId: string
  supplier?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    cnpj: string | null
    address: string | null
    notes: string | null
  }
}

export function SupplierForm({ partnerId, supplier }: SupplierFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const [name, setName] = useState(supplier?.name || "")
  const [email, setEmail] = useState(supplier?.email || "")
  const [phone, setPhone] = useState(supplier?.phone || "")
  const [cnpj, setCnpj] = useState(supplier?.cnpj || "")
  const [address, setAddress] = useState(supplier?.address || "")
  const [notes, setNotes] = useState(supplier?.notes || "")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const data = {
      name,
      email: email || undefined,
      phone: phone || undefined,
      cnpj: cnpj || undefined,
      address: address || undefined,
      notes: notes || undefined,
    }

    const result = supplier
      ? await updateSupplierAction(supplier.id, {
        ...data,
        email: data.email || "",
        phone: data.phone || "",
        cnpj: data.cnpj || "",
        address: data.address || "",
        notes: data.notes || "",
      } as any)
      : await createSupplierAction({
        ...data,
        email: data.email || "",
        phone: data.phone || "",
        cnpj: data.cnpj || "",
        address: data.address || "",
        notes: data.notes || "",
        partnerId
      })

    if (result.error) {
      toast.error("Erro ao salvar fornecedor", result.error)
      setIsLoading(false)
    } else {
      router.push("/erp/fornecedores")
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <CSRFTokenInput />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome*</Label>
            <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <EmailInput id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Telefone</Label>
            <PhoneInput id="phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <CpfCnpjInput id="cnpj" name="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Endereço</Label>
            <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Salvando..." : supplier ? "Atualizar Fornecedor" : "Criar Fornecedor"}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}
