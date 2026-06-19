"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Button, Input, FormDropdown, Tabs, TabsList, TabsTrigger, TabsContent,
  AlertModal, UnsavedChangesDialog, Badge, CepInput, CpfCnpjInput,
  PhoneInput, EmailInput, StateComboBox,
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, EditIcon } from "@/lib/icons"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useNotification } from "@/hooks/use-notification"
import { FadeIn } from "@/components/animations/FadeIn"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { createComprehensiveSupplierAction, updateComprehensiveSupplierAction, getSupplierByIdAction } from "@/app/actions/erp/suppliers"
import { validateEmail, validateCPF, validateCNPJ, validatePhoneBR, validateURL, validateCEP } from "@/lib/input-validator"

interface NewSupplierPageProps {
  onBack: () => void
  partnerId: string
  supplierId?: string
  onSuccess?: (msg: string) => void
  onError?: (msg: string) => void
}

const NewSupplierPage: React.FC<NewSupplierPageProps> = ({ onBack, partnerId, supplierId, onSuccess, onError }) => {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [activeTab, setActiveTab] = useState("general")
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(!!supplierId)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [pendingBack, setPendingBack] = useState(false)

  const [personType, setPersonType] = useState("Pessoa Jurídica")
  const [supplierName, setSupplierName] = useState("")
  const [cnpj, setCnpj] = useState("")
  const [cpf, setCpf] = useState("")
  const [fantasia, setFantasia] = useState("")
  const [ie, setIe] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [cep, setCep] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")

  const [originalData, setOriginalData] = useState<string | null>(null)
  const isDirty = originalData !== null && JSON.stringify({
    supplierName, cnpj, cpf, fantasia, ie, email, phone, notes, cep, street, number, complement, neighborhood, city, state,
  }) !== originalData

  const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  useEffect(() => {
    if (!supplierId) { setOriginalData(JSON.stringify({ supplierName: "", cnpj: "", cpf: "", fantasia: "", ie: "", email: "", phone: "", notes: "", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })); return }
    getSupplierByIdAction(supplierId).then((res) => {
      const s = res.supplier || {}
      setSupplierName(s.name || "")
      setPersonType(s.person_type === "pj" ? "Pessoa Jurídica" : "Pessoa Física")
      setCnpj(s.cnpj || "")
      setCpf(s.cpf || "")
      setFantasia(s.nome_fantasia || "")
      setIe(s.inscricao_estadual || "")
      setEmail(s.email || "")
      setPhone(s.phone || "")
      setNotes(s.notes || "")
      setCep(s.zip_code || "")
      setStreet(s.street || "")
      setNumber(s.number || "")
      setComplement(s.complement || "")
      setNeighborhood(s.neighborhood || "")
      setCity(s.city || "")
      setState(s.state || "")
      setOriginalData(JSON.stringify({ supplierName: s.name || "", cnpj: s.cnpj || "", cpf: s.cpf || "", fantasia: s.nome_fantasia || "", ie: s.inscricao_estadual || "", email: s.email || "", phone: s.phone || "", notes: s.notes || "", cep: s.zip_code || "", street: s.street || "", number: s.number || "", complement: s.complement || "", neighborhood: s.neighborhood || "", city: s.city || "", state: s.state || "" }))
      setIsLoadingData(false)
    }).catch(() => setIsLoadingData(false))
  }, [supplierId])

  const handleBackClick = () => {
    if (isDirty) { setPendingBack(true); setShowDiscardModal(true) }
    else onBack()
  }

  const handleSave = async () => {
    if (!supplierName.trim()) { notifyError("Validação", "Nome é obrigatório"); return }

    const isPJ = personType === "Pessoa Jurídica"
    if (isPJ && !validateCNPJ(cnpj)) { notifyError("Validação", "CNPJ inválido"); return }
    if (!isPJ && cpf && !validateCPF(cpf)) { notifyError("Validação", "CPF inválido"); return }
    if (email && !validateEmail(email)) { notifyError("Validação", "E-mail inválido"); return }
    if (phone && !validatePhoneBR(phone)) { notifyError("Validação", "Telefone inválido"); return }
    if (cep && !validateCEP(cep)) { notifyError("Validação", "CEP inválido"); return }

    setIsSaving(true)
    const data = {
      partnerId,
      name: supplierName,
      personType: isPJ ? "pj" : "pf",
      cnpj: cnpj || undefined,
      cpf: cpf || undefined,
      nomeFantasia: fantasia || undefined,
      inscricaoEstadual: ie || undefined,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
      zipCode: cep || undefined,
      street: street || undefined,
      number: number || undefined,
      complement: complement || undefined,
      neighborhood: neighborhood || undefined,
      city: city || undefined,
      state: state || undefined,
    }

    let result: any
    if (supplierId) {
      result = await updateComprehensiveSupplierAction({ ...data, supplierId })
    } else {
      result = await createComprehensiveSupplierAction(data)
    }

    setIsSaving(false)

    if (result.error) {
      onError?.(result.error)
      notifyError("Erro", result.error)
    } else {
      const msg = supplierId ? "Fornecedor atualizado!" : "Fornecedor criado!"
      onSuccess?.(msg)
      notifySuccess("Sucesso", msg)
    }
  }

  if (isLoadingData) {
    return (
      <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        <div className="flex items-center justify-center flex-1">
          <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      </FadeIn>
    )
  }

  const isEditing = !!supplierId

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 bg-white dark:bg-dark-surface border-b transition-all duration-500">
          <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text" />
              </Button>
              <div>
                <h1 className="font-bold text-xl text-brand-dark dark:text-dark-heading">
                  {isEditing ? "Editar Fornecedor" : "Novo Fornecedor"}
                </h1>
                <p className="text-sm text-brand-inactive-text">{isEditing ? "Atualize os dados do fornecedor" : "Cadastre um novo fornecedor"}</p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="general">Dados Gerais</TabsTrigger>
              <TabsTrigger value="address">Endereço</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-6 space-y-6">
              <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 space-y-4">
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="personType" checked={personType === "Pessoa Jurídica"} onChange={() => setPersonType("Pessoa Jurídica")} className="accent-brand-orange" />
                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Pessoa Jurídica</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="personType" checked={personType === "Pessoa Física"} onChange={() => setPersonType("Pessoa Física")} className="accent-brand-orange" />
                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Pessoa Física</span>
                  </label>
                </div>

                <Input name="supplierName" label="Nome" placeholder="Nome do fornecedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full" />

                {personType === "Pessoa Jurídica" ? (
                  <>
                    <CpfCnpjInput label="CNPJ" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
                    <Input name="fantasia" label="Nome Fantasia" placeholder="Nome fantasia" value={fantasia} onChange={(e) => setFantasia(e.target.value)} className="w-full" />
                    <Input name="ie" label="Inscrição Estadual" placeholder="Inscrição estadual" value={ie} onChange={(e) => setIe(e.target.value)} className="w-full" />
                  </>
                ) : (
                  <CpfCnpjInput label="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EmailInput label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
                  <PhoneInput label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1">Observações</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-transparent text-brand-dark dark:text-dark-heading resize-none"
                    rows={3}
                    placeholder="Observações internas..."
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="address" className="mt-6 space-y-6">
              <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <CepInput label="CEP" value={cep} onChange={setCep} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-4">
                    <Input name="street" label="Logradouro" placeholder="Rua, Avenida..." value={street} onChange={(e) => setStreet(e.target.value)} className="w-full" />
                  </div>
                  <div className="md:col-span-2">
                    <Input name="number" label="Número" placeholder="N°" value={number} onChange={(e) => setNumber(e.target.value)} className="w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input name="complement" label="Complemento" placeholder="Bloco, Ap..." value={complement} onChange={(e) => setComplement(e.target.value)} className="w-full" />
                  <Input name="neighborhood" label="Bairro" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="w-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input name="city" label="Cidade" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="w-full" />
                  <StateComboBox label="Estado" value={state} onChange={setState} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AlertModal
        isOpen={showDiscardModal}
        onClose={() => { setShowDiscardModal(false); setPendingBack(false) }}
        title="Descartar alterações?"
        description="Você tem alterações não salvas. Deseja descartá-las?"
        confirmText="Descartar"
        variant="danger"
        onConfirm={() => { setShowDiscardModal(false); onBack() }}
      />

      <SavingStatusModal isOpen={isSaving} text="Salvando..." />
    </FadeIn>
  )
}

export default NewSupplierPage
