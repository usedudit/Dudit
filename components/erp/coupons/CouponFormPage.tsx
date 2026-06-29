"use client"

import React, { useMemo, useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import {
    Badge,
    Button,
    Checkbox,
    DatePicker,
    FormDropdown,
    FormSection,
    Input,
    MoneyInput,
    PercentageInput,
    Pagination,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    ThreeDotsLoader,
    UnsavedChangesDialog,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils/formatters"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { ChevronLeftIcon, EditIcon, SaveIcon } from "@/lib/icons"
import SelectCouponProductsSheet from "./SelectCouponProductsSheet"
import SelectCouponCategoriesSheet from "./SelectCouponCategoriesSheet"
import SelectCouponServicesSheet from "./SelectCouponServicesSheet"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import {
    CouponFormState,
    CouponRelations,
    CouponRow,
    CouponScopeData,
    ScopeCustomer,
    ScopeItem,
    getCouponPrimaryMeta,
} from "@/lib/types/coupon"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"

interface CouponFormPageProps {
    partnerId: string
    mode: "create" | "edit"
    coupon?: CouponRow | null
    form: CouponFormState
    setForm: React.Dispatch<React.SetStateAction<CouponFormState>>
    scopeData: CouponScopeData
    relations: CouponRelations
    setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>
    setSelectedServiceIds: React.Dispatch<React.SetStateAction<string[]>>
    setSelectedCategoryIds: React.Dispatch<React.SetStateAction<string[]>>
    setSelectedCustomerIds: (value: React.SetStateAction<string[]>, newCustomerObj?: ScopeCustomer) => void
    onBack: () => void
    onSave: () => void
    isSaving: boolean
    isLoadingScope: boolean
}

type PickerMode = "products" | "services" | "categories" | "customers" | "subscriptions" | null

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

function ScopeField({
    label,
    actionLabel,
    onAction,
    children,
}: {
    label: string
    actionLabel?: string | null
    onAction?: () => void
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{label}</span>
                {actionLabel && onAction ? (
                    <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onAction}>
                        {actionLabel}
                    </Button>
                ) : null}
            </div>
            {children}
        </div>
    )
}

function PagedLinkedItems<T extends { id: string }>({
    items,
    page,
    onPageChange,
    renderItem,
    emptyMessage,
}: {
    items: T[]
    page: number
    onPageChange: (page: number) => void
    renderItem: (item: T) => React.ReactNode
    emptyMessage?: string
}) {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * ITEMS_PER_PAGE
    const paginatedItems = items.slice(start, start + ITEMS_PER_PAGE)

    if (items.length === 0) {
        return emptyMessage ? (
            <p className="text-sm text-brand-inactive-text dark:text-dark-body py-2">{emptyMessage}</p>
        ) : null
    }

    return (
        <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
            <div className="divide-y divide-brand-border dark:divide-dark-border">
                {paginatedItems.map((item) => renderItem(item))}
            </div>
            {totalPages > 1 && (
                <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={onPageChange} inline />
            )}
        </div>
    )
}

const ITEMS_PER_PAGE = 5
const PLACEHOLDER_IMAGE = "https://Img.dudit.com.br/static/Placeholder.png"

function LinkedItemRow({
    name,
    description,
    imageUrl,
    avatarName,
    isActive,
    onRemove,
}: {
    name: string
    description?: string | null
    imageUrl?: string | null
    avatarName?: string | null
    isActive?: boolean
    onRemove: () => void
}) {
    return (
        <div className="flex items-center gap-3 py-2.5 px-3 border-b border-brand-border dark:border-dark-border last:border-0">
            {avatarName ? (
                <UserProfileImage
                    fullName={avatarName}
                    imageUrl={imageUrl || undefined}
                    className="w-10 h-10 shrink-0 text-[14px]"
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                    <img
                        src={imageUrl || PLACEHOLDER_IMAGE}
                        alt=""
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                    />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]">
                        {name}
                    </span>
                    {isActive != null && (
                        <Badge variant={isActive === false ? "gray" : "green"} className="shrink-0 scale-90">
                            {isActive === false ? "Inativo" : "Ativo"}
                        </Badge>
                    )}
                </div>
                {description && (
                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                        {description}
                    </p>
                )}
            </div>
            <Button
                type="button"
                variant="link"
                className="shrink-0 text-xs px-2"
                onClick={onRemove}
            >
                Remover
            </Button>
        </div>
    )
}

const sanitizeCouponCode = (value: string): string => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 20)
}

