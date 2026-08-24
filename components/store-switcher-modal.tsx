"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PhoneInput, InfoCard } from "@/components/reusable"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { ImageCropperModal } from "./ImageCropperModal"
import { uploadImageToR2Action } from "@/app/actions/shared/r2"
import { isGifFile } from "@/lib/security/file-validator"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { validateBrazilMobile } from "@/lib/input-validator"

interface NewStoreModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  onStoreCreated: () => void
}

export function NewStoreModal({ isOpen, onClose, partnerId, onStoreCreated }: NewStoreModalProps) {
  const [storeName, setStoreName] = useState("")
  const [phone, setPhone] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [croppedImage, setCroppedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const [error, setError] = useState("")
  // supabase singleton imported directly

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ""
    if (!file) return

    if (isGifFile(file)) {
      setError("Arquivos GIF não são permitidos no sistema.")
      return
    }

    // Validate file size (3MB max)
    if (file.size > 3 * 1024 * 1024) {
      setError("Arquivo muito grande. Máximo 3MB.")
      return
    }

    setError("")
    setImageFile(file)
    setIsCropperOpen(true)
  }

  const handleCropComplete = (croppedImageData: string) => {
    setCroppedImage(croppedImageData)
    setIsCropperOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!storeName.trim()) {
      setError("Nome da loja é obrigatório")
      return
    }

    const cleanPhone = phone.replace(/\D/g, "")
    if (!cleanPhone) {
      setError("WhatsApp é obrigatório")
      return
    }

    let phoneToValidate = cleanPhone
    if (phoneToValidate.startsWith("55") && (phoneToValidate.length === 12 || phoneToValidate.length === 13)) {
      phoneToValidate = phoneToValidate.slice(2)
    }
    if (!validateBrazilMobile(phoneToValidate)) {
      setError("Número de WhatsApp inválido")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      let imageUrl: string | null = null

      if (croppedImage) {
        const uploadResult = await uploadImageToR2Action(croppedImage, "stores")

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Erro ao fazer upload da imagem")
        }

        imageUrl = uploadResult.publicId || null
      }

      // Create store in Supabase
      const { data, error: supabaseError } = await supabase.from("stores").insert({
        partner_id: partnerId,
        name: storeName.trim(),
        phone: normalizePhoneToE164(phone),
        logo_url: imageUrl,
      })

      if (supabaseError) {
        throw new Error(supabaseError.message)
      }

      setStoreName("")
      setPhone("")
      setImageFile(null)
      setCroppedImage(null)
      onStoreCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar loja")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo local</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Store Name Input */}
            <div className="flex flex-col gap-2">
              <label htmlFor="store-name" className="text-sm font-medium">
                Nome da Loja <span className="text-red-500">*</span>
              </label>
              <Input
                id="store-name"
                placeholder="Ex: Loja Centro, Filial Sul..."
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* WhatsApp Input */}
            <div className="flex flex-col gap-2">
              <PhoneInput
                label="WhatsApp"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            {/* Image Upload */}
            <div className="flex flex-col gap-2">
              <label htmlFor="store-image" className="text-sm font-medium">
                Imagem da Loja (opcional)
              </label>
              <div className="flex items-center gap-3">
                {croppedImage ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={croppedImage || "https://img.dudit.com.br/static/Placeholder.png"}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                    Sem imagem
                  </div>
                )}
                <label htmlFor="store-image" className="flex-1">
                  <input
                    id="store-image"
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/avif"
                    onChange={handleFileSelect}
                    disabled={isLoading}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full cursor-pointer bg-transparent"
                    disabled={isLoading}
                    onClick={() => document.getElementById("store-image")?.click()}
                  >
                    {croppedImage ? "Alterar" : "Escolher"}
                  </Button>
                </label>
              </div>
              <p className="text-xs text-gray-500">Máximo 3MB. Recomendado: 400x400px</p>
            </div>

            {/* Error Message */}
            {error && <InfoCard message={error} color="red" />}

            <DialogFooter>
              <Button onClick={onClose} variant="outline" disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || !storeName.trim()} className="bg-brand-primary">
                {isLoading ? "Criando..." : "Criar Loja"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImageCropperModal
        isOpen={isCropperOpen}
        onClose={() => setIsCropperOpen(false)}
        onConfirm={handleCropComplete}
        imageFile={imageFile}
      />
    </>
  )
}
