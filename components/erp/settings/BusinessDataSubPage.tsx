"use client"

import React, { useState } from "react"
import cn from "classnames"
import { motion, AnimatePresence } from "framer-motion"
import { RadioButton } from "@/components/reusable/RadioButton"
import { Checkbox } from "@/components/reusable/Checkbox"
import FormDropdown, {
  FormDropdownContent,
  FormDropdownItem,
  FormDropdownTrigger,
  FormDropdownValue,
} from "@/components/ui/form-dropdown"
import { Button, InfoCard } from "@/components/reusable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CpfCnpjInput, CepInput, StateComboBox } from "@/components/reusable"
import { BusinessHoursSelector } from "@/components/business-hours-selector"
import { PaymentMethodsGrid } from "@/components/erp/payment-methods-grid"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { SubPageHeader } from "./SettingsCard"

export const BusinessDataSubPage = ({
  partner,
  paymentMethods,
  onBack,
}: {
  partner: any
  paymentMethods: any[]
  onBack: () => void
}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const businessInfo = typeof partner.business_info === "string"
    ? JSON.parse(partner.business_info)
    : (partner.business_info || { sells: ["products"], channels: ["online"] })

  const [generalInfo, setGeneralInfo] = useState({
    storeName: partner.store_name || "",
    storeDescription: partner.store_description || "",
    storeImageUrl: partner.store_image_url || "",
    businessType: partner.business_type || "pf",
    cnpj: partner.cnpj || "",
    sellsProducts: businessInfo?.sells?.includes("products") ?? true,
    providesServices: businessInfo?.sells?.includes("services") ?? false,
    sellsOnline: businessInfo?.channels?.includes("online") ?? true,
    sellsPdv: businessInfo?.channels?.includes("pdv") ?? false,
  })

  const [addresses, setAddresses] = useState({
    zipCode: partner.zip_code || "",
    street: partner.street || "",
    number: partner.number || "",
    complement: partner.complement || "",
    neighborhood: partner.neighborhood || "",
    city: partner.city || "",
    state: partner.state || "",
  })

  const [fiscalInfo, setFiscalInfo] = useState({
    crt: partner.crt || "1",
    contribuinte: partner.contribuinte || "9",
    inscricaoEstadual: partner.inscricao_estadual || "",
    ieIsento: partner.ie_isento || false,
    inscricaoMunicipal: partner.inscricao_municipal || "",
  })

  const [hours, setHours] = useState(partner.opening_hours || {})
  const [activeTab, setActiveTab] = useState("general")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const businessInfo = {
        sells: [] as string[],
        channels: [] as string[],
      }
      if (generalInfo.sellsProducts) businessInfo.sells.push("products")
      if (generalInfo.providesServices) businessInfo.sells.push("services")
      if (generalInfo.sellsOnline) businessInfo.channels.push("online")
      if (generalInfo.sellsPdv) businessInfo.channels.push("pdv")

      const result = await updatePartnerAction(partner.id, {
        storeName: generalInfo.storeName,
        storeDescription: generalInfo.storeDescription,
        storeImageUrl: generalInfo.storeImageUrl || null,
        businessType: generalInfo.businessType as "pf" | "pj",
        cnpj: generalInfo.cnpj || null,
        business_info: businessInfo,
        zipCode: addresses.zipCode,
        street: addresses.street,
        number: addresses.number,
        complement: addresses.complement,
        neighborhood: addresses.neighborhood,
        city: addresses.city,
        state: addresses.state,
        openingHours: hours,
        crt: fiscalInfo.crt,
        contribuinte: fiscalInfo.contribuinte,
        inscricaoEstadual: fiscalInfo.inscricaoEstadual || null,
        ieIsento: fiscalInfo.ieIsento,
        inscricaoMunicipal: fiscalInfo.inscricaoMunicipal || null,
        userId: "",
      })

      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess("Configurações atualizadas com sucesso!")
      }
    } catch (err) {
      setError("Erro ao atualizar configurações")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SubPageHeader
        title="Dados do Negócio"
        description="Gerencie informações da empresa, endereço, fiscal, horários e pagamentos."
        onBack={onBack}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">Dados Gerais</TabsTrigger>
          <TabsTrigger value="address">Endereço</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="hours">Horários</TabsTrigger>
          <TabsTrigger value="payment">Pagamentos</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* ── Dados Gerais ── */}
            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Informações Gerais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="storeName">Nome da loja*</Label>
                    <Input
                      id="storeName"
                      required
                      value={generalInfo.storeName}
                      onChange={(e) => setGeneralInfo({ ...generalInfo, storeName: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="storeDescription">Descrição (O que faz)</Label>
                    <Textarea
                      id="storeDescription"
                      rows={4}
                      value={generalInfo.storeDescription}
                      onChange={(e) => setGeneralInfo({ ...generalInfo, storeDescription: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="storeImageUrl">URL da imagem da loja</Label>
                    <Input
                      id="storeImageUrl"
                      type="url"
                      value={generalInfo.storeImageUrl}
                      onChange={(e) => setGeneralInfo({ ...generalInfo, storeImageUrl: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Tipo de pessoa</Label>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => setGeneralInfo({ ...generalInfo, businessType: "pf" })}
                        className={cn(
                          "flex items-center justify-start gap-3 w-full p-4 border rounded-lg transition-all",
                          generalInfo.businessType === "pf"
                            ? "border-brand-green-secondary bg-brand-green-secondary/5"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <RadioButton
                          name="businessType"
                          value="pf"
                          checked={generalInfo.businessType === "pf"}
                          onChange={() => { }}
                          label=""
                        />
                        <span className="text-sm font-medium">Loja Pessoal (CPF)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeneralInfo({ ...generalInfo, businessType: "pj" })}
                        className={cn(
                          "flex items-center justify-start gap-3 w-full p-4 border rounded-lg transition-all",
                          generalInfo.businessType === "pj"
                            ? "border-brand-green-secondary bg-brand-green-secondary/5"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <RadioButton
                          name="businessType"
                          value="pj"
                          checked={generalInfo.businessType === "pj"}
                          onChange={() => { }}
                          label=""
                        />
                        <span className="text-sm font-medium">Loja Empresarial (CNPJ)</span>
                      </button>
                    </div>
                  </div>

                  {generalInfo.businessType === "pj" && (
                    <div className="grid gap-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <CpfCnpjInput
                        id="cnpj"
                        value={generalInfo.cnpj}
                        onChange={(e) => setGeneralInfo({ ...generalInfo, cnpj: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label>O que você oferece? (Selecione no mínimo 1)</Label>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => setGeneralInfo({ ...generalInfo, sellsProducts: !generalInfo.sellsProducts })}
                        className={cn(
                          "flex items-center justify-start gap-3 w-full p-4 border rounded-lg transition-all",
                          generalInfo.sellsProducts
                            ? "border-brand-green-secondary bg-brand-green-secondary/5"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <Checkbox
                          id="sellsProducts"
                          name="sellsProducts"
                          label=""
                          checked={generalInfo.sellsProducts}
                          onChange={() => { }}
                        />
                        <span className="text-sm font-medium">Vende produtos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setGeneralInfo({ ...generalInfo, providesServices: !generalInfo.providesServices })
                        }
                        className={cn(
                          "flex items-center justify-start gap-3 w-full p-4 border rounded-lg transition-all",
                          generalInfo.providesServices
                            ? "border-brand-green-secondary bg-brand-green-secondary/5"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <Checkbox
                          id="providesServices"
                          name="providesServices"
                          label=""
                          checked={generalInfo.providesServices}
                          onChange={() => { }}
                        />
                        <span className="text-sm font-medium">Presta serviços</span>
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Endereço ── */}
            <TabsContent value="address">
              <Card>
                <CardHeader>
                  <CardTitle>Endereço da Loja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="zipCode">CEP*</Label>
                    <CepInput
                      id="zipCode"
                      name="zipCode"
                      value={addresses.zipCode}
                      onChange={(val) => setAddresses({ ...addresses, zipCode: val })}
                      onAddressFetched={(data) => {
                        setAddresses((prev) => ({
                          ...prev,
                          street: data.street || prev.street,
                          neighborhood: data.neighborhood || prev.neighborhood,
                          city: data.city || prev.city,
                          state: data.state || prev.state,
                        }))
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 grid gap-2">
                      <Label htmlFor="street">Rua*</Label>
                      <Input
                        id="street"
                        required
                        value={addresses.street}
                        onChange={(e) => setAddresses({ ...addresses, street: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="number">Número*</Label>
                      <Input
                        id="number"
                        required
                        value={addresses.number}
                        onChange={(e) => setAddresses({ ...addresses, number: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input
                      id="complement"
                      value={addresses.complement}
                      onChange={(e) => setAddresses({ ...addresses, complement: e.target.value })}
                      placeholder="Opcional"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="neighborhood">Bairro*</Label>
                    <Input
                      id="neighborhood"
                      required
                      value={addresses.neighborhood}
                      onChange={(e) => setAddresses({ ...addresses, neighborhood: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="city">Cidade*</Label>
                      <Input
                        id="city"
                        required
                        value={addresses.city}
                        onChange={(e) => setAddresses({ ...addresses, city: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="state">Estado*</Label>
                      <StateComboBox
                        value={addresses.state}
                        onChange={(v) => setAddresses({ ...addresses, state: v })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Fiscal ── */}
            <TabsContent value="fiscal">
              <Card>
                <CardHeader>
                  <CardTitle>Informações Fiscais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="crt">Código de Regime Tributário*</Label>
                    <FormDropdown value={fiscalInfo.crt} onValueChange={(v: string) => setFiscalInfo({ ...fiscalInfo, crt: v })}>
                      <FormDropdownTrigger>
                        <FormDropdownValue placeholder="Selecione o regime tributário" />
                      </FormDropdownTrigger>
                      <FormDropdownContent>
                        <FormDropdownItem value="none">Não definido</FormDropdownItem>
                        <FormDropdownItem value="1">Simples Nacional</FormDropdownItem>
                        <FormDropdownItem value="2">Simples Nacional - Excesso de sublimite de receita bruta</FormDropdownItem>
                        <FormDropdownItem value="3">Regime Normal</FormDropdownItem>
                        <FormDropdownItem value="4">MEI</FormDropdownItem>
                      </FormDropdownContent>
                    </FormDropdown>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="contribuinte">Contribuinte*</Label>
                    <FormDropdown value={fiscalInfo.contribuinte} onValueChange={(v: string) => setFiscalInfo({ ...fiscalInfo, contribuinte: v })}>
                      <FormDropdownTrigger>
                        <FormDropdownValue placeholder="Selecione o tipo de contribuinte" />
                      </FormDropdownTrigger>
                      <FormDropdownContent>
                        <FormDropdownItem value="1">1 - Contribuinte do ICMS</FormDropdownItem>
                        <FormDropdownItem value="2">2 - Contribuinte isento de Inscrição no Cadastro de Contribuintes</FormDropdownItem>
                        <FormDropdownItem value="9">9 - Não Contribuinte, que pode ou não possuir Inscrição Estadual</FormDropdownItem>
                      </FormDropdownContent>
                    </FormDropdown>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="inscricaoEstadual">Inscrição Estadual</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="inscricaoEstadual"
                        value={fiscalInfo.inscricaoEstadual}
                        onChange={(e) => setFiscalInfo({ ...fiscalInfo, inscricaoEstadual: e.target.value })}
                        disabled={fiscalInfo.ieIsento}
                        placeholder="Digite a inscrição estadual"
                      />
                      <label className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fiscalInfo.ieIsento}
                          onChange={(e) =>
                            setFiscalInfo({
                              ...fiscalInfo,
                              ieIsento: e.target.checked,
                              inscricaoEstadual: e.target.checked ? "" : fiscalInfo.inscricaoEstadual,
                            })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm">IE Isento</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="inscricaoMunicipal">Inscrição Municipal</Label>
                    <Input
                      id="inscricaoMunicipal"
                      value={fiscalInfo.inscricaoMunicipal}
                      onChange={(e) => setFiscalInfo({ ...fiscalInfo, inscricaoMunicipal: e.target.value })}
                      placeholder="Digite a inscrição municipal"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Horários ── */}
            <TabsContent value="hours">
              <Card>
                <CardHeader>
                  <CardTitle>Horários de Funcionamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <BusinessHoursSelector value={hours} onChange={setHours} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <PaymentMethodsGrid partnerId={partner.id} methods={paymentMethods} onUpdate={async () => { }} />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>

      {error && <InfoCard message={error} color="red" className="mt-4" />}
      {success && <div className="mt-4 p-4 bg-green-50 text-green-600 rounded-md text-sm">{success}</div>}

      <Button type="submit" size="lg" className="w-full mt-6" disabled={isLoading}>
        {isLoading ? "Salvando..." : "Salvar todas as configurações"}
      </Button>
    </form>
  )
}
