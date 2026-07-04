"use client"
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EditIcon, ChevronLeftIcon, ThreeDotsIcon, StarIcon, ShoppingCartIcon } from '@/lib/icons';
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ActionsDropdown, ThreeDotsLoader, AlertModal } from '@/components/reusable';
import Pagination from '@/components/reusable/Pagination';
import { useNotification } from '@/hooks/use-notification';
import { ReviewsSection } from '@/components/marketplace/ReviewsSection';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { getCustomerOrdersAction, deleteCustomerAction, getCustomerStoreCreditsAction } from '@/app/actions/erp/customers';
import { getAddressesAction } from '@/app/actions/shared/addresses';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { useMediaQuery } from '../hooks';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate, checkBirthday, formatDateToBR } from '@/lib/utils';
import { FadeIn } from '@/components/animations/FadeIn';
import { getBirthdayCouponCodeAction, sendBirthdayNotificationAction, canCustomerReceiveNotificationAction } from '@/app/actions/erp/birthday';
import { usePlanUpgrade, planStarIconForTarget } from '@/components/erp/subscription/PlanUpgradeModal';
import { hasMinimumPlan } from '@/lib/subscription/plan-tier';
import { usePermissions } from '@/lib/permission-context';
import SavingStatusModal from '@/components/reusable/SavingStatusModal';
import { KPICard } from '@/components/erp/dashboard/cards/KPICard';

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Pedido", align: "left", width: "200px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "250px" },
    { id: "channel", label: "Canal", align: "left", width: "150px" },
    { id: "date", label: "Data", align: "left", width: "150px" },
]

interface Props {
    customer: any;
    onBack: () => void;
    onEdit?: (customer: any) => void;
}

function formatOrderId(id: string): string {
    return `#${id.substring(0, 5).toUpperCase()}`
}

