"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, Input, PhoneInput, CepInput, StateComboBox, FormTextarea, InfoCard, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { uploadImageToR2Action } from "@/app/actions/shared/r2"
import { createStoreAction, createStoreWithInheritanceAction, updateStoreAction } from "@/app/actions/erp/stores"
import { ImageCropperModal } from "@/components/ImageCropperModal"
import { UploadIcon, TrashIcon, StoreIcon, ClockIcon, MapPinIcon, InfoIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface StoreModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  store?: any | null
  sourceStore?: any | null
  onSaved: () => void
}

const DAYS_OF_WEEK = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
]

export function StoreModal({ isOpen, onClose, partnerId, store, sourceStore, onSaved }: StoreModalProps) {
  const isEdit = !!store

  const [activeTab, setActiveTab] = useState<string>("gerais")

  // --- General Fields ---
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [phone, setPhone] = useState("")
  const [whatsappPhone, setWhatsappPhone] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [croppedImage, setCroppedImage] = useState<string | null>(null)
  const [isCropperOpen, setIsCropperOpen] = useState(false)

  // --- Address Fields ---
  const [zipCode, setZipCode] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [noNumber, setNoNumber] = useState(false)
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [complement, setComplement] = useState("")

  // --- Hours Fields ---
  const [openingHours, setOpeningHours] = useState<Record<string, { active: boolean; open: string; close: string }>>({
    monday: { active: true, open: "08:00", close: "18:00" },
    tuesday: { active: true, open: "08:00", close: "18:00" },
    wednesday: { active: true, open: "08:00", close: "18:00" },
    thursday: { active: true, open: "08:00", close: "18:00" },
    friday: { active: true, open: "08:00", close: "18:00" },
    saturday: { active: false, open: "08:00", close: "12:00" },
    sunday: { active: false, open: "08:00", close: "12:00" },
  })

  // --- Inheritance Options (Create Mode) ---
  const [showInheritance, setShowInheritance] = useState(false)
  const [inheritOptions, setInheritOptions] = useState({
    inheritProducts: true,
    inheritServices: true,
    inheritCategories: true,
    inheritPaymentMethods: true,
    inheritFinancialSettings: true,
    inheritLogistics: true,
    inheritOpeningHours: true,
    inheritShowcase: true,
  })

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
        setPhone(store.phone || "")
        setWhatsappPhone(store.whatsapp_phone || "")
        setImageUrl(store.image_url || null)
        setCroppedImage(null)
        setImageFile(null)

        // Address
        setZipCode(store.zip_code || store.address?.zip_code || "")
        setStreet(store.street || store.address?.street || "")
        setNumber(store.number || store.address?.number || "")
        setNoNumber(store.number === "S/N" || store.address?.number === "S/N")
        setNeighborhood(store.neighborhood || store.address?.neighborhood || "")
        setCity(store.city || store.address?.city || "")
        setState(store.state || store.address?.state || "")
        setComplement(store.complement || store.address?.complement || "")

        // Hours
        if (store.opening_hours && typeof store.opening_hours === "object") {
          setOpeningHours((prev) => ({ ...prev, ...store.opening_hours }))
        }
      } else {
        setName("")
        setDescription("")
        setPhone("")
        setWhatsappPhone("")
        setImageUrl(null)
        setCroppedImage(null)
        setImageFile(null)
        setZipCode("")
        setStreet("")
        setNumber("")
        setNoNumber(false)
        setNeighborhood("")
        setCity("")
        setState("")
        setComplement("")
        setShowInheritance(false)
        setOpeningHours({
          monday: { active: true, open: "08:00", close: "18:00" },
          tuesday: { active: true, open: "08:00", close: "18:00" },
          wednesday: { active: true, open: "08:00", close: "18:00" },
          thursday: { active: true, open: "08:00", close: "18:00" },
          friday: { active: true, open: "08:00", close: "18:00" },
          saturday: { active: false, open: "08:00", close: "12:00" },
          sunday: { active: false, open: "08:00", close: "12:00" },
        })
      }
    }
  }, [isOpen, store])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ""
    if (!file) return

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

  const handleCepAddressFound = (data: { street?: string; neighborhood?: string; city?: string; state?: string }) => {
    if (data.street) setStreet(data.street)
    if (data.neighborhood) setNeighborhood(data.neighborhood)
    if (data.city) setCity(data.city)
    if (data.state) setState(data.state)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Nome da loja é obrigatório")
      setActiveTab("gerais")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      let finalImageUrl = imageUrl

      if (croppedImage) {
        const uploadRes = await uploadImageToR2Action(croppedImage, "stores")
        if (!uploadRes.success) {
          throw new Error(uploadRes.error || "Erro ao fazer upload da imagem")
        }
        finalImageUrl = uploadRes.publicId || null
      }

      const storePayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsapp_phone: whatsappPhone.trim() || undefined,
        image_url: finalImageUrl || undefined,
        logo_url: finalImageUrl || undefined,
        zip_code: zipCode.trim() || undefined,
        street: street.trim() || undefined,
        number: noNumber ? "S/N" : (number.trim() || undefined),
        noNumber,
        neighborhood: neighborhood.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        complement: complement.trim() || undefined,
        opening_hours: openingHours,
      }

      if (isEdit) {
        const res = await updateStoreAction({
          storeId: store.id,
          partnerId,
          ...storePayload,
        })
        if (!res.success) throw new Error(res.error || "Erro ao atualizar loja")
      } else {
        if (showInheritance && sourceStore) {
          const res = await createStoreWithInheritanceAction({
            partnerId,
            sourceStoreId: sourceStore.id,
            ...storePayload,
            ...inheritOptions,
          })
          if (!res.success) throw new Error(res.error || "Erro ao criar loja")
        } else {
          const res = await createStoreAction({
            partnerId,
            ...storePayload,
          })
          if (!res.success) throw new Error(res.error || "Erro ao criar loja")
        }
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao salvar a loja")
    } finally {
      setIsLoading(false)
    }
  }

  const displayImage = croppedImage || (imageUrl ? getR2ImageUrl(imageUrl) : null)

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
              onClick={handleSubmit}
              disabled={isLoading || !name.trim()}
              className="bg-brand-primary text-white"
            >
              {isLoading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Loja"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start border-b border-brand-border dark:border-dark-border bg-transparent p-0 gap-6">
              <TabsTrigger
                value="gerais"
                className="py-2.5 px-1 border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none font-medium flex items-center gap-2"
              >
                <InfoIcon className="w-4 h-4" />
                Dados Gerais
              </TabsTrigger>
              <TabsTrigger
                value="endereco"
                className="py-2.5 px-1 border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none font-medium flex items-center gap-2"
              >
                <MapPinIcon className="w-4 h-4" />
                Endereço
              </TabsTrigger>
              <TabsTrigger
                value="horarios"
                className="py-2.5 px-1 border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none font-medium flex items-center gap-2"
              >
                <ClockIcon className="w-4 h-4" />
                Horários
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: DADOS GERAIS */}
            <TabsContent value="gerais" className="space-y-4 pt-4">
              {/* Image Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                  Imagem / Logotipo da Loja (opcional)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-brand-primary/10 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                    {displayImage ? (
                      <img src={displayImage} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <StoreIcon className="w-8 h-8 text-brand-primary" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor="store-image-upload">
                        <input
                          id="store-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          disabled={isLoading}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => document.getElementById("store-image-upload")?.click()}
                          className="flex items-center gap-2"
                        >
                          <UploadIcon className="w-4 h-4" />
                          {displayImage ? "Alterar Foto" : "Escolher Foto"}
                        </Button>
                      </label>
                      {displayImage && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setImageUrl(null)
                            setCroppedImage(null)
                            setImageFile(null)
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-brand-inactive-text">Formatos aceitos: JPG, PNG. Máx. 3MB</p>
                  </div>
                </div>
              </div>

              {/* Nome da Loja (Required) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                  Nome da Loja <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Ex: Filial Centro, Loja Shopping..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>

              {/* Telefone & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Telefone
                  </label>
                  <PhoneInput
                    placeholder="(00) 0000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    WhatsApp
                  </label>
                  <PhoneInput
                    placeholder="(00) 00000-0000"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Descrição */}
              <div className="flex flex-col gap-1.5">
                <FormTextarea
                  label="Descrição (opcional)"
                  name="description"
                  placeholder="Informações adicionais sobre esta unidade..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={isLoading}
                />
              </div>

              {/* Inherit options if creating and sourceStore exists */}
              {!isEdit && sourceStore && (
                <div className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/20 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-brand-dark cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showInheritance}
                      onChange={(e) => setShowInheritance(e.target.checked)}
                      className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                    />
                    Copiar produtos e configurações da loja principal ({sourceStore.name})
                  </label>

                  {showInheritance && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-brand-primary/10 text-xs">
                      {[
                        { key: "inheritProducts", label: "Produtos" },
                        { key: "inheritServices", label: "Serviços" },
                        { key: "inheritCategories", label: "Categorias" },
                        { key: "inheritPaymentMethods", label: "Formas de pagamento" },
                        { key: "inheritFinancialSettings", label: "Configurações financeiras" },
                        { key: "inheritLogistics", label: "Logística" },
                        { key: "inheritOpeningHours", label: "Horários" },
                        { key: "inheritShowcase", label: "Vitrine" },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(inheritOptions as any)[key]}
                            onChange={() => setInheritOptions((prev) => ({ ...prev, [key]: !(prev as any)[key] }))}
                            className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ABA 2: ENDEREÇO */}
            <TabsContent value="endereco" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <CepInput
                    value={zipCode}
                    onChange={(val) => setZipCode(val)}
                    onAddressFetched={handleCepAddressFound}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Bairro
                  </label>
                  <Input
                    placeholder="Bairro"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Rua / Logradouro
                  </label>
                  <Input
                    placeholder="Ex: Av. Paulista"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Número
                  </label>
                  <Input
                    placeholder="123"
                    value={noNumber ? "S/N" : number}
                    onChange={(e) => setNumber(e.target.value)}
                    disabled={isLoading || noNumber}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-brand-inactive-text mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noNumber}
                      onChange={(e) => {
                        setNoNumber(e.target.checked)
                        if (e.target.checked) setNumber("")
                      }}
                      className="rounded border-brand-border text-brand-primary"
                    />
                    Sem número (S/N)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Cidade
                  </label>
                  <Input
                    placeholder="Cidade"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Estado (UF)
                  </label>
                  <StateComboBox
                    value={state}
                    onChange={(val) => setState(val)}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                    Complemento
                  </label>
                  <Input
                    placeholder="Ex: Sala 402"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA 3: HORÁRIOS */}
            <TabsContent value="horarios" className="space-y-3 pt-4">
              <p className="text-xs text-brand-inactive-text mb-2">
                Defina os horários de funcionamento padrão para esta loja.
              </p>
              <div className="space-y-2">
                {DAYS_OF_WEEK.map(({ key, label }) => {
                  const dayState = openingHours[key] || { active: false, open: "08:00", close: "18:00" }

                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center justify-between p-3 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <input
                          type="checkbox"
                          checked={dayState.active}
                          onChange={(e) => {
                            const val = e.target.checked
                            setOpeningHours((prev) => ({
                              ...prev,
                              [key]: { ...dayState, active: val },
                            }))
                          }}
                          className="rounded border-brand-border text-brand-primary"
                        />
                        <span className={`text-sm font-medium ${dayState.active ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}>
                          {label}
                        </span>
                      </div>

                      {dayState.active ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={dayState.open}
                            onChange={(e) => {
                              const openVal = e.target.value
                              setOpeningHours((prev) => ({
                                ...prev,
                                [key]: { ...dayState, open: openVal },
                              }))
                            }}
                            className="px-2 py-1 rounded-lg border border-brand-border text-sm font-medium bg-white dark:bg-dark-surface"
                          />
                          <span className="text-xs text-brand-inactive-text">até</span>
                          <input
                            type="time"
                            value={dayState.close}
                            onChange={(e) => {
                              const closeVal = e.target.value
                              setOpeningHours((prev) => ({
                                ...prev,
                                [key]: { ...dayState, close: closeVal },
                              }))
                            }}
                            className="px-2 py-1 rounded-lg border border-brand-border text-sm font-medium bg-white dark:bg-dark-surface"
                          />
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-red-500 bg-red-100 dark:bg-red-950/40 px-2.5 py-1 rounded-full">
                          Fechado
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>

          {error && <InfoCard message={error} color="red" />}
        </form>
      </DefaultModal>

      <ImageCropperModal
        isOpen={isCropperOpen}
        onClose={() => setIsCropperOpen(false)}
        onConfirm={handleCropComplete}
        imageFile={imageFile}
      />
    </>
  )
}
