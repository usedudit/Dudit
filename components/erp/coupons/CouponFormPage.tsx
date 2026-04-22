"use client"

import React, { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Badge,
  Button,
  Checkbox,
  Input,
  MoneyInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThreeDotsLoader,
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, SparklesIcon, TagIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  CouponFormState,
  CouponRelations,
  CouponRow,
  CouponScopeData,
  ScopeCustomer,
  ScopeItem,
  getCouponApplyScopeLabel,
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

function SelectionList<T extends ScopeItem | ScopeCustomer | string>({
  items,
  selectedIds,
  onToggle,
  search,
  onSearchChange,
  getId,
  getPrimary,
  getSecondary,
  emptyText,
}: {
  items: T[]
  selectedIds: string[]
  onToggle: (id: string) => void
  search?: string
  onSearchChange?: (value: string) => void
  getId: (item: T) => string
  getPrimary: (item: T) => string
  getSecondary?: (item: T) => string | null | undefined
  emptyText: string
}) {
  return (
    <div className="space-y-3">
      {typeof search === "string" && onSearchChange && (
        <Input
          label=""
          placeholder="Buscar..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      )}
      <div className="border border-brand-border dark:border-dark-border rounded-2xl max-h-[320px] overflow-y-auto bg-white dark:bg-dark-surface">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-center text-brand-inactive-text dark:text-dark-body">{emptyText}</p>
        ) : (
          items.map((item) => {
            const id = getId(item)
            return (
              <label
                key={id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-brand-gray/40 dark:hover:bg-dark-border/30 cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
              >
                <Checkbox checked={selectedIds.includes(id)} onChange={() => onToggle(id)} />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                    {getPrimary(item)}
                  </span>
                  {getSecondary && (
                    <span className="block text-xs text-brand-inactive-text dark:text-dark-body truncate">
                      {getSecondary(item)}
                    </span>
                  )}
                </div>
              </label>
            )
          })
        )}
      </div>
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

  const pageTitle = mode === "edit" ? "Editar Cupom" : "Novo Cupom"
  const helperText =
    mode === "edit"
      ? "Ajuste regras, publico e limites do cupom mantendo o padrao visual do ERP."
      : "Cadastre um cupom completo com regras, publico e escopo aplicavel."

  const filteredProducts = useMemo(
    () =>
      scopeData.products.filter((item) => {
        const term = scopeSearch.trim().toLowerCase()
        if (!term) return true
        return (
          item.name.toLowerCase().includes(term) ||
          String(item.category || "").toLowerCase().includes(term)
        )
      }),
    [scopeData.products, scopeSearch],
  )

  const filteredServices = useMemo(
    () =>
      scopeData.services.filter((item) => {
        const term = scopeSearch.trim().toLowerCase()
        if (!term) return true
        return item.name.toLowerCase().includes(term)
      }),
    [scopeData.services, scopeSearch],
  )

  const filteredCustomers = useMemo(
    () =>
      scopeData.customers.filter((item) => {
        const term = customerSearch.trim().toLowerCase()
        if (!term) return true
        return (
          item.name.toLowerCase().includes(term) ||
          String(item.email || "").toLowerCase().includes(term) ||
          String(item.phone || "").toLowerCase().includes(term)
        )
      }),
    [scopeData.customers, customerSearch],
  )

  const discountPreview = form.discountType === "percentage"
    ? `${Number(form.discountValue || 0)}%`
    : form.discountType === "fixed"
      ? `R$ ${Number(form.discountValue || 0).toFixed(2)}`
      : "Frete gratis"

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
              <div className="hidden md:flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0">
                    <ChevronLeftIcon className="w-5 h-5" />
                  </Button>
                  <div>
                    <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading">{pageTitle}</h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">{helperText}</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-3">
                  <Button variant="outline" onClick={onBack} disabled={isSaving}>
                    Cancelar
                  </Button>
                  <Button onClick={onSave} disabled={isSaving}>
                    <SaveIcon className="w-4 h-4 mr-2" />
                    {isSaving ? "Salvando..." : "Salvar cupom"}
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

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 max-w-[1300px] mx-auto w-full pb-28 md:pb-8">
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
              <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <AnimatePresence mode="wait">
                  <TabsContent value="general" className="mt-0">
                    <motion.div key="general" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Identificacao</h3>
                        <div className="grid grid-cols-12 gap-5">
                          <div className="col-span-12 md:col-span-6">
                            <Input
                              label="Codigo do cupom"
                              placeholder="Ex: BEMVINDO10"
                              value={form.code}
                              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                            />
                          </div>
                          <div className="col-span-12 md:col-span-6">
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Tipo de desconto</label>
                            <select
                              className="mt-1 h-11 w-full rounded-xl border border-brand-border dark:border-dark-border px-3 bg-white dark:bg-dark-surface text-sm"
                              value={form.discountType}
                              onChange={(event) => setForm((prev) => ({ ...prev, discountType: event.target.value as CouponFormState["discountType"] }))}
                            >
                              <option value="percentage">Percentual (%)</option>
                              <option value="fixed">Valor fixo (R$)</option>
                              <option value="free_shipping">Frete gratis</option>
                            </select>
                          </div>
                          {form.discountType !== "free_shipping" && (
                            <div className="col-span-12 md:col-span-6">
                              {form.discountType === "percentage" ? (
                                <Input
                                  label="Desconto (%)"
                                  type="number"
                                  value={String(form.discountValue)}
                                  onChange={(event) => setForm((prev) => ({ ...prev, discountValue: Number(event.target.value) }))}
                                />
                              ) : (
                                <MoneyInput
                                  label="Valor do desconto"
                                  value={Number(form.discountValue || 0)}
                                  onChange={(value) => setForm((prev) => ({ ...prev, discountValue: value }))}
                                />
                              )}
                            </div>
                          )}
                          <div className="col-span-12 md:col-span-6">
                            <MoneyInput
                              label="Valor minimo do carrinho"
                              value={Number(form.minCartValue || 0)}
                              onChange={(value) => setForm((prev) => ({ ...prev, minCartValue: value }))}
                            />
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Comportamento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="rounded-2xl border border-brand-border dark:border-dark-border p-4 flex items-start gap-3">
                            <Checkbox checked={form.isActive} onChange={(value) => setForm((prev) => ({ ...prev, isActive: Boolean(value) }))} />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">Cupom ativo</p>
                              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Disponivel para uso assim que salvo.</p>
                            </div>
                          </label>
                          <label className="rounded-2xl border border-brand-border dark:border-dark-border p-4 flex items-start gap-3">
                            <Checkbox checked={form.isAutomatic} onChange={(value) => setForm((prev) => ({ ...prev, isAutomatic: Boolean(value) }))} />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">Cupom automatico</p>
                              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Pode ser aplicado sem digitar codigo no checkout.</p>
                            </div>
                          </label>
                          <label className="rounded-2xl border border-brand-border dark:border-dark-border p-4 flex items-start gap-3">
                            <Checkbox checked={form.allowCombination} onChange={(value) => setForm((prev) => ({ ...prev, allowCombination: Boolean(value) }))} />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">Permitir combinacao</p>
                              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Deixa o desconto conviver com outras regras promocionais.</p>
                            </div>
                          </label>
                          <label className="rounded-2xl border border-brand-border dark:border-dark-border p-4 flex items-start gap-3">
                            <Checkbox checked={form.firstPurchaseOnly} onChange={(value) => setForm((prev) => ({ ...prev, firstPurchaseOnly: Boolean(value), usagePerCustomerEnabled: Boolean(value) ? false : prev.usagePerCustomerEnabled }))} />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">Apenas primeira compra</p>
                              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Usa a regra de onboarding para novos clientes.</p>
                            </div>
                          </label>
                        </div>
                      </section>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="scope" className="mt-0">
                    <motion.div key="scope" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Aplicacao</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Aplicar a</label>
                            <select
                              className="mt-1 h-11 w-full rounded-xl border border-brand-border dark:border-dark-border px-3 bg-white dark:bg-dark-surface text-sm"
                              value={form.applyScope}
                              onChange={(event) => setForm((prev) => ({ ...prev, applyScope: event.target.value as CouponFormState["applyScope"] }))}
                            >
                              <option value="all">Todos os produtos e servicos</option>
                              <option value="categories">Categorias especificas</option>
                              <option value="products">Produtos especificos</option>
                              <option value="services">Servicos especificos</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Escopo de clientes</label>
                            <select
                              className="mt-1 h-11 w-full rounded-xl border border-brand-border dark:border-dark-border px-3 bg-white dark:bg-dark-surface text-sm"
                              value={form.customerScope}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerScope: event.target.value as CouponFormState["customerScope"] }))}
                            >
                              <option value="all">Todos os clientes</option>
                              <option value="specific">Clientes especificos</option>
                            </select>
                          </div>
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Selecao detalhada</h3>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Refine os itens e o publico que podem receber esse desconto.
                            </p>
                          </div>
                          {isLoadingScope && <ThreeDotsLoader />}
                        </div>

                        {form.applyScope === "categories" && (
                          <SelectionList
                            items={scopeData.categories}
                            selectedIds={relations.categoryIds}
                            onToggle={(id) =>
                              setSelectedCategoryIds((prev) =>
                                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                              )
                            }
                            getId={(item) => item}
                            getPrimary={(item) => item}
                            emptyText="Nenhuma categoria encontrada."
                          />
                        )}

                        {form.applyScope === "products" && (
                          <SelectionList
                            items={filteredProducts}
                            selectedIds={relations.productIds}
                            onToggle={(id) =>
                              setSelectedProductIds((prev) =>
                                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                              )
                            }
                            search={scopeSearch}
                            onSearchChange={setScopeSearch}
                            getId={(item) => item.id}
                            getPrimary={(item) => item.name}
                            getSecondary={(item) =>
                              [item.category, item.price != null ? `R$ ${Number(item.price).toFixed(2)}` : null]
                                .filter(Boolean)
                                .join(" • ")
                            }
                            emptyText="Nenhum produto encontrado."
                          />
                        )}

                        {form.applyScope === "services" && (
                          <SelectionList
                            items={filteredServices}
                            selectedIds={relations.serviceIds}
                            onToggle={(id) =>
                              setSelectedServiceIds((prev) =>
                                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                              )
                            }
                            search={scopeSearch}
                            onSearchChange={setScopeSearch}
                            getId={(item) => item.id}
                            getPrimary={(item) => item.name}
                            getSecondary={(item) => (item.price != null ? `R$ ${Number(item.price).toFixed(2)}` : null)}
                            emptyText="Nenhum servico encontrado."
                          />
                        )}

                        {form.applyScope === "all" && (
                          <div className="rounded-2xl border border-dashed border-brand-border dark:border-dark-border p-6 text-sm text-brand-inactive-text dark:text-dark-body">
                            O cupom sera valido para todo o catalogo. Se quiser restringir, troque o tipo de escopo acima.
                          </div>
                        )}

                        {form.customerScope === "specific" && (
                          <div className="mt-6">
                            <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4">Clientes permitidos</h4>
                            <SelectionList
                              items={filteredCustomers}
                              selectedIds={relations.customerIds}
                              onToggle={(id) =>
                                setSelectedCustomerIds((prev) =>
                                  prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                                )
                              }
                              search={customerSearch}
                              onSearchChange={setCustomerSearch}
                              getId={(item) => item.id}
                              getPrimary={(item) => item.name}
                              getSecondary={(item) => item.email || item.phone || null}
                              emptyText="Nenhum cliente encontrado."
                            />
                          </div>
                        )}
                      </section>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="rules" className="mt-0">
                    <motion.div key="rules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Limites de uso</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-4">
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.usageLimitEnabled} onChange={(value) => setForm((prev) => ({ ...prev, usageLimitEnabled: Boolean(value) }))} />
                              <div>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">Limitar uso total</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Define um teto de utilizacoes para o cupom.</p>
                              </div>
                            </label>
                            {form.usageLimitEnabled && (
                              <Input
                                label="Limite total"
                                type="number"
                                value={String(form.usageLimit)}
                                onChange={(event) => setForm((prev) => ({ ...prev, usageLimit: Number(event.target.value) }))}
                              />
                            )}
                          </div>

                          <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-4">
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.usagePerCustomerEnabled} onChange={(value) => setForm((prev) => ({ ...prev, usagePerCustomerEnabled: Boolean(value), firstPurchaseOnly: false }))} />
                              <div>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">Limitar por cliente</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Controla quantas vezes cada cliente pode usar.</p>
                              </div>
                            </label>
                            {form.usagePerCustomerEnabled && (
                              <Input
                                label="Usos por cliente"
                                type="number"
                                value={String(form.usagePerCustomer)}
                                onChange={(event) => setForm((prev) => ({ ...prev, usagePerCustomer: Number(event.target.value) }))}
                              />
                            )}
                          </div>

                          <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-4 md:col-span-2">
                            <label className="flex items-start gap-3">
                              <Checkbox checked={form.maxDiscountEnabled} onChange={(value) => setForm((prev) => ({ ...prev, maxDiscountEnabled: Boolean(value) }))} />
                              <div>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">Definir desconto maximo</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Evita que descontos percentuais passem do valor esperado.</p>
                              </div>
                            </label>
                            {form.maxDiscountEnabled && (
                              <div className="max-w-sm">
                                <MoneyInput
                                  label="Teto do desconto"
                                  value={Number(form.maxDiscountValue || 0)}
                                  onChange={(value) => setForm((prev) => ({ ...prev, maxDiscountValue: value }))}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Validade</h3>
                        <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-4">
                          <label className="flex items-start gap-3">
                            <Checkbox checked={form.unlimitedDate} onChange={(value) => setForm((prev) => ({ ...prev, unlimitedDate: Boolean(value) }))} />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">Sem limite de data</p>
                              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Deixe desmarcado para configurar inicio e fim.</p>
                            </div>
                          </label>

                          {!form.unlimitedDate && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Inicio</label>
                                <input
                                  type="datetime-local"
                                  className="mt-1 h-11 w-full rounded-xl border border-brand-border dark:border-dark-border px-3 bg-white dark:bg-dark-surface text-sm"
                                  value={form.startsAt}
                                  onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Fim</label>
                                <input
                                  type="datetime-local"
                                  className="mt-1 h-11 w-full rounded-xl border border-brand-border dark:border-dark-border px-3 bg-white dark:bg-dark-surface text-sm"
                                  value={form.endsAt}
                                  onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
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

              <aside className="col-span-12 lg:col-span-4">
                <div className="lg:sticky lg:top-24 space-y-5">
                  <div className="rounded-3xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <TagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Preview</p>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading">{form.code || "NOVO-CUPOM"}</h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant={form.isActive ? "green" : "gray"}>{form.isActive ? "Ativo" : "Inativo"}</Badge>
                      {form.isAutomatic && (
                        <Badge variant="blue" icon={<SparklesIcon />}>
                          Automatico
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Desconto</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{discountPreview}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Escopo</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{getCouponApplyScopeLabel(form.applyScope)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Clientes</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                          {form.customerScope === "specific" ? `${relations.customerIds.length} selecionado(s)` : "Todos"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Catalogo</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                          {form.applyScope === "products"
                            ? `${relations.productIds.length} produto(s)`
                            : form.applyScope === "services"
                              ? `${relations.serviceIds.length} servico(s)`
                              : form.applyScope === "categories"
                                ? `${relations.categoryIds.length} categoria(s)`
                                : "Completo"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
                    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo da regra</h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-6">
                      {coupon ? getCouponPrimaryMeta(coupon) : `${discountPreview} configurado para ${getCouponApplyScopeLabel(form.applyScope).toLowerCase()}.`}
                    </p>
                    <div className="mt-4 space-y-2 text-sm">
                      <p className="text-brand-dark dark:text-dark-heading font-medium">
                        {form.unlimitedDate ? "Sem limite de data." : "Com janela de validade definida."}
                      </p>
                      <p className="text-brand-dark dark:text-dark-heading font-medium">
                        {form.usageLimitEnabled ? `Limite total: ${form.usageLimit}.` : "Uso total ilimitado."}
                      </p>
                      <p className="text-brand-dark dark:text-dark-heading font-medium">
                        {form.usagePerCustomerEnabled ? `Limite por cliente: ${form.usagePerCustomer}.` : form.firstPurchaseOnly ? "Somente primeira compra." : "Sem limite por cliente."}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
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
