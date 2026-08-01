"use client"
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EditIcon, ChevronLeftIcon, ThreeDotsIcon, FileTextIcon } from '@/lib/icons';
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ActionsDropdown, ThreeDotsLoader, AlertModal } from '@/components/reusable';
import Pagination from '@/components/reusable/Pagination';
import { useNotification } from '@/hooks/use-notification';
import { deleteSupplierAction, getSupplierXmlImportsAction } from '@/app/actions/erp/suppliers';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { useMediaQuery } from '@/components/erp/hooks';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FadeIn } from '@/components/animations/FadeIn';
import { useSidebar } from '@/lib/sidebar-context';
import SavingStatusModal from '@/components/reusable/SavingStatusModal';
import { KPICard } from '@/components/erp/dashboard/cards/KPICard';
import { fetchCSRFTokenSingleton } from '@/hooks/use-csrf-token';

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "invoice_number", label: "Nota / Série", align: "left", width: "200px" },
    { id: "total_value", label: "Valor Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "200px" },
    { id: "date", label: "Data de Emissão", align: "left", width: "180px" },
]

interface Props {
    supplier: any;
    onBack: () => void;
    onEdit?: (supplier: any) => void;
}

export const SupplierDetailPage = ({ supplier, onBack, onEdit }: Props) => {
    const realSupplierId = supplier.originalId || supplier.id;
    const { success: notifySuccess, error: notifyError } = useNotification();
    const [activeTab, setActiveTab] = useState('General');
    const [isScrolled, setIsScrolled] = useState(false);
    const isMobile = useMediaQuery("(max-width: 767px)");
    const isTablet = useMediaQuery("(max-width: 1279px)");
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleBack = useCallback(() => onBack(), [onBack]);

    const { setHeaderOverride } = useSidebar();

    useEffect(() => {
        setHeaderOverride({
            title: supplier?.name || "Detalhes do fornecedor",
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [supplier?.name, handleBack, setHeaderOverride])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    const [fetchedImports, setFetchedImports] = useState<any[]>([]);
    const [isLoadingImports, setIsLoadingImports] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const router = useRouter();
    const [page, setPage] = useState(1);
    const itemsPerPage = 8;
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: 'date', direction: 'desc' });
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ left: false, right: false });

    const rafRef = useRef<number>(0)

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const left = scrollLeft > 0
            const right = scrollLeft < scrollWidth - clientWidth - 2
            if (prev.left === left && prev.right === right) return prev
            return { left, right }
        })
    }, []);

    const handleTableScroll = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(checkScroll)
    }, [checkScroll])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => {
            window.removeEventListener("resize", checkScroll)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [checkScroll]);

    useEffect(() => {
        const fetchImports = async () => {
            setIsLoadingImports(true);
            try {
                const res = await getSupplierXmlImportsAction(realSupplierId);
                if (res.xmlImports) setFetchedImports(res.xmlImports);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoadingImports(false);
            }
        };
        fetchImports();
    }, [realSupplierId]);

    const stats = useMemo(() => {
        const xml_count = fetchedImports.length;
        const total_imported_value = fetchedImports.reduce((sum: number, o: any) => sum + (Number(o.total_value) || 0), 0);
        const avgImport = xml_count > 0 ? total_imported_value / xml_count : 0;
        const last_import_at = xml_count > 0 && fetchedImports[0]?.created_at
            ? formatDate(fetchedImports[0].created_at)
            : '-';
        return { xml_count, total_imported_value, avgImport, last_import_at };
    }, [fetchedImports]);

    const formattedImports = useMemo(() => {
        let result = fetchedImports.map((o: any) => ({
            id: o.id,
            access_key: o.access_key,
            total_value: o.total_value,
            status: o.status,
            invoice_number: o.invoice_number,
            invoice_series: o.invoice_series,
            created_at: o.created_at,
            invoice_date: o.invoice_date,
            created_at_time: new Date(o.created_at).getTime(),
        }))

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any
                let bVal: any

                switch (sortConfig.key) {
                    case "invoice_number": aVal = a.invoice_number; bVal = b.invoice_number; break
                    case "total_value": aVal = a.total_value; bVal = b.total_value; break
                    case "status": aVal = a.status; bVal = b.status; break
                    case "date": aVal = a.created_at_time; bVal = b.created_at_time; break
                    default: return 0
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }
        return result
    }, [fetchedImports, sortConfig])

    const totalPages = Math.ceil(formattedImports.length / itemsPerPage);
    const paginatedImports = formattedImports.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const handleDetailsImport = (imp: any) => {
        router.push(`/erp/xml-import?view=${imp.id}`)
    }

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            const token = await fetchCSRFTokenSingleton() || ""
            const res = await deleteSupplierAction(realSupplierId, token)
            if (res?.error) {
                notifyError("Erro ao excluir: " + res.error)
            } else {
                notifySuccess("Fornecedor excluído com sucesso!")
                onBack()
            }
        } catch (e: any) {
            if (e?.digest?.includes?.('NEXT_REDIRECT')) {
                notifySuccess("Fornecedor excluído com sucesso!")
                return
            }
            notifyError("Erro ao excluir o fornecedor.")
        } finally {
            setIsDeleting(false)
            setShowDeleteModal(false)
        }
    }

    const supplierAddress = useMemo(() => {
        const addr = [
            supplier.street,
            supplier.number,
            supplier.complement,
            supplier.neighborhood,
            supplier.city,
            supplier.state,
            supplier.zip_code
        ].filter(Boolean).join(", ");
        return addr || null;
    }, [supplier]);

    const isPJ = supplier.person_type === "pj" || !!supplier.cnpj

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{supplier.name}</span>
                                            <Badge variant={supplier.status === 'ativo' ? 'green' : 'gray'} className="whitespace-nowrap scale-90 shrink-0">
                                                {supplier.status === 'ativo' ? 'Ativo' : 'Inativo'}
                                            </Badge>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {supplier.supplier_code || "-"} • {supplier.email || 'Sem e-mail'}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <ActionsDropdown
                                            onDelete={() => setShowDeleteModal(true)}
                                        />
                                        <Button className='whitespace-nowrap' onClick={() => onEdit?.({ ...supplier, originalId: realSupplierId })} leftIcon={<EditIcon size={18} />}>
                                            Editar fornecedor
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="General">Dados Gerais</TabsTrigger>
                                        {isTablet && (
                                            <TabsTrigger value="Imports">Importações</TabsTrigger>
                                        )}
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                {/* Main Column */}
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <TabsContent value="General" className="mt-0">
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                            {isTablet ? (
                                                /* Tablet/Mobile: Supplier Info */
                                                <div className="mb-8">
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <UserProfileImage
                                                            fullName={supplier.name || "Fornecedor"}
                                                            imageUrl={supplier.image_url || supplier.imageUrl || supplier.avatar_url}
                                                            className="w-14 h-14 text-xl shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h2 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">{supplier.name}</h2>
                                                                <Badge variant={supplier.status === 'ativo' ? 'green' : 'gray'} className="shrink-0">
                                                                    {supplier.status === 'ativo' ? 'Ativo' : 'Inativo'}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                {supplier.supplier_code || "-"} • {supplier.email || 'Sem e-mail'}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                                                                <span>Fornecedor desde {supplier.created_at ? formatDate(supplier.created_at) : '-'}</span>
                                                                <span>{isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-3">
                                                        {(supplier.cpf || supplier.cnpj) && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                    {supplier.cnpj ? 'CNPJ' : 'CPF'}
                                                                </span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {supplier.cnpj || supplier.cpf}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {supplier.phone && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Telefone</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.phone}</span>
                                                            </div>
                                                        )}
                                                        {supplier.email && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">E-mail</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[60%]">{supplier.email}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Address on tablet */}
                                                    {supplierAddress && (
                                                        <div className="mt-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5">
                                                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-2">Endereço</h3>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">{supplierAddress}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop: KPI Stats Row */}
                                                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                                                        <KPICard title="Importações" value={stats.xml_count} />
                                                        <KPICard title="Total NF-e" value={stats.total_imported_value ? formatCurrency(stats.total_imported_value) : "R$ 0,00"} />
                                                        <KPICard title="Valor médio" value={stats.avgImport ? formatCurrency(stats.avgImport) : "R$ 0,00"} />
                                                        <KPICard title="Última NF-e" value={stats.last_import_at} />
                                                    </div>

                                                    {/* Desktop: XML Imports Table */}
                                                    <ImportsContent
                                                        isLoadingImports={isLoadingImports}
                                                        formattedImports={formattedImports}
                                                        paginatedImports={paginatedImports}
                                                        totalPages={totalPages}
                                                        page={page}
                                                        setPage={setPage}
                                                        handleDetailsImport={handleDetailsImport}
                                                        tableContainerRef={tableContainerRef}
                                                        handleTableScroll={handleTableScroll}
                                                        scrollState={scrollState}
                                                        sortConfig={sortConfig}
                                                        setSortConfig={setSortConfig}
                                                    />
                                                </>
                                            )}
                                        </motion.div>
                                    </TabsContent>

                                    {/* Tablet/Mobile: Imports Tab */}
                                    {isTablet && (
                                        <TabsContent value="Imports" className="mt-0">
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                                <div className="grid grid-cols-2 gap-4 mb-6">
                                                    <KPICard title="Importações" value={stats.xml_count} />
                                                    <KPICard title="Total NF-e" value={stats.total_imported_value ? formatCurrency(stats.total_imported_value) : "R$ 0,00"} />
                                                    <KPICard title="Valor médio" value={stats.avgImport ? formatCurrency(stats.avgImport) : "R$ 0,00"} />
                                                    <KPICard title="Última NF-e" value={stats.last_import_at} />
                                                </div>

                                                <ImportsContent
                                                    isLoadingImports={isLoadingImports}
                                                    formattedImports={formattedImports}
                                                    paginatedImports={paginatedImports}
                                                    totalPages={totalPages}
                                                    page={page}
                                                    setPage={setPage}
                                                    handleDetailsImport={handleDetailsImport}
                                                    tableContainerRef={tableContainerRef}
                                                    handleTableScroll={handleTableScroll}
                                                    scrollState={scrollState}
                                                    sortConfig={sortConfig}
                                                    setSortConfig={setSortConfig}
                                                />
                                            </motion.div>
                                        </TabsContent>
                                    )}
                                </div>

                                {/* Sidebar - Desktop only */}
                                {!isTablet && (
                                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">

                                        {/* Observações */}
                                        {supplier.notes && (
                                            <section>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Observações</h3>
                                                </div>
                                                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-4">
                                                    <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1">Anotação Interna</p>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">{supplier.notes}</p>
                                                </div>
                                            </section>
                                        )}

                                        {/* Detalhes */}
                                        <section>
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                                                <div className="px-6 pt-5">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-2">Detalhes</h3>
                                                </div>

                                                <div className="p-6 text-left">
                                                    <div className="flex items-center gap-4 mb-6">
                                                        <div className="relative">
                                                            <UserProfileImage
                                                                fullName={supplier.name || "Fornecedor"}
                                                                imageUrl={supplier.image_url || supplier.imageUrl || supplier.avatar_url}
                                                                className="w-12 h-12 text-xl"
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">{supplier.name}</h4>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">{supplier.supplier_code || "-"}</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center py-2.5 border-b border-brand-border dark:border-dark-border">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">Fornecedor desde</span>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                {supplier.created_at ? formatDate(supplier.created_at) : '-'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center py-2.5">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">Tipo de Pessoa</span>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                        </div>

                                                        {isPJ ? (
                                                            <div className="mt-2 pt-2 border-t border-brand-border dark:border-dark-border space-y-2.5">
                                                                {supplier.cnpj && (
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CNPJ</span>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.cnpj}</span>
                                                                    </div>
                                                                )}
                                                                {supplier.nome_fantasia && (
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Fantasia</span>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right max-w-[60%] truncate">{supplier.nome_fantasia}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Insc. Est.</span>
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right">{supplier.inscricao_estadual || 'Isento'}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            supplier.cpf && (
                                                                <div className="mt-2 pt-2 border-t border-brand-border dark:border-dark-border flex justify-between items-center">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CPF</span>
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.cpf}</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

                                                {/* Address */}
                                                <div className="p-6 text-left">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Endereço</h3>
                                                    </div>

                                                    {supplierAddress ? (
                                                        <div className="space-y-6">
                                                            <div>
                                                                <div
                                                                    className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group"
                                                                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(supplierAddress)}`, '_blank')}
                                                                >
                                                                    <img src="https://img.dudit.com.br/static/MapLarge.png" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Mapa" />
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110">
                                                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="mb-0">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">Endereço Principal</h4>
                                                                        <button
                                                                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(supplierAddress)}`, '_blank')}
                                                                            className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading shrink-0"
                                                                        >
                                                                            Ver Mapa
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">{supplierAddress}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">Nenhum endereço cadastrado para este fornecedor.</p>
                                                        </div>
                                                    )}

                                                    {/* Contact */}
                                                    <div className="mt-6 pt-6 border-t border-brand-border dark:border-dark-border">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Contato</h3>
                                                        </div>
                                                        {(supplier.email || supplier.phone) ? (
                                                            <div className="space-y-3">
                                                                {supplier.email && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">{supplier.email}</span>
                                                                    </div>
                                                                )}
                                                                {supplier.phone && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 w-fit">{supplier.phone}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">Nenhuma informação de contato disponível.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <ActionsDropdown
                            onDelete={() => setShowDeleteModal(true)}
                            trigger={
                                <Button variant="outline" className="flex-1 h-12" leftIcon={<ThreeDotsIcon size={18} />}>
                                    Opções
                                </Button>
                            }
                            className="flex-1 h-12"
                        />
                        <Button
                            className="flex-1 h-12"
                            onClick={() => onEdit?.(supplier)}
                            leftIcon={<EditIcon size={18} />}
                        >
                            Editar
                        </Button>
                    </div>
                </Tabs>

                <AlertModal
                    isOpen={showDeleteModal}
                    onClose={() => setShowDeleteModal(false)}
                    onConfirm={handleDelete}
                    title="Excluir fornecedor?"
                    description={`Tem certeza que deseja excluir ${supplier.name}? Esta ação não pode ser desfeita.`}
                    confirmText={isDeleting ? "Excluindo..." : "Excluir"}
                    variant="danger"
                />

                <SavingStatusModal isOpen={isDeleting} text="Excluindo fornecedor..." />
            </div >
        </FadeIn>
    );
};

/* ── Imports Content ──────────────────────────────────────────── */

const ImportsContent = ({
    isLoadingImports, formattedImports, paginatedImports, totalPages, page, setPage,
    handleDetailsImport, tableContainerRef, handleTableScroll, scrollState,
    sortConfig, setSortConfig,
}: {
    isLoadingImports: boolean; formattedImports: any[]; paginatedImports: any[]; totalPages: number;
    page: number; setPage: (p: number) => void; handleDetailsImport: (o: any) => void;
    tableContainerRef: React.RefObject<HTMLDivElement | null>; handleTableScroll: () => void;
    scrollState: { left: boolean; right: boolean };
    sortConfig: { key: string; direction: "asc" | "desc" } | null;
    setSortConfig: (c: any) => void;
}) => {
    const isMobile = useMediaQuery("(max-width: 767px)");

    return (
        <div className="mt-6">
            <AnimatePresence mode="wait">
                {isLoadingImports ? (
                    <div className="flex-1 flex items-center justify-center p-8 py-20">
                        <ThreeDotsLoader />
                    </div>
                ) : formattedImports.length > 0 ? (
                    isMobile ? (
                        <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                            {paginatedImports.map((o: any) => (
                                <div
                                    key={o.id}
                                    className="py-5 flex items-start gap-4 border-b border-gray-50 dark:border-dark-border/50 last:border-none cursor-pointer"
                                    onClick={() => handleDetailsImport(o)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                NF-e {o.invoice_number} / Série {o.invoice_series}
                                            </h3>
                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading shrink-0">
                                                {formatCurrency(o.total_value)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                                            <span>{o.invoice_date ? formatDate(o.invoice_date) : formatDate(o.created_at)}</span>
                                            <Badge variant={o.status === "completed" ? "green" : o.status === "reversed" ? "red" : "gray"}>
                                                {o.status === "completed" ? "Confirmada" : o.status === "reversed" ? "Estornada" : "Preview"}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Left Scroll Indicator */}
                            <div className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />

                            <div
                                ref={tableContainerRef}
                                onScroll={handleTableScroll}
                                className="w-full overflow-x-auto custom-scrollbar"
                            >
                                <table className="w-full border-separate border-spacing-0 min-w-[700px]">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                            {COLUMNS.map((col) => {
                                                const isSorted = sortConfig?.key === (col.id === "date" ? "date" : col.id)
                                                return (
                                                    <th
                                                        key={col.id}
                                                        style={{ width: col.width }}
                                                        onClick={() => {
                                                            const key = col.id === "date" ? "date" : col.id
                                                            setSortConfig((prev: any) => {
                                                                if (prev?.key === key) {
                                                                    return prev.direction === "asc"
                                                                        ? { key, direction: "desc" }
                                                                        : null
                                                                }
                                                                return { key, direction: "desc" }
                                                            })
                                                        }}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            {col.label}
                                                            {isSorted && (
                                                                <span className="text-[10px]">
                                                                    {sortConfig?.direction === "asc" ? "▲" : "▼"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </th>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedImports.map((o) => (
                                            <tr
                                                key={o.id}
                                                className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 bg-white dark:bg-dark-surface"
                                                onClick={() => handleDetailsImport(o)}
                                            >
                                                <td className="p-4 align-middle">
                                                    <div className="flex items-center gap-3">
                                                        <UserProfileImage
                                                            fullName={`NF${o.invoice_number}`}
                                                            imageUrl={undefined}
                                                            className="w-10 h-10 text-[14px]"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px]">
                                                                NF-e {o.invoice_number} / Série {o.invoice_series}
                                                            </span>
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[250px]">
                                                                Chave: {o.access_key}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-4 align-middle font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(o.total_value)}
                                                </td>

                                                <td className="p-4 align-middle">
                                                    <Badge variant={o.status === "completed" ? "green" : o.status === "reversed" ? "red" : "gray"}>
                                                        {o.status === "completed" ? "Confirmada" : o.status === "reversed" ? "Estornada" : "Preview"}
                                                    </Badge>
                                                </td>

                                                <td className="p-4 align-middle text-brand-inactive-text dark:text-dark-body font-medium">
                                                    {o.invoice_date ? formatDate(o.invoice_date) : formatDate(o.created_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Right Scroll Indicator */}
                            <div className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />
                        </div>
                    )
                ) : (
                    <div className="py-12">
                        <IconPlaceholder
                            icon={FileTextIcon}
                            title="Nenhuma importação encontrada"
                            subtitle="Este fornecedor não possui importações de XML vinculadas."
                        />
                    </div>
                )}
            </AnimatePresence>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex justify-end">
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </div>
            )}
        </div>
    )
}

export default SupplierDetailPage;
