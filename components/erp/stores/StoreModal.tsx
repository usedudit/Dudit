"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  DefaultModal,
  Button,
  Input,
  PhoneInput,
  CepInput,
  StateComboBox,
  NumberInputWithCheckbox,
  FormSection,
  FormTextarea,
  InfoCard,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ListItem,
  RadioButton
} from "@/components/reusable"
import { BusinessHoursSelector } from "@/components/BusinessHoursSelector"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { createStoreAction, updateStoreAction } from "@/app/actions/erp/stores"
import ImageCropperModal from "@/components/ImageCropperModal"
import { isGifFile } from "@/lib/security/file-validator"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { TrashIcon } from "@/lib/icons"
import { Clock } from "lucide-react"

interface StoreModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  store?: any | null
  onSaved: () => void
}

export function StoreModal({ isOpen, onClose, partnerId, store, onSaved }: StoreModalProps) {
  const isEdit = !!store
  const [activeTab, setActiveTab] = useState<string>("gerais")

  // --- General Fields ---
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [whatsappPhone, setWhatsappPhone] = useState("")

  // --- Logo / Photo State (Exact ShowcaseSubPage pattern) ---
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [tempImageFile, setTempImageFile] = useState<File | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Address State (Exact BusinessDataSubPage / Register pattern) ---
  const [addresses, setAddresses] = useState({
    zipCode: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    noNumber: false,
    latitude: null as number | null,
    longitude: null as number | null,
  })

  // --- Opening Hours State (Exact BusinessHoursSelector pattern) ---
  const [hours, setHours] = useState(() => normalizeOpeningHours({}))
  const [acceptOrdersWhenClosed, setAcceptOrdersWhenClosed] = useState<boolean>(true)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // Populate data when editing or opening
  useEffect(() => {
    if (isOpen) {
      setError("")
      setActiveTab("gerais")
      if (store) {
        setName(store.name || "")
        setDescription(store.description || "")
        setWhatsappPhone(store.whatsapp_phone || store.phone || "")

        const initialLogo = store.logo_url || null
        setImageUrl(initialLogo)
        setImagePreview(initialLogo ? getR2ImageUrl(initialLogo) : null)
        setTempImageFile(null)

        const addr = store.addresses?.[0] || store.address || {}
        const effNumber = store.number || addr.number || ""
        setAddresses({
          zipCode: store.zip_code || addr.zip_code || "",
          street: store.street || addr.street || "",
          number: effNumber === "S/N" ? "" : effNumber,
          complement: store.complement || addr.complement || "",
          neighborhood: store.neighborhood || addr.neighborhood || "",
          city: store.city || addr.city || "",
          state: store.state || addr.state || "",
          noNumber: effNumber === "S/N",
          latitude: store.latitude ?? addr.latitude ?? null,
          longitude: store.longitude ?? addr.longitude ?? null,
        })

        const effHours = store.opening_hours || {}
        setHours(normalizeOpeningHours(effHours))
        setAcceptOrdersWhenClosed(store.accept_orders_when_closed ?? true)
      } else {
        setName("")
        setDescription("")
        setWhatsappPhone("")
        setImageUrl(null)
        setImagePreview(null)
        setTempImageFile(null)
        setAddresses({
          zipCode: "",
          street: "",
          number: "",
          complement: "",
          neighborhood: "",
          city: "",
          state: "",
          noNumber: false,
          latitude: null,
          longitude: null,
        })
        setHours(normalizeOpeningHours({}))
        setAcceptOrdersWhenClosed(true)
      }
    }
  }, [isOpen, store])

  // --- Photo Upload Handler (Exact ShowcaseSubPage) ---
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ""
    if (!file) return
    if (isGifFile(file)) {
      setError("Arquivos GIF não são permitidos no sistema.")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Máximo 3MB por imagem")
      return
    }
    setError("")
    setTempImageFile(file)
    setCropModalOpen(true)
  }

  const handleCropComplete = (url: string) => {
    setCropModalOpen(false)
    setImagePreview(url)
    setTempImageFile(null)
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
    setImageUrl(null)
    setTempImageFile(null)
  }

  // --- Submit Handler ---
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      setError("Nome da loja é obrigatório")
      setActiveTab("gerais")
      return
    }

    const cleanPhone = whatsappPhone.replace(/\D/g, "")
    if (!cleanPhone) {
      setError("WhatsApp é obrigatório")
      setActiveTab("gerais")
      return
    }

    let phoneToValidate = cleanPhone
    if (phoneToValidate.startsWith("55") && (phoneToValidate.length === 12 || phoneToValidate.length === 13)) {
      phoneToValidate = phoneToValidate.slice(2)
    }
    if (phoneToValidate.length !== 11 || phoneToValidate[2] !== "9") {
      setError("Informe um número de WhatsApp válido com DDD (celular)")
      setActiveTab("gerais")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      let finalLogoUrl = imageUrl

      // Upload logo to R2 if base64 (Exact ShowcaseSubPage pattern)
      if (imagePreview && imagePreview.startsWith("data:")) {
        setImageUploading(true)
        try {
          const blob = await (await fetch(imagePreview)).blob()
          const ext = blob.type === "image/png" ? "png" : "jpg"
          const file = new File([blob], `logo.${ext}`, { type: blob.type })
          const formData = new FormData()
          formData.append("file", file)
          const res = await fetchWithCSRF("/api/upload-image?uploadType=partner-logo", { method: "POST", body: formData })
          const data = await res.json()
          if (data.success && data.key) {
            finalLogoUrl = data.key
          } else {
            throw new Error(data.error || "Erro no upload da logo")
          }
        } catch (err: any) {
          throw new Error(err.message || "Erro no upload da foto")
        } finally {
          setImageUploading(false)
        }
      }

      const storePayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        phone: whatsappPhone.trim(),
        logo_url: finalLogoUrl || undefined,
        zip_code: addresses.zipCode.trim() || undefined,
        street: addresses.street.trim() || undefined,
        number: addresses.noNumber ? "S/N" : (addresses.number.trim() || undefined),
        noNumber: addresses.noNumber,
        neighborhood: addresses.neighborhood.trim() || undefined,
        city: addresses.city.trim() || undefined,
        state: addresses.state.trim() || undefined,
        complement: addresses.complement.trim() || undefined,
        opening_hours: hours as any,
        accept_orders_when_closed: acceptOrdersWhenClosed,
        latitude: addresses.latitude ?? null,
        longitude: addresses.longitude ?? null,
      }

      if (isEdit) {
        const res = await updateStoreAction({
          storeId: store.id,
          partnerId,
          ...storePayload,
        })
        if (!res.success) throw new Error(res.error || "Erro ao atualizar loja")
      } else {
        const res = await createStoreAction({
          partnerId,
          ...storePayload,
        })
        if (!res.success) throw new Error(res.error || "Erro ao criar loja")
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao salvar a loja")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <DefaultModal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Editar Loja" : "Nova Loja"}
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={isLoading || !name.trim() || !whatsappPhone.trim()}
            >
              {isLoading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Loja"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start border-b border-brand-border dark:border-dark-border bg-transparent p-0">
              <TabsTrigger value="gerais">Dados Gerais</TabsTrigger>
              <TabsTrigger value="endereco">Endereço</TabsTrigger>
              <TabsTrigger value="horarios">Horários</TabsTrigger>
            </TabsList>

            {/* ABA 1: DADOS GERAIS */}
            <TabsContent value="gerais" className="space-y-4 pt-4">
              {/* Logo Upload (Exact ShowcaseSubPage pattern) */}
              <FormSection title="Logo do Negócio">
                <div className="flex items-center gap-4 dark:bg-dark-background/50">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border cursor-pointer relative group overflow-hidden"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Logo" className="object-cover w-full h-full rounded-full" />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    )}
                    {imageUploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Spinner size={20} className="text-white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </div>
                  </div>
                   <div className="flex-1">
                     <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Logo da Empresa</p>
                     <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                   </div>
                   {imagePreview && (
                     <Button
                       variant="ghostred"
                       size="icon"
                       className="w-8 h-8"
                       onClick={(e) => {
                         e.stopPropagation()
                         e.preventDefault()
                         handleRemoveImage()
                       }}
                     >
                       <TrashIcon size={14} />
                     </Button>
                   )}
                   <input ref={fileInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleImageChange} />
                </div>
              </FormSection>

              {/* Nome da Loja & WhatsApp Side by Side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nome da Loja"
                  placeholder="Ex: Filial Centro, Loja Shopping..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  required
                  maxLength={150}
                />
                <div>
                  <PhoneInput
                    label="WhatsApp"
                    placeholder="(00) 00000-0000"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              {/* Descrição */}
              <FormTextarea
                label="Descrição (opcional)"
                name="description"
                placeholder="Informações adicionais sobre esta unidade..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={isLoading}
              />
            </TabsContent>

            {/* ABA 2: ENDEREÇO (Exact BusinessDataSubPage pattern) */}
            <TabsContent value="endereco" className="space-y-4 pt-4">
              <FormSection title="Endereço">
                <div className="space-y-4">
                  <CepInput
                    value={addresses.zipCode}
                    onChange={(val) => {
                      setAddresses((prev) => ({ ...prev, zipCode: val }))
                    }}
                    name="cep"
                    onAddressFetched={(data) => {
                      setAddresses((prev) => ({
                        ...prev,
                        street: data.street || prev.street,
                        number: data.number || prev.number,
                        neighborhood: data.neighborhood || prev.neighborhood,
                        city: data.city || prev.city,
                        state: data.state || prev.state,
                        noNumber: data.number === "S/N",
                        latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                        longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
                      }))
                    }}
                  />
                  <Input
                    label="Rua/Avenida"
                    placeholder="Rua, Avenida, etc."
                    value={addresses.street}
                    onChange={(e) => setAddresses((prev) => ({ ...prev, street: e.target.value }))}
                  />

                  <div className="grid grid-cols-2 gap-3 flex-row items-start pt-1.5 pb-1.5">
                    <div>
                      <NumberInputWithCheckbox
                        label="Número"
                        number={addresses.number}
                        noNumber={addresses.noNumber}
                        onNumberChange={(val) => setAddresses((prev) => ({ ...prev, number: val }))}
                        onNoNumberChange={(checked) => setAddresses((prev) => ({ ...prev, noNumber: checked, number: checked ? "S/N" : "" }))}
                        placeholder="123"
                      />
                    </div>
                    <div>
                      <Input
                        label="Complemento"
                        placeholder="Apto, Bloco, etc."
                        value={addresses.complement}
                        onChange={(e) => setAddresses((prev) => ({ ...prev, complement: e.target.value }))}
                      />
                    </div>
                  </div>

                  <Input
                    label="Bairro"
                    placeholder="Nome do bairro"
                    value={addresses.neighborhood}
                    onChange={(e) => setAddresses((prev) => ({ ...prev, neighborhood: e.target.value }))}
                  />

                  <div className="grid grid-cols-2 gap-3 items-start">
                    <div>
                      <Input
                        label="Cidade"
                        placeholder="Nome da cidade"
                        value={addresses.city}
                        onChange={(e) => setAddresses((prev) => ({ ...prev, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <StateComboBox
                        value={addresses.state}
                        onChange={(v) => setAddresses((prev) => ({ ...prev, state: v }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </FormSection>
            </TabsContent>

            {/* ABA 3: HORÁRIOS (Exact BusinessHoursSelector pattern) */}
            <TabsContent value="horarios" className="space-y-4 pt-4">
              <FormSection title="Horários de Funcionamento">
                <BusinessHoursSelector value={hours as any} onChange={setHours as any} />
              </FormSection>

              <FormSection title="Pedidos fora do horário de funcionamento" hasSeparator>
                <div className="grid gap-3">
                  <ListItem
                    title="Receber pedidos normalmente"
                    description="Clientes podem fazer pedidos mesmo quando a loja estiver fora do horário de funcionamento."
                    icon={<Clock className="text-brand-green" size={20} />}
                    onClick={() => setAcceptOrdersWhenClosed(true)}
                    right={
                      <RadioButton
                        name="modalAcceptOrdersWhenClosed"
                        value="allow"
                        checked={acceptOrdersWhenClosed}
                        onChange={() => setAcceptOrdersWhenClosed(true)}
                      />
                    }
                    className="py-4 px-6 gap-4 cursor-pointer"
                  />
                  <ListItem
                    title="Bloquear pedidos com loja fechada"
                    description="A vitrine não permitirá a realização de novos pedidos enquanto a loja estiver fora do horário de funcionamento."
                    icon={<Clock className="text-brand-inactive-text" size={20} />}
                    onClick={() => setAcceptOrdersWhenClosed(false)}
                    right={
                      <RadioButton
                        name="modalAcceptOrdersWhenClosed"
                        value="block"
                        checked={!acceptOrdersWhenClosed}
                        onChange={() => setAcceptOrdersWhenClosed(false)}
                      />
                    }
                    className="py-4 px-6 gap-4 cursor-pointer"
                  />
                </div>
              </FormSection>
            </TabsContent>
          </Tabs>

          {error && <InfoCard message={error} color="red" />}
        </form>
      </DefaultModal>

      {tempImageFile && (
        <ImageCropperModal
          isOpen={cropModalOpen}
          onClose={() => setCropModalOpen(false)}
          onConfirm={handleCropComplete}
          imageFile={tempImageFile}
        />
      )}
    </>
  )
}
