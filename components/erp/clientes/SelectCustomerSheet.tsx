"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SearchIcon, UserIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, EmailInput, PhoneInput, Checkbox, RadioButton } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import {
    fetchPartnerCustomersBucket,
    type PartnerCustomerBucketItem,
} from "@/app/actions/erp/client-loaders"
import { createPOSCustomerQuickAction } from "@/app/actions/erp/pdv"

export type PinnedCustomerSummary = {
    id: string
    name: string
    email?: string | null
    avatar_url?: string | null
}

interface SelectCustomerSheetProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (customer: PartnerCustomerBucketItem | PinnedCustomerSummary) => void
    onCreateCustomer?: (payload: {
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
    selectedCustomerId?: string
    selectedCustomerIds?: string[]
    pinnedCustomer?: PinnedCustomerSummary | null
    onRequestRemoveSelected?: () => void
    title?: string
}

function CustomerRowSkeleton() {
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

const SelectCustomerSheet = ({
    isOpen,
    onClose,
    onSelect,
    onCreateCustomer,
    partnerId,
    selectedCustomerId,
    selectedCustomerIds,
    pinnedCustomer,
    onRequestRemoveSelected,
    title = "Selecionar Cliente",
}: SelectCustomerSheetProps) => {
    const [appendPulse, setAppendPulse] = useState(false)
    const [isNewCustomerSheetOpen, setIsNewCustomerSheetOpen] = useState(false)
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
    const [newCustomerName, setNewCustomerName] = useState("")
    const [newCustomerEmail, setNewCustomerEmail] = useState("")
    const [newCustomerPhone, setNewCustomerPhone] = useState("")
    const [nameError, setNameError] = useState<string | null>(null)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [phoneError, setPhoneError] = useState<string | null>(null)
    const [tempSelectedCustomer, setTempSelectedCustomer] = useState<PartnerCustomerBucketItem | PinnedCustomerSummary | null>(null)
    const loadMoreLock = useRef(false)
    const listScrollRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isCloseLocked = isCreatingCustomer
    const handleSafeClose = useCallback(() => {
        if (isCloseLocked) return
        onClose()
    }, [isCloseLocked, onClose])

    const handleCreateCustomer = useCallback(async (payload: {
        name: string
        email?: string
        phone?: string
    }) => {
        if (onCreateCustomer) {
            return onCreateCustomer(payload)
        }
        const result = await createPOSCustomerQuickAction({
            partnerId,
            name: payload.name,
            email: payload.email,
            phone: payload.phone
        })
        if (!result.success || !result.data) {
            throw new Error(result.error || "Não foi possível cadastrar o cliente.")
        }
        return result.data
    }, [onCreateCustomer, partnerId])

    const handleSaveSelection = useCallback(() => {
        if (!selectedCustomerIds) {
            if (tempSelectedCustomer) {
                onSelect(tempSelectedCustomer)
            } else if (onRequestRemoveSelected) {
                onRequestRemoveSelected()
            }
        }
        onClose()
    }, [tempSelectedCustomer, onSelect, onRequestRemoveSelected, onClose, selectedCustomerIds])

    const canSave = selectedCustomerIds || tempSelectedCustomer !== null || !!onRequestRemoveSelected

    const matchesSearch = useCallback((item: PartnerCustomerBucketItem, q: string) => {
        return (
            (item.name || "").toLowerCase().includes(q) ||
            (item.email || "").toLowerCase().includes(q) ||
            (item.phone || "").toLowerCase().includes(q)
        )
    }, [])

    const postFilter = useCallback(
        (items: PartnerCustomerBucketItem[]) => {
            if (!selectedCustomerId || !pinnedCustomer) return items
            const rest = items.filter((c) => c.id !== selectedCustomerId)
            const inList = items.find((c) => c.id === selectedCustomerId)
            const head: PartnerCustomerBucketItem =
                inList ?? {
                    id: pinnedCustomer.id,
                    name: pinnedCustomer.name,
                    email: pinnedCustomer.email ?? null,
                    phone: null,
                    avatar_url: pinnedCustomer.avatar_url ?? null,
                }
            return [head, ...rest]
        },
        [selectedCustomerId, pinnedCustomer]
    )

    const pickerOptions = useMemo(
        () => ({
            pageSize: 8,
            postFilter,
            resetPagingKey: `${selectedCustomerId ?? ""}-${pinnedCustomer?.id ?? ""}`,
        }),
        [postFilter, selectedCustomerId, pinnedCustomer?.id]
    )

    const loadCustomersBucket = useCallback(
        () => fetchPartnerCustomersBucket(partnerId),
        [partnerId]
    )

    const picker = usePickerBucket(loadCustomersBucket, matchesSearch, pickerOptions)

    const pickerRef = useRef(picker)
    pickerRef.current = picker

    useEffect(() => {
        if (!isOpen) return
        void pickerRef.current.loadBucket()
    }, [isOpen])

    useEffect(() => {
        if (isOpen) return
        setIsNewCustomerSheetOpen(false)
        setIsCreatingCustomer(false)
        setNewCustomerName("")
        setNewCustomerEmail("")
        setNewCustomerPhone("")
        setNameError(null)
        setEmailError(null)
        setPhoneError(null)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        if (selectedCustomerId) {
            if (pinnedCustomer && pinnedCustomer.id === selectedCustomerId) {
                setTempSelectedCustomer(pinnedCustomer)
            } else {
                const found = picker.displayed.find((c) => c.id === selectedCustomerId)
                if (found) {
                    setTempSelectedCustomer(found)
                } else {
                    setTempSelectedCustomer({ id: selectedCustomerId, name: "Carregando..." })
                }
            }
        } else {
            setTempSelectedCustomer(null)
        }
    }, [isOpen, selectedCustomerId, pinnedCustomer])

    useEffect(() => {
        if (isOpen && selectedCustomerId && (!tempSelectedCustomer || tempSelectedCustomer.name === "Carregando...")) {
            const found = picker.displayed.find((c) => c.id === selectedCustomerId)
            if (found) {
                setTempSelectedCustomer(found)
            }
        }
    }, [isOpen, selectedCustomerId, picker.displayed, tempSelectedCustomer])

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
                        name="customerSearch"
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
                        setIsNewCustomerSheetOpen(true)
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
                            <CustomerRowSkeleton key={i} />
                        ))}
                    </div>
                ) : picker.displayed.length > 0 ? (
                    <div className="flex flex-col px-2 pb-2">
                        {picker.displayed.map((customer) => {
                            const isCurrentlySelected = selectedCustomerIds
                                ? selectedCustomerIds.includes(customer.id)
                                : tempSelectedCustomer?.id === customer.id
                            return (
                                <div
                                    key={customer.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (selectedCustomerIds) {
                                            onSelect(customer)
                                        } else {
                                            if (tempSelectedCustomer?.id === customer.id) {
                                                setTempSelectedCustomer(null)
                                            } else {
                                                setTempSelectedCustomer(customer)
                                            }
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
                                            if (selectedCustomerIds) {
                                                onSelect(customer)
                                            } else {
                                                if (tempSelectedCustomer?.id === customer.id) {
                                                    setTempSelectedCustomer(null)
                                                } else {
                                                    setTempSelectedCustomer(customer)
                                                }
                                            }
                                        }
                                    }}
                                    className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border cursor-pointer ${isCurrentlySelected
                                        ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                                        : "hover:bg-gray-50 dark:hover:bg-dark-border/40"
                                        }`}
                                >
                                    {selectedCustomerIds && (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={isCurrentlySelected}
                                                onChange={() => onSelect(customer)}
                                            />
                                        </div>
                                    )}
                                    <UserProfileImage
                                        fullName={customer.name || "Cliente"}
                                        imageUrl={customer.avatar_url}
                                        className="h-12 w-12 shrink-0 text-lg"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {customer.name}
                                            </span>
                                        </div>
                                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            ID #{customer.id ? customer.id.substring(0, 5).toUpperCase() : "-"}
                                        </p>
                                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            {customer.email || "Sem e-mail"}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {!selectedCustomerIds ? (
                                            <RadioButton
                                                name="selectedCustomer"
                                                value={customer.id}
                                                checked={tempSelectedCustomer?.id === customer.id}
                                                onChange={() => {
                                                    if (tempSelectedCustomer?.id === customer.id) {
                                                        setTempSelectedCustomer(null)
                                                    } else {
                                                        setTempSelectedCustomer(customer)
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
                                <CustomerRowSkeleton />
                                <CustomerRowSkeleton />
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
                            title="Nenhum cliente encontrado"
                            subtitle="Tente outro termo de busca ou cadastre um novo cliente."
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

    const newCustomerSheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo cliente</h2>
                <Button variant="filled" onClick={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }} size="icon" disabled={isCloseLocked}>
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <Input
                    label="Nome"
                    name="newCustomerName"
                    value={newCustomerName}
                    onChange={(e) => {
                        setNewCustomerName(e.target.value)
                        setNameError(null)
                    }}
                    placeholder="Nome do cliente"
                    error={!!nameError}
                    errorMessage={nameError || undefined}
                />
                <EmailInput
                    label="E-mail"
                    name="newCustomerEmail"
                    value={newCustomerEmail}
                    onChange={(e) => {
                        setNewCustomerEmail(e.target.value)
                        setEmailError(null)
                    }}
                    error={!!emailError}
                    errorMessage={emailError || undefined}
                />
                <PhoneInput
                    label="Telefone"
                    name="newCustomerPhone"
                    value={newCustomerPhone}
                    onChange={(e) => {
                        setNewCustomerPhone(e.target.value)
                        setPhoneError(null)
                    }}
                    error={!!phoneError}
                    errorMessage={phoneError || undefined}
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewCustomerSheetOpen(false)} disabled={isCloseLocked}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        isLoading={isCreatingCustomer}
                        onClick={async () => {
                            const name = newCustomerName.trim()
                            const email = newCustomerEmail.trim()
                            const phone = newCustomerPhone.trim()

                            let hasError = false
                            setNameError(null)
                            setEmailError(null)
                            setPhoneError(null)

                            if (!name) {
                                setNameError("Informe o nome do cliente.")
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

                            setIsCreatingCustomer(true)
                            try {
                                const created = await handleCreateCustomer({
                                    name,
                                    email: email || undefined,
                                    phone: phone || undefined,
                                })
                                if (!created) return

                                setNewCustomerName("")
                                setNewCustomerEmail("")
                                setNewCustomerPhone("")
                                setIsNewCustomerSheetOpen(false)
                                onSelect(created)
                                onClose()
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : "Não foi possível criar o cliente."
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
                                setIsCreatingCustomer(false)
                            }
                        }}
                    >
                        Salvar cliente
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
                <BottomSheet isOpen={isNewCustomerSheetOpen} onClose={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }}>
                    {newCustomerSheetContent}
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
                            ? isNewCustomerSheetOpen
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
                    className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isNewCustomerSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onClick={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isNewCustomerSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {newCustomerSheetContent}
                    </div>
                </div>
            </Portal>
        </>
    )
}

export default SelectCustomerSheet
