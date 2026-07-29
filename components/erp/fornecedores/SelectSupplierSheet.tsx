"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SearchIcon, UserIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, EmailInput, PhoneInput, Checkbox, RadioButton } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import {
    fetchPartnerSuppliersBucket,
    type PartnerSupplierBucketItem,
} from "@/app/actions/erp/client-loaders"
import { createSupplierQuickAction } from "@/app/actions/erp/suppliers"

export type PinnedSupplierSummary = {
    id: string
    name: string
    email?: string | null
    avatar_url?: string | null
}

interface SelectSupplierSheetProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (supplier: PartnerSupplierBucketItem | PinnedSupplierSummary) => void
    onCreateSupplier?: (payload: {
        name: string
        email?: string
        phone?: string
    }) => Promise<{
        id: string
        name: string
        email?: string | null
        phone?: string | null
    } | null>
    partnerId: string
    selectedSupplierId?: string
    selectedSupplierIds?: string[]
    pinnedSupplier?: PinnedSupplierSummary | null
    onRequestRemoveSelected?: () => void
    title?: string
}

function SupplierRowSkeleton() {
    return (
        <div className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
            <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
                <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
            </div>
        </div>
    )
}

const SelectSupplierSheet = ({
    isOpen,
    onClose,
    onSelect,
    onCreateSupplier,
    partnerId,
    selectedSupplierId,
    selectedSupplierIds,
    pinnedSupplier,
    onRequestRemoveSelected,
    title = "Selecionar Fornecedor",
}: SelectSupplierSheetProps) => {
    const [appendPulse, setAppendPulse] = useState(false)
    const [isNewSupplierSheetOpen, setIsNewSupplierSheetOpen] = useState(false)
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
    const [newSupplierName, setNewSupplierName] = useState("")
    const [newSupplierEmail, setNewSupplierEmail] = useState("")
    const [newSupplierPhone, setNewSupplierPhone] = useState("")
    const [nameError, setNameError] = useState<string | null>(null)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [phoneError, setPhoneError] = useState<string | null>(null)
    const [tempSelectedSupplier, setTempSelectedSupplier] = useState<PartnerSupplierBucketItem | PinnedSupplierSummary | null>(null)
    const loadMoreLock = useRef(false)
    const listScrollRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isCloseLocked = isCreatingSupplier
    const handleSafeClose = useCallback(() => {
        if (isCloseLocked) return
        onClose()
    }, [isCloseLocked, onClose])

    const handleCreateSupplier = useCallback(async (payload: {
        name: string
        email?: string
        phone?: string
    }) => {
        if (onCreateSupplier) {
            return onCreateSupplier(payload)
        }
        const result = await createSupplierQuickAction({
            partnerId,
            name: payload.name,
            email: payload.email,
            phone: payload.phone
        })
        if (!result.success || !result.data) {
            throw new Error(result.error || "Não foi possível cadastrar o fornecedor.")
        }
        return result.data
    }, [onCreateSupplier, partnerId])

    const handleSaveSelection = useCallback(() => {
        if (!selectedSupplierIds) {
            if (tempSelectedSupplier) {
                onSelect(tempSelectedSupplier)
            } else if (onRequestRemoveSelected) {
                onRequestRemoveSelected()
            }
        }
        onClose()
    }, [tempSelectedSupplier, onSelect, onRequestRemoveSelected, onClose, selectedSupplierIds])

    const canSave = selectedSupplierIds || tempSelectedSupplier !== null || !!onRequestRemoveSelected

    const matchesSearch = useCallback((item: PartnerSupplierBucketItem, q: string) => {
        return (
            (item.name || "").toLowerCase().includes(q) ||
            (item.email || "").toLowerCase().includes(q) ||
            (item.phone || "").toLowerCase().includes(q) ||
            (item.cnpj || "").toLowerCase().includes(q)
        )
    }, [])

    const postFilter = useCallback(
        (items: PartnerSupplierBucketItem[]) => {
            if (!selectedSupplierId || !pinnedSupplier) return items
            const rest = items.filter((c) => c.id !== selectedSupplierId)
            const inList = items.find((c) => c.id === selectedSupplierId)
            const head: PartnerSupplierBucketItem =
                inList ?? {
                    id: pinnedSupplier.id,
                    name: pinnedSupplier.name,
                    email: pinnedSupplier.email ?? null,
                    phone: null,
                    cnpj: null,
                }
            return [head, ...rest]
        },
        [selectedSupplierId, pinnedSupplier]
    )

    const pickerOptions = useMemo(
        () => ({
            pageSize: 8,
            postFilter,
            resetPagingKey: `${selectedSupplierId ?? ""}-${pinnedSupplier?.id ?? ""}`,
        }),
        [postFilter, selectedSupplierId, pinnedSupplier?.id]
    )

    const loadSuppliersBucket = useCallback(
        () => fetchPartnerSuppliersBucket(partnerId),
        [partnerId]
    )

    const picker = usePickerBucket(loadSuppliersBucket, matchesSearch, pickerOptions)

    const pickerRef = useRef(picker)
    pickerRef.current = picker

    useEffect(() => {
        if (!isOpen) return
        void pickerRef.current.loadBucket()
    }, [isOpen])

    useEffect(() => {
        if (isOpen) return
        setIsNewSupplierSheetOpen(false)
        setIsCreatingSupplier(false)
        setNewSupplierName("")
        setNewSupplierEmail("")
        setNewSupplierPhone("")
        setNameError(null)
        setEmailError(null)
        setPhoneError(null)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        if (selectedSupplierId) {
            if (pinnedSupplier && pinnedSupplier.id === selectedSupplierId) {
                setTempSelectedSupplier(pinnedSupplier)
            } else {
                const found = picker.displayed.find((c) => c.id === selectedSupplierId)
                if (found) {
                    setTempSelectedSupplier(found)
                } else {
                    setTempSelectedSupplier({ id: selectedSupplierId, name: "Carregando..." })
                }
            }
        } else {
            setTempSelectedSupplier(null)
        }
    }, [isOpen, selectedSupplierId, pinnedSupplier])

    useEffect(() => {
        if (isOpen && selectedSupplierId && (!tempSelectedSupplier || tempSelectedSupplier.name === "Carregando...")) {
            const found = picker.displayed.find((c) => c.id === selectedSupplierId)
            if (found) {
                setTempSelectedSupplier(found)
            }
        }
    }, [isOpen, selectedSupplierId, picker.displayed, tempSelectedSupplier])

    useEffect(() => {
        const root = listScrollRef.current
        const target = sentinelRef.current
        if (!isOpen || !root || !target || !picker.hasMore) return

        const obs = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting || loadMoreLock.current) return
                loadMoreLock.current = true
                setAppendPulse(true)
                picker.loadMore()
                window.setTimeout(() => setAppendPulse(false), 200)
                window.setTimeout(() => {
                    loadMoreLock.current = false
                }, 120)
            },
            { root, rootMargin: "100px", threshold: 0 }
        )
        obs.observe(target)
        return () => obs.disconnect()
    }, [isOpen, picker.hasMore, picker.loadMore, picker.displayed.length, picker.filtered.length])

    const showEmpty =
        !picker.isLoadingBucket &&
        picker.isLoaded &&
        picker.displayed.length === 0 &&
        picker.filtered.length === 0

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
                <Button variant="filled" onClick={handleSafeClose} size="icon" disabled={isCloseLocked}>
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface flex items-center gap-3">
                <div className="flex-1">
                    <Input
                        label=""
                        name="supplierSearch"
                        placeholder="Buscar por nome, email ou telefone..."
                        value={picker.searchQuery}
                        onChange={(e) => picker.setSearchQuery(e.target.value)}
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        className="mb-0"
                        variant="full-rounded"
                    />
                </div>
                <Button
                    onClick={() => {
                        setNameError(null)
                        setEmailError(null)
                        setPhoneError(null)
                        setIsNewSupplierSheetOpen(true)
                    }}
                    className="h-[42px] w-[42px] shrink-0"
                    leftIcon={<PlusIcon size={18} />}
                />
            </div>

            <div
                ref={listScrollRef}
                className="custom-scrollbar flex-1 overflow-y-auto p-0"
            >
                {picker.isLoadingBucket ? (
                    <div className="flex flex-col">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <SupplierRowSkeleton key={i} />
                        ))}
                    </div>
                ) : picker.displayed.length > 0 ? (
                    <div className="flex flex-col px-2 pb-2">
                        {picker.displayed.map((supplier) => {
                            const isCurrentlySelected = selectedSupplierIds
                                ? selectedSupplierIds.includes(supplier.id)
                                : tempSelectedSupplier?.id === supplier.id
                            return (
                                <div
                                    key={supplier.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (selectedSupplierIds) {
                                            onSelect(supplier)
                                        } else {
                                            if (tempSelectedSupplier?.id === supplier.id) {
                                                setTempSelectedSupplier(null)
                                            } else {
                                                setTempSelectedSupplier(supplier)
                                            }
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
                                            if (selectedSupplierIds) {
                                                onSelect(supplier)
                                            } else {
                                                if (tempSelectedSupplier?.id === supplier.id) {
                                                    setTempSelectedSupplier(null)
                                                } else {
                                                    setTempSelectedSupplier(supplier)
                                                }
                                            }
                                        }
                                    }}
                                    className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border cursor-pointer ${isCurrentlySelected
                                        ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                                        : "hover:bg-gray-50 dark:hover:bg-dark-border/40"
                                        }`}
                                >
                                    {selectedSupplierIds && (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={isCurrentlySelected}
                                                onChange={() => onSelect(supplier)}
                                            />
                                        </div>
                                    )}
                                    <UserProfileImage
                                        fullName={supplier.name || "Fornecedor"}
                                        imageUrl={(supplier as any).image_url || (supplier as any).imageUrl || (supplier as any).avatar_url}
                                        className="h-12 w-12 shrink-0 text-lg"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {supplier.name}
                                            </span>
                                        </div>
                                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            ID #{supplier.id ? supplier.id.substring(0, 5).toUpperCase() : "-"}
                                        </p>
                                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            {supplier.email || "Sem e-mail"}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {!selectedSupplierIds ? (
                                            <RadioButton
                                                name="selectedSupplier"
                                                value={supplier.id}
                                                checked={tempSelectedSupplier?.id === supplier.id}
                                                onChange={() => {
                                                    if (tempSelectedSupplier?.id === supplier.id) {
                                                        setTempSelectedSupplier(null)
                                                    } else {
                                                        setTempSelectedSupplier(supplier)
                                                    }
                                                }}
                                            />
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}

                        {appendPulse && picker.hasMore && (
                            <div className="flex flex-col border-t border-brand-border/50 pt-1 dark:border-dark-border/50">
                                <SupplierRowSkeleton />
                                <SupplierRowSkeleton />
                            </div>
                        )}

                        {picker.hasMore && (
                            <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />
                        )}
                    </div>
                ) : showEmpty ? (
                    <div className="px-4 py-12">
                        <IconPlaceholder
                            icon={UserIcon}
                            title="Nenhum fornecedor encontrado"
                            subtitle="Tente outro termo de busca ou cadastre um novo fornecedor."
                        />
                    </div>
                ) : null}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={handleSafeClose} disabled={isCloseLocked}>
                        Cancelar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        onClick={handleSaveSelection}
                        disabled={isCloseLocked || !canSave}
                    >
                        Salvar
                    </Button>
                </div>
            </footer>
        </div>
    )

    const newSupplierSheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo fornecedor</h2>
                <Button variant="filled" onClick={() => { if (!isCloseLocked) setIsNewSupplierSheetOpen(false) }} size="icon" disabled={isCloseLocked}>
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <Input
                    label="Nome"
                    name="newSupplierName"
                    value={newSupplierName}
                    onChange={(e) => {
                        setNewSupplierName(e.target.value)
                        setNameError(null)
                    }}
                    placeholder="Nome do fornecedor"
                    error={!!nameError}
                    errorMessage={nameError || undefined}
                />
                <EmailInput
                    label="E-mail"
                    name="newSupplierEmail"
                    value={newSupplierEmail}
                    onChange={(e) => {
                        setNewSupplierEmail(e.target.value)
                        setEmailError(null)
                    }}
                    error={!!emailError}
                    errorMessage={emailError || undefined}
                />
                <PhoneInput
                    label="Telefone"
                    name="newSupplierPhone"
                    value={newSupplierPhone}
                    onChange={(e) => {
                        setNewSupplierPhone(e.target.value)
                        setPhoneError(null)
                    }}
                    error={!!phoneError}
                    errorMessage={phoneError || undefined}
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewSupplierSheetOpen(false)} disabled={isCloseLocked}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        isLoading={isCreatingSupplier}
                        onClick={async () => {
                            const name = newSupplierName.trim()
                            const email = newSupplierEmail.trim()
                            const phone = newSupplierPhone.trim()

                            let hasError = false
                            setNameError(null)
                            setEmailError(null)
                            setPhoneError(null)

                            if (!name) {
                                setNameError("Informe o nome do fornecedor.")
                                hasError = true
                            }

                            if (email) {
                                const isValidEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
                                if (!isValidEmail) {
                                    setEmailError("Informe um e-mail válido, como nome@exemplo.com.")
                                    hasError = true
                                }
                            }

                            if (hasError) return

                            setIsCreatingSupplier(true)
                            try {
                                const created = await handleCreateSupplier({
                                    name,
                                    email: email || undefined,
                                    phone: phone || undefined,
                                })
                                if (!created) return

                                setNewSupplierName("")
                                setNewSupplierEmail("")
                                setNewSupplierPhone("")
                                setIsNewSupplierSheetOpen(false)
                                onSelect(created)
                                onClose()
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : "Não foi possível criar o fornecedor."
                                const lowerMsg = errorMsg.toLowerCase()
                                if (lowerMsg.includes("email") || lowerMsg.includes("e-mail")) {
                                    setEmailError(errorMsg)
                                } else if (lowerMsg.includes("telefone") || lowerMsg.includes("phone")) {
                                    setPhoneError(errorMsg)
                                } else if (lowerMsg.includes("nome") || lowerMsg.includes("name")) {
                                    setNameError(errorMsg)
                                } else {
                                    setNameError(errorMsg)
                                }
                            } finally {
                                setIsCreatingSupplier(false)
                            }
                        }}
                    >
                        Salvar fornecedor
                    </Button>
                </div>
            </footer>
        </div >
    )

    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={isOpen} onClose={handleSafeClose}>
                    {content}
                </BottomSheet>
                <BottomSheet isOpen={isNewSupplierSheetOpen} onClose={() => { if (!isCloseLocked) setIsNewSupplierSheetOpen(false) }}>
                    {newSupplierSheetContent}
                </BottomSheet>
            </>
        )
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onClick={handleSafeClose}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
                            ? isNewSupplierSheetOpen
                                ? "-translate-x-10 scale-[0.97] opacity-70"
                                : "translate-x-0 opacity-100"
                            : "translate-x-[120%] opacity-100"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {content}
                    </div>
                </div>
            </Portal>
            <Portal>
                <div
                    className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isNewSupplierSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onClick={() => { if (!isCloseLocked) setIsNewSupplierSheetOpen(false) }}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isNewSupplierSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {newSupplierSheetContent}
                    </div>
                </div>
            </Portal>
        </>
    )
}

export default SelectSupplierSheet