export const CustomerDetailPage = ({ customer, onBack, onEdit }: Props) => {
    const realCustomerId = customer.originalId || customer.id;
    const { success: notifySuccess, error: notifyError } = useNotification();
    const { openPlanUpgrade } = usePlanUpgrade();
    const { planSlug } = usePermissions();
    const [activeTab, setActiveTab] = useState('General');
    const [isScrolled, setIsScrolled] = useState(false);
    const isMobile = useMediaQuery("(max-width: 767px)");
    const isTablet = useMediaQuery("(max-width: 1279px)");
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleBack = useCallback(() => onBack(), [onBack]);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    const [fetchedOrders, setFetchedOrders] = useState<any[]>([]);
    const [orderStats, setOrderStats] = useState<{ totalOrders: number; totalSpent: number; avgOrder: number; lastOrderDate: string | null } | null>(null);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);
    const [customerAddress, setCustomerAddress] = useState<string | null>(null);
    const [billingAddress, setBillingAddress] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [storeCredits, setStoreCredits] = useState<any[]>([]);
    const [isLoadingStoreCredits, setIsLoadingStoreCredits] = useState(false);

    const router = useRouter();
    const [page, setPage] = useState(1);
    const bdayInfo = useMemo(() => checkBirthday(customer.birth_date), [customer.birth_date]);
    const [isSendingNotification, setIsSendingNotification] = useState(false);
    const [canReceiveNotification, setCanReceiveNotification] = useState(false);

    const handleCreateBirthdayCoupon = useCallback(async () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            openPlanUpgrade("crescer");
            return;
        }
        try {
            const couponCode = await getBirthdayCouponCodeAction(customer.partner_id || "");
            router.push(`/erp/coupons?create=true&code=${couponCode}&customerId=${realCustomerId}`);
        } catch (err) {
            notifyError("Erro ao iniciar criação do cupom.");
        }
    }, [customer.partner_id, planSlug, realCustomerId, router, notifyError, openPlanUpgrade]);

    const handleSendWhatsAppBirthday = useCallback(async () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            openPlanUpgrade("crescer");
            return;
        }
        const phone = customer.phone || customer.mobile || customer.phone_fixed;
        if (!phone) {
            notifyError("O cliente não possui um número de celular cadastrado.");
            return;
        }

        const formattedPhone = phone.replace(/\D/g, "");
        const phoneWithCountry = formattedPhone.startsWith("55") || formattedPhone.length > 11 ? formattedPhone : `55${formattedPhone}`;

        try {
            const couponCode = await getBirthdayCouponCodeAction(customer.partner_id || "");
            const message = `Olá ${customer.name}! 🎉\n\nFeliz aniversário!\n\nPreparamos um presente para você.\n\nUse o cupom:\n${couponCode}\ne aproveite seu desconto especial.\n\nDesejamos um excelente dia! 🎂`;
            const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
            window.open(url, "_blank");
        } catch (err) {
            notifyError("Erro ao gerar link de WhatsApp.");
        }
    }, [customer, planSlug, notifyError, openPlanUpgrade]);

    const handleSendNotificationBirthday = useCallback(async () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            openPlanUpgrade("crescer");
            return;
        }
        setIsSendingNotification(true);
        try {
            const res = await sendBirthdayNotificationAction(realCustomerId, customer.partner_id || "");
            if (res.success) {
                if (res.notified) {
                    notifySuccess("Notificação enviada com sucesso!");
                } else {
                    notifySuccess("O cliente já recebeu uma notificação de aniversário este ano.");
                }
            } else {
                notifyError(res.error || "Erro ao enviar notificação.");
            }
        } catch (err) {
            notifyError("Erro ao processar envio de notificação.");
        } finally {
            setIsSendingNotification(false);
        }
    }, [realCustomerId, customer.partner_id, planSlug, notifySuccess, notifyError, openPlanUpgrade]);

    const renderBirthdayCard = () => {
        if (!bdayInfo || (!bdayInfo.isToday && !bdayInfo.isUpcoming)) return null;

        return (
            <section className="bg-purple-50 dark:bg-purple-900/15 border border-purple-200 dark:border-purple-900/30 rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🎂</span>
                    <h3 className="text-base font-bold text-purple-950 dark:text-purple-300">Aniversário</h3>
                </div>
                <p className="text-sm text-purple-900 dark:text-purple-400 mb-4 font-medium">
                    {customer.name} faz aniversário {bdayInfo.isToday ? "hoje!" : `em ${bdayInfo.daysUntil} dias.`}
                </p>
                <div className="flex flex-wrap gap-2.5">
                    <Button
                        size="sm"
                        variant="default"
                        onClick={handleCreateBirthdayCoupon}
                    >
                        <span className="flex items-center gap-1.5">
                            Criar cupom
                            {!hasMinimumPlan(planSlug, "crescer") && planStarIconForTarget("crescer") && (
                                <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain invert brightness-0 dark:invert-0 dark:brightness-100" />
                            )}
                        </span>
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendWhatsAppBirthday}
                    >
                        <span className="flex items-center gap-1.5">
                            Enviar WhatsApp
                            {!hasMinimumPlan(planSlug, "crescer") && planStarIconForTarget("crescer") && (
                                <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                            )}
                        </span>
                    </Button>
                    {canReceiveNotification && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSendNotificationBirthday}
                            isLoading={isSendingNotification}
                        >
                            <span className="flex items-center gap-1.5">
                                Enviar notificação
                                {!hasMinimumPlan(planSlug, "crescer") && planStarIconForTarget("crescer") && (
                                    <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                )}
                            </span>
                        </Button>
                    )}
                </div>
            </section>
        );
    };
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
        const fetchOrders = async () => {
            setIsLoadingOrders(true);
            try {
                const res = await getCustomerOrdersAction(realCustomerId);
                if (res.orders) setFetchedOrders(res.orders);
                if (res.stats) setOrderStats(res.stats);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoadingOrders(false);
            }
        };
        const fetchAddress = async () => {
            try {
                const res = await getAddressesAction(realCustomerId, "customer");
                if (res.addresses && res.addresses.length > 0) {
                    const primaryAddr = res.addresses.find((a: any) => a.address_type === "primary" || a.is_default) || res.addresses[0];
                    const billingAddr = res.addresses.find((a: any) => a.address_type === "billing");

                    const format = (addr: any) => [
                        addr.street,
                        addr.number,
                        addr.complement,
                        addr.neighborhood,
                        addr.city,
                        addr.state,
                        addr.zip_code
                    ].filter(Boolean).join(", ");

                    setCustomerAddress(format(primaryAddr));
                    if (billingAddr) setBillingAddress(format(billingAddr));
                }
            } catch (e) {
                console.error("Error fetching address:", e);
            }
        };
        const fetchStoreCredits = async () => {
            setIsLoadingStoreCredits(true);
            try {
                const res = await getCustomerStoreCreditsAction(realCustomerId);
                if (res.success && res.storeCredits) {
                    setStoreCredits(res.storeCredits);
                }
            } catch (e) {
                console.error("Error fetching store credits:", e);
            } finally {
                setIsLoadingStoreCredits(false);
            }
        };
        fetchOrders();
        fetchAddress();
        fetchStoreCredits();
    }, [realCustomerId]);

    const [fetchedReviews, setFetchedReviews] = useState<any[] | null>(null);
    const [isLoadingReviews, setIsLoadingReviews] = useState(false);

    useEffect(() => {
        canCustomerReceiveNotificationAction(realCustomerId).then(res => {
            setCanReceiveNotification(res.canReceive);
        }).catch(() => {
            setCanReceiveNotification(false);
        });
    }, [realCustomerId]);

    useEffect(() => {
        setFetchedReviews(null);
    }, [realCustomerId]);

    useEffect(() => {
        if (activeTab === "Review" && fetchedReviews === null && !isLoadingReviews) {
            const fetchReviews = async () => {
                setIsLoadingReviews(true);
                try {
                    const res = await fetch(`/api/marketplace/customer-reviews?customerId=${realCustomerId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setFetchedReviews(data.reviews || []);
                    } else {
                        setFetchedReviews([]);
                    }
                } catch (e) {
                    console.error("Error fetching reviews:", e);
                    setFetchedReviews([]);
                } finally {
                    setIsLoadingReviews(false);
                }
            };
            fetchReviews();
        }
    }, [activeTab, fetchedReviews, isLoadingReviews, realCustomerId]);

    const stats = useMemo(() => {
        if (orderStats) {
            return {
                totalOrders: orderStats.totalOrders,
                totalSpent: orderStats.totalSpent,
                avgOrder: orderStats.avgOrder,
                lastOrderDate: orderStats.lastOrderDate ? formatDate(orderStats.lastOrderDate) : '-',
            };
        }

        if (customer.orders != null && customer.totalOrderValue != null) {
            const totalOrders = customer.orders;
            const totalSpent = customer.totalOrderValue;
            const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;
            const lastOrderDate = customer.lastOrderDate || '-';
            return { totalOrders, totalSpent, avgOrder, lastOrderDate };
        }

        if (customer.orders_count != null) {
            const totalOrders = customer.orders_count;
            const totalSpent = customer.total_spent || 0;
            const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;
            const lastOrderDate = customer.last_order_at ? formatDate(customer.last_order_at) : '-';
            return { totalOrders, totalSpent, avgOrder, lastOrderDate };
        }

        const nonCancelledOrders = fetchedOrders.filter(o => o.situation !== "cancelled");
        const totalOrders = nonCancelledOrders.length;
        const totalSpent = nonCancelledOrders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
        const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;
        const lastOrderDate = totalOrders > 0 && nonCancelledOrders[0]?.createdAt
            ? formatDate(nonCancelledOrders[0].createdAt)
            : '-';
        return { totalOrders, totalSpent, avgOrder, lastOrderDate };
    }, [fetchedOrders, customer.orders, customer.totalOrderValue, customer.lastOrderDate, customer.orders_count, customer.total_spent, customer.last_order_at, orderStats]);

    const formattedOrders = useMemo(() => {
        let result = fetchedOrders.map((o: any) => ({
            originalId: o.originalId,
            displayId: o.id,
            customer_name: o.customer_name,
            total_amount: o.total,
            paidAmount: o.paidAmount,
            statusLabel: o.statusLabel,
            statusColor: o.statusColor,
            deliveryStatusLabel: o.deliveryStatusLabel,
            deliveryStatusColor: o.deliveryStatusColor,
            situation: o.situation,
            delivery_status: o.delivery_status,
            hasOnlyServices: o.hasOnlyServices,
            formattedDate: o.date,
            formattedTime: o.formattedTime,
            items_count: o.items_count,
            order_source: o.order_source,
            created_at_time: new Date(o.createdAt).getTime(),
        }))

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any
                let bVal: any

                switch (sortConfig.key) {
                    case "order_id": aVal = a.displayId; bVal = b.displayId; break
                    case "total": aVal = a.total_amount; bVal = b.total_amount; break
                    case "status": aVal = a.statusLabel; bVal = b.statusLabel; break
                    case "channel": aVal = a.order_source; bVal = b.order_source; break
                    case "date": aVal = a.created_at_time; bVal = b.created_at_time; break
                    default: return 0
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }
        return result
    }, [fetchedOrders, sortConfig])

    const totalPages = Math.ceil(formattedOrders.length / itemsPerPage);
    const paginatedOrders = formattedOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const handleDetailsOrder = (order: any) => {
        router.push(`/erp/orders?view=${order.originalId}`)
    }

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            const token = await (await fetch("/api/csrf-token")).json().then((r: any) => r.token)
            const res = await deleteCustomerAction(realCustomerId, token)
            if (res?.error) {
                notifyError("Erro ao excluir: " + res.error)
            } else {
                notifySuccess("Cliente excluído com sucesso!")
                onBack()
            }
        } catch (e: any) {
            if (e?.digest?.includes?.('NEXT_REDIRECT')) {
                notifySuccess("Cliente excluído com sucesso!")
                return
            }
            notifyError("Erro ao excluir o cliente.")
        } finally {
            setIsDeleting(false)
            setShowDeleteModal(false)
        }
    }

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
                                            <span className="hidden md:inline truncate">{customer.name}</span>
                                            <Badge variant={customer.status === 'ativo' ? 'green' : customer.status === 'inativo' ? 'gray' : 'red'} className="whitespace-nowrap scale-90 shrink-0">
                                                {customer.status === 'ativo' ? 'Ativo' : customer.status === 'inativo' ? 'Inativo' : 'Bloqueado'}
                                            </Badge>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {formatOrderId(customer.id)} • {customer.email || 'Sem e-mail'}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <ActionsDropdown
                                            onDelete={() => setShowDeleteModal(true)}
                                        />
                                        <Button className='whitespace-nowrap' onClick={() => onEdit?.({ ...customer, originalId: realCustomerId })} leftIcon={<EditIcon size={18} />}>
                                            Editar cliente
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="General">Dados Gerais</TabsTrigger>
                                        <TabsTrigger value="Review">Avaliações</TabsTrigger>
                                        {isTablet && (
                                            <TabsTrigger value="Orders">Pedidos</TabsTrigger>
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
                                                /* Tablet/Mobile: Customer Info */
                                                <div className="mb-8">
                                                    {renderBirthdayCard()}

                                                    {/* KPI Stats Row for Tablet/Mobile */}
                                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                                        <KPICard title="Pedidos" value={stats.totalOrders} />
                                                        <KPICard title="Total Gasto" value={stats.totalSpent ? formatCurrency(stats.totalSpent) : "R$ 0,00"} />
                                                        <KPICard title="Valor médio" value={stats.avgOrder ? formatCurrency(stats.avgOrder) : "R$ 0,00"} />
                                                        <KPICard title="Última Compra" value={stats.lastOrderDate} />
                                                    </div>

                                                    <div className="flex items-center gap-3 mb-6">
                                                        <UserProfileImage
                                                            fullName={customer.name || "Cliente"}
                                                            className="w-14 h-14 text-xl shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h2 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">{customer.name}</h2>
                                                                <Badge variant={customer.status === 'ativo' ? 'green' : customer.status === 'inativo' ? 'gray' : 'red'} className="shrink-0">
                                                                    {customer.status === 'ativo' ? 'Ativo' : customer.status === 'inativo' ? 'Inativo' : 'Bloqueado'}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                {formatOrderId(customer.id)} • {customer.email || 'Sem e-mail'}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                                                                <span>Cliente desde {customer.createdAt ? formatDate(customer.createdAt) : '-'}</span>
                                                                <span className="text-gray-300 dark:text-gray-600">•</span>
                                                                <span>{customer.personType === 'pj' || customer.cnpj ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 space-y-3">
                                                        {customer.birth_date && (
                                                            <div className="flex justify-between items-center py-2 border-b border-brand-border dark:border-dark-border/50">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Nascimento</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateToBR(customer.birth_date)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {(customer.cpf || customer.cnpj) && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                    {customer.cnpj ? 'CNPJ' : 'CPF'}
                                                                </span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {customer.cnpj || customer.cpf}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {customer.phone && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Telefone</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.phone}</span>
                                                            </div>
                                                        )}
                                                        {customer.mobile && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Celular</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.mobile}</span>
                                                            </div>
                                                        )}
                                                        {customer.email && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">E-mail</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[60%]">{customer.email}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Address on tablet */}
                                                    {customerAddress && (
                                                        <div className="mt-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5">
                                                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-2">Endereço</h3>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">{customerAddress}</p>
                                                            {billingAddress && (
                                                                <>
                                                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mt-3 mb-1">Cobrança</h4>
                                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">{billingAddress}</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Vale-compras on tablet/mobile */}
                                                    <div className="mt-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Vales-Compra</h3>
                                                            {Number(customer.store_credit || customer.storeCredit || 0) > 0 && (
                                                                <Badge variant="green" className="scale-90">
                                                                    Saldo: {formatCurrency(customer.store_credit || customer.storeCredit || 0)}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        
                                                        {isLoadingStoreCredits ? (
                                                            <div className="text-center py-2 text-brand-inactive-text dark:text-dark-body text-xs">
                                                                Carregando vales-compra...
                                                            </div>
                                                        ) : storeCredits.length === 0 ? (
                                                            <div className="text-center py-2 text-brand-inactive-text dark:text-dark-body text-xs font-medium">
                                                                Nenhum vale-compra gerado para este cliente.
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                                                                {storeCredits.map((credit: any) => {
                                                                    const usedAmount = Number(credit.amount) - Number(credit.remaining_amount);
                                                                    const isExpired = credit.expires_at && new Date(credit.expires_at) < new Date();
                                                                    return (
                                                                        <div key={credit.id} className="p-3 bg-gray-50 dark:bg-dark-border/10 rounded-xl border border-brand-border dark:border-dark-border/50 text-xs">
                                                                            <div className="flex justify-between items-center mb-1.5">
                                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                                    Gerado em {formatDate(credit.created_at)}
                                                                                </span>
                                                                                <Badge variant={
                                                                                    credit.status === 'ACTIVE' && !isExpired ? 'green' :
                                                                                    credit.status === 'USED' ? 'gray' : 'red'
                                                                                } className="scale-90">
                                                                                    {credit.status === 'ACTIVE' && !isExpired ? 'Disponível' :
                                                                                     credit.status === 'USED' ? 'Utilizado' : 'Expirado'}
                                                                                </Badge>
                                                                            </div>
                                                                            <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-brand-border dark:border-dark-border/30">
                                                                                <div>
                                                                                    <span className="block text-brand-inactive-text dark:text-dark-body text-[10px]">Valor</span>
                                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(credit.amount)}</span>
                                                                                </div>
                                                                                <div>
                                                                                    <span className="block text-brand-inactive-text dark:text-dark-body text-[10px]">Utilizado</span>
                                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(usedAmount)}</span>
                                                                                </div>
                                                                                <div>
                                                                                    <span className="block text-brand-inactive-text dark:text-dark-body text-[10px]">Restante</span>
                                                                                    <span className="font-bold text-brand-green">{formatCurrency(credit.remaining_amount)}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop: KPI Stats Row */}
                                                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                                                        <KPICard title="Pedidos" value={stats.totalOrders} />
                                                        <KPICard title="Total Gasto" value={stats.totalSpent ? formatCurrency(stats.totalSpent) : "R$ 0,00"} />
                                                        <KPICard title="Valor médio" value={stats.avgOrder ? formatCurrency(stats.avgOrder) : "R$ 0,00"} />
                                                        <KPICard title="Última Compra" value={stats.lastOrderDate} />
                                                    </div>

                                                    {/* Desktop: Orders Table */}
                                                    <OrdersContent
                                                        isLoadingOrders={isLoadingOrders}
                                                        formattedOrders={formattedOrders}
                                                        paginatedOrders={paginatedOrders}
                                                        totalPages={totalPages}
                                                        page={page}
                                                        setPage={setPage}
                                                        handleDetailsOrder={handleDetailsOrder}
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

                                    {/* Tablet/Mobile: Orders Tab (KPI + Orders) */}
                                    {isTablet && (
                                        <TabsContent value="Orders" className="mt-0">
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                                <div className="grid grid-cols-2 gap-4 mb-6">
                                                    <KPICard title="Pedidos" value={stats.totalOrders} />
                                                    <KPICard title="Total Gasto" value={stats.totalSpent ? formatCurrency(stats.totalSpent) : "R$ 0,00"} />
                                                    <KPICard title="Valor médio" value={stats.avgOrder ? formatCurrency(stats.avgOrder) : "R$ 0,00"} />
                                                    <KPICard title="Última Compra" value={stats.lastOrderDate} />
                                                </div>

                                                <OrdersContent
                                                    isLoadingOrders={isLoadingOrders}
                                                    formattedOrders={formattedOrders}
                                                    paginatedOrders={paginatedOrders}
                                                    totalPages={totalPages}
                                                    page={page}
                                                    setPage={setPage}
                                                    handleDetailsOrder={handleDetailsOrder}
                                                    tableContainerRef={tableContainerRef}
                                                    handleTableScroll={handleTableScroll}
                                                    scrollState={scrollState}
                                                    sortConfig={sortConfig}
                                                    setSortConfig={setSortConfig}
                                                />
                                            </motion.div>
                                        </TabsContent>
                                    )}

                                    <TabsContent value="Review" className="mt-0">
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                            <ReviewsContent reviews={fetchedReviews || []} isLoading={isLoadingReviews} />
                                        </motion.div>
                                    </TabsContent>
                                </div>

                                {/* Sidebar - Desktop only */}
                                {!isTablet && (
                                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                        {renderBirthdayCard()}

                                        {/* Observações */}
                                        {customer.notes && (
                                            <section>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Observações</h3>
                                                </div>
                                                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-4">
                                                    <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1">Anotação Interna</p>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">{customer.notes}</p>
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
                                                                fullName={customer.name || "Cliente"}
                                                                className="w-12 h-12 text-xl"
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">{customer.name}</h4>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">{formatOrderId(customer.id)}</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center py-2.5 border-b border-brand-border dark:border-dark-border">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">Cliente desde</span>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                {customer.createdAt ? formatDate(customer.createdAt) : '-'}
                                                            </span>
                                                        </div>
                                                        {customer.birth_date && (
                                                            <div className="flex justify-between items-center py-2.5 border-b border-brand-border dark:border-dark-border">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">Nascimento</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateToBR(customer.birth_date)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center py-2.5">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">Tipo de Pessoa</span>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.personType === 'pj' || customer.cnpj ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                        </div>

                                                        {(customer.personType === 'pj' || customer.cnpj) ? (
                                                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border/50 space-y-2.5">
                                                                {customer.cnpj && (
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CNPJ</span>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.cnpj}</span>
                                                                    </div>
                                                                )}
                                                                {customer.nomeFantasia && (
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Fantasia</span>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right max-w-[60%] truncate">{customer.nomeFantasia}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Insc. Est.</span>
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right">{customer.inscricaoEstadual || 'Isento'}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            customer.cpf && (
                                                                <div className="mt-2 pt-2 border-t border-brand-border dark:border-dark-border flex justify-between items-center">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CPF</span>
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.cpf}</span>
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

                                                    {customerAddress ? (
                                                        <div className="space-y-6">
                                                            <div>
                                                                <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group">
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
                                                                        <a href="#" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading shrink-0">Ver Mapa</a>
                                                                    </div>
                                                                    <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">{customerAddress}</p>
                                                                </div>
                                                            </div>
                                                            {billingAddress && (
                                                                <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">Endereço de Cobrança</h4>
                                                                    </div>
                                                                    <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">{billingAddress}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">Nenhum endereço cadastrado para este cliente.</p>
                                                        </div>
                                                    )}

                                                    {/* Contact */}
                                                    <div className="mt-6 pt-6 border-t border-brand-border dark:border-dark-border">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Contato</h3>
                                                        </div>
                                                        {(customer.email || customer.phone || customer.mobile) ? (
                                                            <div className="space-y-3">
                                                                {customer.email && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">{customer.email}</span>
                                                                    </div>
                                                                )}
                                                                {(customer.phone || customer.mobile) && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 w-fit">{customer.phone || customer.mobile}</span>
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

                                        {/* Vales-Compra Sidebar Section */}
                                        <section>
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-green dark:bg-dark-border"></div>

                                                <div className="px-6 pt-5 flex justify-between items-center">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-2">Vales-Compra</h3>
                                                    {Number(customer.store_credit || customer.storeCredit || 0) > 0 && (
                                                        <Badge variant="green">
                                                            Saldo: {formatCurrency(customer.store_credit || customer.storeCredit || 0)}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="p-6 text-left space-y-4">
                                                    {isLoadingStoreCredits ? (
                                                        <div className="text-center py-4 text-brand-inactive-text dark:text-dark-body text-sm">
                                                            Carregando vales-compra...
                                                        </div>
                                                    ) : storeCredits.length === 0 ? (
                                                        <div className="text-center py-4 text-brand-inactive-text dark:text-dark-body text-sm font-medium">
                                                            Nenhum vale-compra gerado para este cliente.
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                                                            {storeCredits.map((credit: any) => {
                                                                const usedAmount = Number(credit.amount) - Number(credit.remaining_amount);
                                                                const isExpired = credit.expires_at && new Date(credit.expires_at) < new Date();
                                                                return (
                                                                    <div key={credit.id} className="p-3 bg-gray-50 dark:bg-dark-border/10 rounded-xl border border-brand-border dark:border-dark-border/50 text-sm">
                                                                        <div className="flex justify-between items-start mb-1.5">
                                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                                Gerado em {formatDate(credit.created_at)}
                                                                            </span>
                                                                            <Badge variant={
                                                                                credit.status === 'ACTIVE' && !isExpired ? 'green' :
                                                                                credit.status === 'USED' ? 'gray' : 'red'
                                                                            }>
                                                                                {credit.status === 'ACTIVE' && !isExpired ? 'Disponível' :
                                                                                 credit.status === 'USED' ? 'Utilizado' : 'Expirado'}
                                                                            </Badge>
                                                                        </div>
                                                                        
                                                                        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-brand-border dark:border-dark-border/30 text-xs">
                                                                            <div>
                                                                                <span className="block text-brand-inactive-text dark:text-dark-body">Valor</span>
                                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(credit.amount)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="block text-brand-inactive-text dark:text-dark-body">Utilizado</span>
                                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(usedAmount)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="block text-brand-inactive-text dark:text-dark-body">Restante</span>
                                                                                <span className="font-bold text-brand-green">{formatCurrency(credit.remaining_amount)}</span>
                                                                            </div>
                                                                        </div>
                                                                        {credit.expires_at && (
                                                                            <div className="text-[10px] text-brand-inactive-text dark:text-dark-body mt-2">
                                                                                Expira em: {formatDate(credit.expires_at)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
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
                            onClick={() => onEdit?.(customer)}
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
                    title="Excluir cliente?"
                    description={`Tem certeza que deseja excluir ${customer.name}? Esta ação não pode ser desfeita.`}
                    confirmText={isDeleting ? "Excluindo..." : "Excluir"}
                    variant="danger"
                />

                <SavingStatusModal isOpen={isDeleting} text="Excluindo cliente..." />
            </div >
        </FadeIn>
    );
};

/* ── Orders Content ──────────────────────────────────────────── */

const OrdersContent = ({
    isLoadingOrders, formattedOrders, paginatedOrders, totalPages, page, setPage,
    handleDetailsOrder, tableContainerRef, handleTableScroll, scrollState,
    sortConfig, setSortConfig,
}: {
    isLoadingOrders: boolean; formattedOrders: any[]; paginatedOrders: any[]; totalPages: number;
    page: number; setPage: (p: number) => void; handleDetailsOrder: (o: any) => void;
    tableContainerRef: React.RefObject<HTMLDivElement | null>; handleTableScroll: () => void;
    scrollState: { left: boolean; right: boolean };
    sortConfig: { key: string; direction: "asc" | "desc" } | null;
    setSortConfig: (c: any) => void;
}) => {
    const isMobile = useMediaQuery("(max-width: 767px)");

    return (
        <div className="mt-6">
            <AnimatePresence mode="wait">
                {isLoadingOrders ? (
                    <div className="flex-1 flex items-center justify-center p-8 py-20">
                        <ThreeDotsLoader />
                    </div>
                ) : formattedOrders.length > 0 ? (
                    isMobile ? (
                        <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                            {paginatedOrders.map((o: any) => (
                                <div
                                    key={o.originalId}
                                    className="py-5 flex items-start gap-4 border-b border-gray-50 dark:border-dark-border/50 last:border-none cursor-pointer"
                                    onClick={() => handleDetailsOrder(o)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                {o.displayId}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <Badge variant={o.statusColor} className="h-5 text-[10px] px-1.5">
                                                {o.statusLabel}
                                            </Badge>
                                            {!o.hasOnlyServices && (
                                                <Badge variant={o.deliveryStatusColor || "gray"} className="h-5 text-[10px] px-1.5">
                                                    {o.deliveryStatusLabel || "N/I"}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate mt-1.5">
                                            {o.formattedDate}
                                        </div>
                                        <div className="flex items-center gap-2 text-[14px] mt-1">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                                {o.items_count} {o.items_count === 1 ? 'item' : 'itens'}
                                            </span>
                                            <span className="text-gray-300 dark:text-gray-600 font-bold">•</span>
                                            <span className="font-bold text-brand-primary">
                                                {formatCurrency(o.total_amount)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {totalPages > 1 && (
                                <div className="flex justify-center mt-6">
                                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="w-full overflow-hidden rounded-xl relative">
                            <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                            <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                            <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={handleTableScroll}>
                                <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                            {COLUMNS.map((col, idx) => {
                                                const isSorted = sortConfig?.key === col.id;
                                                const isFirst = idx === 0;
                                                const isLast = idx === COLUMNS.length - 1;

                                                return (
                                                    <th
                                                        key={col.id}
                                                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${isFirst ? "rounded-l-lg pl-6" : ""} ${isLast ? "rounded-r-lg pr-6" : ""}`}
                                                        style={{ width: col.width }}
                                                        onClick={() => {
                                                            setSortConfig((prev: any) => ({
                                                                key: col.id,
                                                                direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                            }))
                                                        }}
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            {col.label}
                                                        </span>
                                                    </th>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedOrders.map((o: any) => (
                                            <tr
                                                key={o.originalId}
                                                className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                                                onClick={() => handleDetailsOrder(o)}
                                            >
                                                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                            <ShoppingCartIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                        </div>
                                                        <div className="flex flex-col text-left min-w-0">
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                                                {o.displayId}
                                                            </span>
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                {o.items_count} {o.items_count === 1 ? 'item' : 'itens'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                    <span className="text-[13px] font-bold text-brand-primary">
                                                        {formatCurrency(o.total_amount)}
                                                    </span>
                                                </td>
                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex gap-2 w-full">
                                                        {o.situation === "cancelled" ? (
                                                            <Badge variant="red">Cancelado</Badge>
                                                        ) : (
                                                            <>
                                                                <Badge variant={o.statusColor}>
                                                                    {o.statusLabel}
                                                                </Badge>
                                                                {!o.hasOnlyServices && (
                                                                    <Badge variant={o.deliveryStatusColor || "gray"}>
                                                                        {o.deliveryStatusLabel || "N/I"}
                                                                    </Badge>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                    <span className="text-[13px] font-medium truncate max-w-[120px]">
                                                        {o.order_source || "Manual"}
                                                    </span>
                                                </td>
                                                <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex flex-col text-left">
                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                            {o.formattedDate}
                                                        </span>
                                                        {o.formattedTime && (
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                {o.formattedTime}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                ) : null}
            </AnimatePresence>

            {totalPages > 1 && formattedOrders.length > 0 && (
                <div className="flex justify-center mt-6 w-full hidden md:flex">
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
            )}

            {!isLoadingOrders && formattedOrders.length === 0 && (
                <div className="mt-6">
                    <IconPlaceholder
                        title="Nenhum pedido encontrado"
                        subtitle="Este cliente ainda não realizou nenhum pedido."
                        imageSrc="https://img.dudit.com.br/static/mascots/SacolaVazia.png"
                        imageAlt='Nenhum pedido encontrado'
                        placeholderType="image"
                    />
                </div>
            )}
        </div>
    );
};

/* ── Reviews Content ──────────────────────────────────────────── */

function ReviewsContent({ reviews, isLoading }: { reviews: any[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 py-20">
                <ThreeDotsLoader />
            </div>
        )
    }

    return <ReviewsSection reviews={reviews} showItemInfo />;
}

export default CustomerDetailPage;
