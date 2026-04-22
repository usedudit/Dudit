"use client"

import React, { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  FormDropdown,
  Input,
  ListItem,
  MoneyInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThreeDotsLoader,
} from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, SaveIcon, TagIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  CouponFormState,
  CouponRelations,
  CouponRow,
  CouponScopeData,
  ScopeCustomer,
  ScopeItem,
  getCouponPrimaryMeta,
} from "@/lib/types/coupon"

interface CouponFormPageProps {
  mode: "create" | "edit"
  coupon?: CouponRow | null
  form: CouponFormState
  setForm: React.Dispatch<React.SetStateAction<CouponFormState>>
  scopeData: CouponScopeData
  relations: CouponRelations
  setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedServiceIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedCategoryIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedCustomerIds: React.Dispatch<React.SetStateAction<string[]>>
  onBack: () => void
  onSave: () => void
  isSaving: boolean
  isLoadingScope: boolean
}

const SidebarCard = ({
  children,
  hasTopStrip = true,
}: {
  children: React.ReactNode
  hasTopStrip?: boolean
}) => (
  <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
    {children}
  </div>
)

function SelectionList<T extends ScopeItem | ScopeCustomer | string>({
  items,
  selectedIds,
  onToggle,
  getId,
  getTitle,
  getDescription,
  emptyText,
}: {
  items: T[]
  selectedIds: string[]
  onToggle: (id: string) => void
  getId: (item: T) => string
  getTitle: (item: T) => string
  getDescription?: (item: T) => string | undefined
  emptyText: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-brand-inactive-text dark:text-dark-body">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const id = getId(item)
        return (
          <ListItem
            key={id}
            title={getTitle(item)}
            description={getDescription?.(item)}
            left={
              <div className="pl-4 pr-1" onClick={(event) => event.stopPropagation()}>
                <Checkbox checked={selectedIds.includes(id)} onChange={() => onToggle(id)} />
              </div>
            }
            onClick={() => onToggle(id)}
            className="p-0 min-h-[68px]"
          />
        )
      })}
    </div>
  )
}

