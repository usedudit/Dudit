"use client"

import type React from "react"

import { useState, useRef, useMemo } from "react"
import { Button, InfoCard } from "@/components/reusable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input, Checkbox, CpfCnpjInput, UnsavedChangesDialog, SavingStatusModal } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { useRouter } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useNotification } from "@/hooks/use-notification"
import { uploadImageToR2Action } from "@/app/actions/shared/r2"
import { CSRFTokenInput } from "@/components/security/csrf-token-input"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"

interface SettingsFormProps {
  partner: any
  paymentMethods: string[]
}

export function SettingsForm({ partner, paymentMethods: initialPaymentMethods }: SettingsFormProps) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const businessInfo = typeof partner.business_info === "string" 
    ? JSON.parse(partner.business_info) 
    : (partner.business_info || { sells: ["products"], channels: ["online"] })

  const [formData, setFormData] = useState({
    storeName: partner.store_name || "",
    storeDescription: partner.store_description || "",
    address: partner.address || "",
    businessType: partner.business_type || "pf",
    cnpj: partner.cnpj || "",
    openingHours: partner.opening_hours ? JSON.stringify(partner.opening_hours) : "",
    storeImageUrl: partner.store_image_url || "",
    businessInfo: {
      sells: Array.isArray(businessInfo.sells) ? businessInfo.sells : ["products"],
      channels: Array.isArray(businessInfo.channels) ? businessInfo.channels : ["online"],
    },
    paymentMethods: initialPaymentMethods || [],
  })

  const initialSnapshot = useMemo(() => JSON.stringify({
    storeName: partner.store_name || "",
    storeDescription: partner.store_description || "",
    address: partner.address || "",
    businessType: partner.business_type || "pf",
    cnpj: partner.cnpj || "",
    openingHours: partner.opening_hours ? JSON.stringify(partner.opening_hours) : "",
    storeImageUrl: partner.store_image_url || "",
    businessInfo: {
      sells: Array.isArray(businessInfo.sells) ? businessInfo.sells : ["products"],
      channels: Array.isArray(businessInfo.channels) ? businessInfo.channels : ["online"],
    },
    paymentMethods: initialPaymentMethods || [],
  }), [partner, businessInfo, initialPaymentMethods])

  const currentSnapshot = useMemo(() => JSON.stringify(formData), [formData])
  const isDirty = currentSnapshot !== initialSnapshot
  const { showConfirmDialog, confirmNavigation, cancelNavigation } = useUnsavedChanges(isDirty)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (formData.businessInfo.sells.length === 0 || formData.businessInfo.channels.length === 0) {
        setError("Selecione pelo menos um tipo de oferta e um canal de venda.")
        setIsLoading(false)
        return
      }

      const result = await updatePartnerAction(partner.id, {
        storeName: formData.storeName,
        storeDescription: formData.storeDescription,
        address: formData.address,
        businessType: formData.businessType as "pf" | "pj",
        cnpj: formData.businessType === "pj" ? formData.cnpj : null,
        openingHours: formData.openingHours ? JSON.parse(formData.openingHours) : null,
        storeImageUrl: formData.storeImageUrl || null,
        businessInfo: formData.businessInfo,
        userId: "",
      })

      if (result.error) {
        setError(result.error)
        notifyError("Erro ao salvar", result.error)
      } else {
        notifySuccess("Sucesso", "Configurações atualizadas com sucesso!")
        // No router.refresh() needed - revalidation will update
      }
    } catch (err) {
      setError("Erro ao atualizar configurações")
    } finally {
      setIsLoading(false)
    }
  }

  const togglePaymentMethod = (method: string) => {
    setFormData((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }))
  }

  const toggleBusinessInfo = (type: "sells" | "channels", value: string) => {
    setFormData((prev) => {
      const current = prev.businessInfo[type]
      const updated = current.includes(value)
        ? current.filter((item: string) => item !== value)
        : [...current, value]

      return {
        ...prev,
        businessInfo: {
          ...prev.businessInfo,
          [type]: updated
        }
      }
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]

    // Validar tamanho (3MB máximo)
    if (file.size > 3 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 3MB")
      return
    }

    // Validar tipo
    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione uma imagem válida")
      return
    }

    setImageUploading(true)
    setError(null)

    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Image = reader.result as string

        const uploadResult = await uploadImageToR2Action(base64Image, "partners")

        if (uploadResult.success) {
          setFormData((prev) => ({
            ...prev,
            storeImageUrl: uploadResult.publicId,
          }))
        } else {
          throw new Error(uploadResult.error || "Erro ao fazer upload da imagem")
        }
        setImageUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error("Erro ao fazer upload da imagem:", err)
      setError("Erro ao fazer upload da imagem. Tente novamente.")
      setImageUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações da loja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="storeName">Nome da loja*</Label>
              <Input
                id="storeName"
                name="storeName"
                required
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="storeDescription">Descrição</Label>
              <Textarea
                id="storeDescription"
                rows={4}
                value={formData.storeDescription}
                onChange={(e) => setFormData({ ...formData, storeDescription: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Endereço*</Label>
              <Input
                id="address"
                name="address"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="storeImage">Foto da loja</Label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                hidden
                accept="image/*"
                disabled={imageUploading}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="flex-1"
                >
                  {imageUploading ? "Enviando..." : "Escolher imagem"}
                </Button>
                {formData.storeImageUrl && (
                  <Button type="button" variant="ghost" onClick={() => setFormData({ ...formData, storeImageUrl: "" })}>
                    Remover
                  </Button>
                )}
              </div>
              {formData.storeImageUrl && (
                <div className="mt-2">
                  <img
                    src={getR2ImageUrl(formData.storeImageUrl) || "https://img.dudit.com.br/static/Placeholder.png"}
                    alt="Prévia da foto da loja"
                    className="w-full h-48 object-cover rounded-md"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="openingHours">Horários (JSON)</Label>
              <Textarea
                id="openingHours"
                rows={3}
                value={formData.openingHours}
                onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipo de negócio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={formData.businessType}
              onValueChange={(value) => setFormData({ ...formData, businessType: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pf" id="pf" />
                <Label htmlFor="pf">Pessoa Física</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pj" id="pj" />
                <Label htmlFor="pj">Pessoa Jurídica</Label>
              </div>
            </RadioGroup>

            {formData.businessType === "pj" && (
              <div className="grid gap-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <CpfCnpjInput
                  id="cnpj"
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>O que você oferece?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sellsProducts"
                name="sellsProducts"
                checked={formData.businessInfo.sells.includes("products")}
                onChange={() => toggleBusinessInfo("sells", "products")}
              />
              <Label htmlFor="sellsProducts">Vende produtos físicos</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="providesServices"
                name="providesServices"
                checked={formData.businessInfo.sells.includes("services")}
                onChange={() => toggleBusinessInfo("sells", "services")}
              />
              <Label htmlFor="providesServices">Presta serviços</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Canais de venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="channelOnline"
                name="channelOnline"
                checked={formData.businessInfo.channels.includes("online")}
                onChange={() => toggleBusinessInfo("channels", "online")}
              />
              <Label htmlFor="channelOnline">Vitrine Online (Marketplace)</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="channelPdv"
                name="channelPdv"
                checked={formData.businessInfo.channels.includes("pdv")}
                onChange={() => toggleBusinessInfo("channels", "pdv")}
              />
              <Label htmlFor="channelPdv">Ponto de Venda (PDV)</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meios de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito", "Boleto"].map((method) => (
              <div key={method} className="flex items-center space-x-2">
                <Checkbox
                  id={method}
                  name={method}
                  checked={formData.paymentMethods.includes(method)}
                  onChange={() => togglePaymentMethod(method)}
                />
                <Label htmlFor={method}>{method}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && <InfoCard message={error} color="red" />}

        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>

      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
      <SavingStatusModal isOpen={isLoading} text="Salvando configurações..." />
    </form>
  )
}