export default function CouponFormPage({
    partnerId,
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
    const [pickerMode, setPickerMode] = useState<PickerMode>(null)
    const [linkedPage, setLinkedPage] = useState(1)
    const [customerPage, setCustomerPage] = useState(1)

    const initialSnapshot = useMemo(() => {
        return JSON.stringify({
            form: mode === "edit" && coupon ? coupon : form,
            relations: {
                productIds: [...relations.productIds].sort(),
                categoryIds: [...relations.categoryIds].sort(),
                serviceIds: [...relations.serviceIds].sort(),
                customerIds: [...relations.customerIds].sort()
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, coupon?.id])

    const currentSnapshot = useMemo(() => {
        return JSON.stringify({
            form,
            relations: {
                productIds: [...relations.productIds].sort(),
                categoryIds: [...relations.categoryIds].sort(),
                serviceIds: [...relations.serviceIds].sort(),
                customerIds: [...relations.customerIds].sort()
            }
        })
    }, [form, relations.productIds, relations.categoryIds, relations.serviceIds, relations.customerIds])

    const isDirty = currentSnapshot !== initialSnapshot
    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

    const pageTitle = mode === "edit" ? "Editar cupom" : "Novo cupom"
    const dateFromValue = form.startsAt ? new Date(`${form.startsAt}T12:00:00`) : undefined
    const dateToValue = form.endsAt ? new Date(`${form.endsAt}T12:00:00`) : undefined

    const applyScopeActionLabel = form.applyScope === "products"
        ? "Selecionar produtos"
        : form.applyScope === "categories"
            ? "Selecionar categorias"
            : form.applyScope === "services"
                ? "Selecionar serviços"
                : null

    const linkedScopeItems = form.applyScope === "products"
        ? relations.products
        : form.applyScope === "categories"
            ? relations.categories
            : form.applyScope === "services"
                ? relations.services
                : []

    const handleSaveProducts = useCallback((ids: string[]) => {
        setSelectedProductIds(ids)
        setLinkedPage(1)
        setPickerMode(null)
    }, [setSelectedProductIds])

    const handleSaveServices = useCallback((ids: string[]) => {
        setSelectedServiceIds(ids)
        setLinkedPage(1)
        setPickerMode(null)
    }, [setSelectedServiceIds])

    const handleSaveCategories = useCallback((ids: string[]) => {
        setSelectedCategoryIds(ids)
        setLinkedPage(1)
        setPickerMode(null)
    }, [setSelectedCategoryIds])

    const handleOpenPicker = useCallback((mode: PickerMode) => {
        setPickerMode(mode)
    }, [])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                            <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading flex items-center gap-3">
                                        <span className="truncate">{pageTitle}</span>
                                        {mode === "edit" && (
                                            <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5">
                                                Editando
                                            </Badge>
                                        )}
                                    </h1>
                                    <div className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        {mode === "edit" && coupon ? getCouponPrimaryMeta(coupon) : "Preencha as regras promocionais e o público do cupom."}
                                    </div>
                                </div>

                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={onSave} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
                                        {isSaving ? "Salvando..." : "Salvar"}
                                    </Button>
                                </div>
                            </div>

                            <div className="w-full md:mt-4">
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                    <TabsTrigger value="scope">Escopo</TabsTrigger>
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
                                            <FadeIn key="general" className="space-y-8">
                                                <FormSection title="Identificação">
                                                    <div className="grid grid-cols-12 gap-5">
                                                        <div className="col-span-12 md:col-span-7">
                                                            <Input
                                                                label="Código do cupom"
                                                                placeholder="Ex: BEMVINDO10"
                                                                value={form.code}
                                                                onChange={(event) => setForm((prev) => ({ ...prev, code: sanitizeCouponCode(event.target.value) }))}
                                                                maxLength={20}
                                                                showCharacterCount={true}
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
                                                                    { value: "free_shipping", label: "Entrega grátis" },
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
                                                                <PercentageInput
                                                                    label={form.discountType === "percentage" ? "Desconto (%)" : "Valor do desconto"}
                                                                    value={String(form.discountValue)}
                                                                    onChange={(val) => setForm((prev) => ({ ...prev, discountValue: val }))}
                                                                    disabled={form.discountType === "free_shipping"}
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="col-span-12 md:col-span-6">
                                                            <MoneyInput
                                                                label="Valor mínimo da sacola"
                                                                value={Number(form.minCartValue || 0)}
                                                                onChange={(value) => setForm((prev) => ({ ...prev, minCartValue: value }))}
                                                            />
                                                        </div>
                                                        <div className="col-span-12 md:col-span-6">
                                                            <MoneyInput
                                                                label="Desconto máximo"
                                                                value={Number(form.maxDiscountValue || 0)}
                                                                onChange={(value) => setForm((prev) => ({
                                                                    ...prev,
                                                                    maxDiscountValue: value,
                                                                    maxDiscountEnabled: value > 0
                                                                }))}
                                                            />
                                                        </div>
                                                    </div>
                                                </FormSection>

                                                <FormSection hasSeparator title="Opções">
                                                    <div className="space-y-4">
                                                        <label className="flex items-start gap-3">
                                                            <Checkbox checked={form.allowCombination} onChange={(value) => setForm((prev) => ({ ...prev, allowCombination: Boolean(value) }))} />
                                                            <div>
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Permitir combinação</p>
                                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Define se esse desconto pode coexistir com outras promoções.</p>
                                                            </div>
                                                        </label>
                                                        <label className="flex items-start gap-3">
                                                            <Checkbox checked={form.isAutomatic} onChange={(value) => setForm((prev) => ({ ...prev, isAutomatic: Boolean(value) }))} />
                                                            <div>
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Cupom automático</p>
                                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Pode ser selecionado automaticamente no fluxo de venda.</p>
                                                            </div>
                                                        </label>
                                                    </div>
                                                </FormSection>
                                            </FadeIn>
                                        </TabsContent>

                                        <TabsContent value="scope" className="mt-0">
                                            <FadeIn key="scope" className="space-y-8">
                                                <FormSection title="Escopo">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <ScopeField
                                                            label="Aplicar a"
                                                            actionLabel={applyScopeActionLabel}
                                                            onAction={
                                                    applyScopeActionLabel && form.applyScope !== "all"
                                                        ? () => handleOpenPicker(form.applyScope)
                                                        : undefined
                                                            }
                                                        >
                                                            <FormDropdown
                                                                label=""
                                                                value={form.applyScope}
                                                                setValue={(value) => setForm((prev) => ({ ...prev, applyScope: value as CouponFormState["applyScope"] }))}
                                                                options={[
                                                                    { value: "all", label: "Todos os produtos e serviços" },
                                                                    { value: "categories", label: "Categorias específicas" },
                                                                    { value: "products", label: "Produtos específicos" },
                                                                    { value: "services", label: "Serviços específicos" },
                                                                    { value: "subscriptions", label: "Assinaturas específicas" },
                                                                ]}
                                                            />
                                                        </ScopeField>

                                                        <ScopeField
                                                            label="Escopo de clientes"
                                                            actionLabel={form.customerScope === "specific" ? "Selecionar clientes" : null}
                                                            onAction={
                                                            form.customerScope === "specific"
                                                                ? () => handleOpenPicker("customers")
                                                                : undefined
                                                            }
                                                        >
                                                            <FormDropdown
                                                                label=""
                                                                value={form.customerScope}
                                                                setValue={(value) => setForm((prev) => ({ ...prev, customerScope: value as CouponFormState["customerScope"] }))}
                                                                options={[
                                                                    { value: "all", label: "Todos os clientes" },
                                                                    { value: "specific", label: "Clientes específicos" },
                                                                ]}
                                                            />
                                                        </ScopeField>
                                                    </div>
                                                </FormSection>

                                                {form.applyScope !== "all" && (
                                                    <section className="space-y-4">
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Itens vinculados</h3>
                                                        <PagedLinkedItems
                                                            items={linkedScopeItems as any[]}
                                                            page={linkedPage}
                                                            onPageChange={setLinkedPage}
                                                            emptyMessage="Nenhum item vinculado. Clique em &quot;Selecionar&quot; para adicionar."
                                                            renderItem={(item: any) => {
                                                                const isProduct = form.applyScope === "products"
                                                                const isService = form.applyScope === "services"
                                                                const itemImage = isProduct || isService ? (item as ScopeItem).image : undefined
                                                                let description = ""
                                                                if (isProduct) {
                                                                    const scoped = item as ScopeItem
                                                                    const parts = [scoped.sku ? `SKU: ${scoped.sku}` : "Sem SKU"]
                                                                    if (scoped.price != null) parts.push(formatCurrency(scoped.price))
                                                                    description = parts.join(" • ")
                                                                } else if (isService) {
                                                                    description = (item as ScopeItem).price != null ? formatCurrency((item as ScopeItem).price!) : ""
                                                                }
                                                                return (
                                                                    <LinkedItemRow
                                                                        name={item.name}
                                                                        description={description || null}
                                                                        imageUrl={itemImage ? getR2ImageUrl(itemImage, "thumbnail") || PLACEHOLDER_IMAGE : null}
                                                                        isActive={item.isActive}
                                                                        onRemove={() => {
                                                                            const id = item.id
                                                                            if (form.applyScope === "products") {
                                                                                setSelectedProductIds((prev) => prev.filter((i) => i !== id))
                                                                            } else if (form.applyScope === "categories") {
                                                                                setSelectedCategoryIds((prev) => prev.filter((i) => i !== id))
                                                                            } else if (form.applyScope === "services") {
                                                                                setSelectedServiceIds((prev) => prev.filter((i) => i !== id))
                                                                            }
                                                                        }}
                                                                    />
                                                                )
                                                            }}
                                                        />
                                                    </section>
                                                )}

                                                {form.customerScope === "specific" && (
                                                    <section className="space-y-4">
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Clientes vinculados</h3>
                                                        <PagedLinkedItems
                                                            items={relations.customers}
                                                            page={customerPage}
                                                            onPageChange={setCustomerPage}
                                                            emptyMessage="Nenhum cliente vinculado. Clique em &quot;Selecionar clientes&quot; para adicionar."
                                                            renderItem={(customer: any) => (
                                                                <LinkedItemRow
                                                                    name={customer.name}
                                                                    description={customer.email || customer.phone || null}
                                                                    avatarName={customer.name}
                                                                    imageUrl={(customer as ScopeCustomer).avatarUrl}
                                                                    onRemove={() => setSelectedCustomerIds((prev) => prev.filter((id) => id !== customer.id))}
                                                                />
                                                            )}
                                                        />
                                                    </section>
                                                )}
                                            </FadeIn>
                                        </TabsContent>
                                    </AnimatePresence>
                                </div>

                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                    <SidebarCard>
                                        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-6">Limites de uso</h3>
                                        <div className="space-y-5">
                                            <div>
                                                <label className="flex items-start gap-3 mb-3">
                                                    <Checkbox checked={form.usageLimitEnabled} onChange={(value) => setForm((prev) => ({ ...prev, usageLimitEnabled: Boolean(value) }))} />
                                                    <div>
                                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Limitar uso total do cupom</p>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Define um teto global de utilizações.</p>
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

                                        </div>
                                    </SidebarCard>

                                    <SidebarCard>
                                        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-6">Validade</h3>
                                        <div className="space-y-4">
                                            <label className="flex items-start gap-3">
                                                <Checkbox checked={form.unlimitedDate} onChange={(value) => setForm((prev) => ({ ...prev, unlimitedDate: Boolean(value) }))} />
                                                <div>
                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Sem limite de data</p>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Desmarque para definir inicio e fim da campanha.</p>
                                                </div>
                                            </label>

                                            {!form.unlimitedDate && (
                                                <div className="grid grid-cols-1 gap-5">
                                                    <DatePicker
                                                        label="Inicio"
                                                        value={dateFromValue}
                                                        onChange={(date: Date | undefined) => {
                                                            const next = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""
                                                            setForm((prev) => ({ ...prev, startsAt: next }))
                                                        }}
                                                    />
                                                    <DatePicker
                                                        label="Fim"
                                                        value={dateToValue}
                                                        onChange={(date: Date | undefined) => {
                                                            const next = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""
                                                            setForm((prev) => ({ ...prev, endsAt: next }))
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </SidebarCard>
                                </div>
                            </div>
                        </div>
                    </div>
                </Tabs>

                <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3">
                    <Button variant="outline" onClick={handleBack} className="flex-1" disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={onSave} className="flex-1" disabled={isSaving}>
                        {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                </div>

                <SelectCouponProductsSheet
                    isOpen={pickerMode === "products"}
                    onClose={() => setPickerMode(null)}
                    products={scopeData.products}
                    selectedIds={relations.productIds}
                    onSave={handleSaveProducts}
                    isLoading={isLoadingScope}
                />

                <SelectCouponServicesSheet
                    isOpen={pickerMode === "services"}
                    onClose={() => setPickerMode(null)}
                    services={scopeData.services}
                    selectedIds={relations.serviceIds}
                    onSave={handleSaveServices}
                    isLoading={isLoadingScope}
                />

                <SelectCouponCategoriesSheet
                    isOpen={pickerMode === "categories"}
                    onClose={() => setPickerMode(null)}
                    categories={scopeData.categories}
                    selectedIds={relations.categoryIds}
                    onSave={handleSaveCategories}
                    isLoading={isLoadingScope}
                />

                <SelectCustomerSheet
                    isOpen={pickerMode === "customers"}
                    onClose={() => setPickerMode(null)}
                    partnerId={partnerId}
                    selectedCustomerIds={relations.customerIds}
                    onSelect={(customer) => {
                        const isSelected = relations.customerIds.includes(customer.id)
                        if (isSelected) {
                            setSelectedCustomerIds((prev) => prev.filter((id) => id !== customer.id))
                        } else {
                            const scopeCustomer: ScopeCustomer = {
                                id: customer.id,
                                name: customer.name,
                                email: customer.email,
                                phone: "phone" in customer ? customer.phone : null,
                                status: "ativo",
                                avatarUrl: customer.avatar_url || null,
                            }
                            setSelectedCustomerIds((prev) => [...prev, customer.id], scopeCustomer)
                        }
                    }}
                />
            </div>

            <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
        </FadeIn>
    )
}