export default function CouponFormPage({
  mode,
  coupon,
  form,
  setForm,
  scopeData,
  relations,
  setSelectedProductIds,
  setSelectedServiceIds,
  setSelectedCategoryIds,
  setSelectedCustomerIds,
  onBack,
  onSave,
  isSaving,
  isLoadingScope,
}: CouponFormPageProps) {
  const [activeTab, setActiveTab] = useState("general")
  const [scopeSearch, setScopeSearch] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")

  const pageTitle = mode === "edit" ? "Editar cupom" : "Novo cupom"

  const filteredProducts = useMemo(() => {
    const term = scopeSearch.trim().toLowerCase()
    return scopeData.products.filter((item) => !term || item.name.toLowerCase().includes(term) || String(item.category || "").toLowerCase().includes(term))
  }, [scopeData.products, scopeSearch])

  const filteredServices = useMemo(() => {
    const term = scopeSearch.trim().toLowerCase()
    return scopeData.services.filter((item) => !term || item.name.toLowerCase().includes(term))
  }, [scopeData.services, scopeSearch])

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    return scopeData.customers.filter((item) => !term || item.name.toLowerCase().includes(term) || String(item.email || "").toLowerCase().includes(term))
  }, [scopeData.customers, customerSearch])

  const dateFromValue = form.startsAt ? new Date(`${form.startsAt}T12:00:00`) : undefined
  const dateToValue = form.endsAt ? new Date(`${form.endsAt}T12:00:00`) : undefined

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
              <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </div>

              <div className="hidden md:flex items-start justify-between">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading flex items-center gap-3">
                    <span className="truncate">{pageTitle}</span>
                    {mode === "edit" && <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5">Editando</Badge>}
                  </h1>
                  <div className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    {mode === "edit" && coupon ? getCouponPrimaryMeta(coupon) : "Preencha as regras promocionais e o publico do cupom."}
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                  <Button variant="outline" onClick={onBack} disabled={isSaving}>
                    Cancelar
                  </Button>
                  <Button onClick={onSave} disabled={isSaving}>
                    <SaveIcon className="w-5 h-5 mr-2" />
                    {isSaving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>

              <div className="w-full md:mt-4">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="general">Dados gerais</TabsTrigger>
                  <TabsTrigger value="scope">Escopo</TabsTrigger>
                  <TabsTrigger value="rules">Regras</TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8">
            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
              <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                  <AnimatePresence mode="wait">
                    <TabsContent value="general" className="mt-0">
                      <motion.div key="general" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                        <section>
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Identificacao</h3>
                          <div className="grid grid-cols-12 gap-5">
                            <div className="col-span-12 md:col-span-7">
                              <Input
                                label="Codigo do cupom"
                                placeholder="Ex: BEMVINDO10"
                                value={form.code}
                                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-5 mt-[1px]">
                              <FormDropdown
                                label="Status"
                                value={form.isActive ? "Ativo" : "Inativo"}
                                setValue={(value) => setForm((prev) => ({ ...prev, isActive: value === "Ativo" }))}
                                options={[
                                  { value: "Ativo", label: "Ativo" },
                                  { value: "Inativo", label: "Inativo" },
                                ]}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6 mt-[1px]">
                              <FormDropdown
                                label="Tipo de desconto"
                                value={form.discountType}
                                setValue={(value) => setForm((prev) => ({ ...prev, discountType: value as CouponFormState["discountType"] }))}
                                options={[
                                  { value: "percentage", label: "Percentual (%)" },
                                  { value: "fixed", label: "Valor fixo (R$)" },
                                  { value: "free_shipping", label: "Frete gratis" },
                                ]}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              {form.discountType === "fixed" ? (
                                <MoneyInput
                                  label="Valor do desconto"
                                  value={Number(form.discountValue || 0)}
                                  onChange={(value) => setForm((prev) => ({ ...prev, discountValue: value }))}
                                />
                              ) : (
                                <Input
                                  label={form.discountType === "percentage" ? "Desconto (%)" : "Valor do desconto"}
                                  type="number"
                                  value={String(form.discountValue)}
                                  onChange={(event) => setForm((prev) => ({ ...prev, discountValue: Number(event.target.value) }))}
                                  disabled={form.discountType === "free_shipping"}
                                />
                              )}
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <MoneyInput
                                label="Valor minimo do carrinho"
                                value={Number(form.minCartValue || 0)}
                                onChange={(value) => setForm((prev) => ({ ...prev, minCartValue: value }))}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6 mt-[1px]">
                              <FormDropdown
                                label="Aplicar a"
                                value={form.applyScope}
                                setValue={(value) => setForm((prev) => ({ ...prev, applyScope: value as CouponFormState["applyScope"] }))}
                                options={[
                                  { value: "all", label: "Todos os produtos e servicos" },
                                  { value: "categories", label: "Categorias especificas" },
                                  { value: "products", label: "Produtos especificos" },
                                  { value: "services", label: "Servicos especificos" },
                                ]}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6 mt-[1px]">
                              <FormDropdown
                                label="Escopo de clientes"
                                value={form.customerScope}
                                setValue={(value) => setForm((prev) => ({ ...prev, customerScope: value as CouponFormState["customerScope"] }))}
                                options={[
                                  { value: "all", label: "Todos os clientes" },
                                  { value: "specific", label: "Clientes especificos" },
                                ]}
                              />
                            </div>
                          </div>
                        </section>

                        <div className="border-t border-brand-border dark:border-dark-border w-full" />

                        <section>
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Opcoes</h3>
                          <div className="space-y-4">
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.allowCombination} onChange={(value) => setForm((prev) => ({ ...prev, allowCombination: Boolean(value) }))} />
                              <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Permitir combinacao</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Define se esse desconto pode coexistir com outras promocoes.</p>
                              </div>
                            </label>
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.isAutomatic} onChange={(value) => setForm((prev) => ({ ...prev, isAutomatic: Boolean(value) }))} />
                              <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Cupom automatico</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Pode ser selecionado automaticamente no fluxo de venda.</p>
                              </div>
                            </label>
                          </div>
                        </section>
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="scope" className="mt-0">
                      <motion.div key="scope" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                        <section>
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Itens vinculados</h3>
                            {isLoadingScope && <ThreeDotsLoader />}
                          </div>

                          {(form.applyScope === "products" || form.applyScope === "services") && (
                            <div className="mb-5">
                              <Input label="" placeholder="Buscar..." value={scopeSearch} onChange={(event) => setScopeSearch(event.target.value)} />
                            </div>
                          )}

                          {form.applyScope === "all" && (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">O cupom vale para todo o catalogo. Troque o escopo acima para restringir por categoria, produto ou servico.</p>
                          )}

                          {form.applyScope === "categories" && (
                            <SelectionList
                              items={scopeData.categories}
                              selectedIds={relations.categoryIds}
                              onToggle={(id) => setSelectedCategoryIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                              getId={(item) => item}
                              getTitle={(item) => item}
                              emptyText="Nenhuma categoria encontrada."
                            />
                          )}

                          {form.applyScope === "products" && (
                            <SelectionList
                              items={filteredProducts}
                              selectedIds={relations.productIds}
                              onToggle={(id) => setSelectedProductIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                              getId={(item) => item.id}
                              getTitle={(item) => item.name}
                              getDescription={(item) => [item.category, item.price != null ? `R$ ${Number(item.price).toFixed(2)}` : ""].filter(Boolean).join(" • ")}
                              emptyText="Nenhum produto encontrado."
                            />
                          )}

                          {form.applyScope === "services" && (
                            <SelectionList
                              items={filteredServices}
                              selectedIds={relations.serviceIds}
                              onToggle={(id) => setSelectedServiceIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                              getId={(item) => item.id}
                              getTitle={(item) => item.name}
                              getDescription={(item) => item.price != null ? `R$ ${Number(item.price).toFixed(2)}` : undefined}
                              emptyText="Nenhum servico encontrado."
                            />
                          )}
                        </section>

                        {form.customerScope === "specific" && (
                          <>
                            <div className="border-t border-brand-border dark:border-dark-border w-full" />
                            <section>
                              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Clientes vinculados</h3>
                              <div className="mb-5">
                                <Input label="" placeholder="Buscar cliente..." value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                              </div>
                              <SelectionList
                                items={filteredCustomers}
                                selectedIds={relations.customerIds}
                                onToggle={(id) => setSelectedCustomerIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                                getId={(item) => item.id}
                                getTitle={(item) => item.name}
                                getDescription={(item) => item.email || item.phone || undefined}
                                emptyText="Nenhum cliente encontrado."
                              />
                            </section>
                          </>
                        )}
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="rules" className="mt-0">
                      <motion.div key="rules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                        <section>
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Limites de uso</h3>
                          <div className="space-y-5">
                            <div>
                              <label className="flex items-start gap-3 mb-3">
                                <Checkbox checked={form.usageLimitEnabled} onChange={(value) => setForm((prev) => ({ ...prev, usageLimitEnabled: Boolean(value) }))} />
                                <div>
                                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Limitar uso total do cupom</p>
                                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">Define um teto global de utilizacoes.</p>
                                </div>
                              </label>
                              {form.usageLimitEnabled && (
                                <div className="max-w-xs">
                                  <Input label="Limite total" type="number" value={String(form.usageLimit)} onChange={(event) => setForm((prev) => ({ ...prev, usageLimit: Number(event.target.value) }))} />
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="flex items-start gap-3 mb-3">
                                <Checkbox checked={form.usagePerCustomerEnabled} onChange={(value) => setForm((prev) => ({ ...prev, usagePerCustomerEnabled: Boolean(value), firstPurchaseOnly: false }))} />
                                <div>
                                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Limitar por cliente</p>
                                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">Controla quantas vezes cada cliente pode usar.</p>
                                </div>
                              </label>
                              {form.usagePerCustomerEnabled ? (
                                <div className="max-w-xs">
                                  <Input label="Usos por cliente" type="number" value={String(form.usagePerCustomer)} onChange={(event) => setForm((prev) => ({ ...prev, usagePerCustomer: Number(event.target.value) }))} />
                                </div>
                              ) : (
                                <label className="flex items-start gap-3">
                                  <Checkbox checked={form.firstPurchaseOnly} onChange={(value) => setForm((prev) => ({ ...prev, firstPurchaseOnly: Boolean(value) }))} />
                                  <div>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Apenas primeira compra</p>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Restringe o uso para clientes na primeira compra.</p>
                                  </div>
                                </label>
                              )}
                            </div>

                            <div>
                              <label className="flex items-start gap-3 mb-3">
                                <Checkbox checked={form.maxDiscountEnabled} onChange={(value) => setForm((prev) => ({ ...prev, maxDiscountEnabled: Boolean(value) }))} />
                                <div>
                                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Definir desconto maximo</p>
                                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">Usado principalmente em regras percentuais.</p>
                                </div>
                              </label>
                              {form.maxDiscountEnabled && (
                                <div className="max-w-xs">
                                  <MoneyInput label="Valor maximo" value={Number(form.maxDiscountValue || 0)} onChange={(value) => setForm((prev) => ({ ...prev, maxDiscountValue: value }))} />
                                </div>
                              )}
                            </div>
                          </div>
                        </section>

                        <div className="border-t border-brand-border dark:border-dark-border w-full" />

                        <section>
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Validade</h3>
                          <div className="space-y-4">
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.unlimitedDate} onChange={(value) => setForm((prev) => ({ ...prev, unlimitedDate: Boolean(value) }))} />
                              <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Sem limite de data</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Desmarque para definir inicio e fim da campanha.</p>
                              </div>
                            </label>

                            {!form.unlimitedDate && (
                              <div className="grid grid-cols-12 gap-5">
                                <div className="col-span-12 md:col-span-6">
                                  <DatePicker
                                    label="Inicio"
                                    value={dateFromValue}
                                    onChange={(date: Date | undefined) => {
                                      const next = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""
                                      setForm((prev) => ({ ...prev, startsAt: next }))
                                    }}
                                  />
                                </div>
                                <div className="col-span-12 md:col-span-6">
                                  <DatePicker
                                    label="Fim"
                                    value={dateToValue}
                                    onChange={(date: Date | undefined) => {
                                      const next = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""
                                      setForm((prev) => ({ ...prev, endsAt: next }))
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      </motion.div>
                    </TabsContent>
                  </AnimatePresence>
                </div>

                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                  <SidebarCard>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <TagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cupom</p>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading">{form.code || "NOVO-CUPOM"}</h3>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{form.isActive ? "Ativo" : "Inativo"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Escopo</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                          {form.applyScope === "all" ? "Catalogo completo" : form.applyScope === "categories" ? `${relations.categoryIds.length} categoria(s)` : form.applyScope === "products" ? `${relations.productIds.length} produto(s)` : `${relations.serviceIds.length} servico(s)`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Clientes</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{form.customerScope === "specific" ? `${relations.customerIds.length} selecionado(s)` : "Todos"}</span>
                      </div>
                    </div>
                  </SidebarCard>

                  <SidebarCard>
                    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Regras ativas</h3>
                    <div className="space-y-3 text-sm">
                      <p className="text-brand-dark dark:text-dark-heading font-medium">{form.allowCombination ? "Permite combinacao com outras regras." : "Nao permite combinacao com outras regras."}</p>
                      <p className="text-brand-dark dark:text-dark-heading font-medium">{form.usageLimitEnabled ? `Limite total: ${form.usageLimit}.` : "Uso total ilimitado."}</p>
                      <p className="text-brand-dark dark:text-dark-heading font-medium">{form.usagePerCustomerEnabled ? `Limite por cliente: ${form.usagePerCustomer}.` : form.firstPurchaseOnly ? "Somente primeira compra." : "Sem limite por cliente."}</p>
                    </div>
                  </SidebarCard>
                </div>
              </div>
            </div>
          </div>
        </Tabs>

        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1" disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={onSave} className="flex-1" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </FadeIn>
  )
}
