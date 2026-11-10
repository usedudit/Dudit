"use client";
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    PlusIcon,
    ExportFileIcon,
    Settings2Icon,
    UploadIcon,
    StarIcon,
} from '@/lib/icons';
import { useErpExport } from '@/hooks/use-erp-export';
import { usePermissions } from '@/lib/permission-context';
import { useStore } from "@/lib/store-context";
import ExportColumnSelectionModal from '@/components/erp/export/ExportColumnSelectionModal';
import { Button, Checkbox, IconPlaceholder, Pagination, Dropdown, DropdownItem } from '@/components/reusable';
import { Settings, CalendarOff, RefreshCw, ArrowUpDown, CalendarX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
    Appointment,
    ViewType,
    ModeType,
    PopoverState,
    StaffMember
} from './types';


import {
    formatDateStr,
    getWeekDays,
    getGridHoursRange,
    getDayOpeningTime
} from './utils';

import { TopSelectionBar } from './Shared';
import { AppointmentSheet } from './sheets/AppointmentSheet';
import CheckoutSheet from './sheets/CheckoutSheet';
import { MoreAppointmentsSheet, AddUnavailableSheet } from './sheets/ActionsSheet';
import { MobileView, DayView, TimelineView, MonthView } from './views/CalendarViews';
import {
    createAppointmentsAction,
    getAppointmentHistoryAction,
    getAppointmentsByDateRangeAction,
    updateAppointmentAction,
    deleteAppointmentAction,
    deleteUnavailableSeriesAction,
    type AppointmentInput
} from '@/app/actions/erp/appointments';
import { saveAppointmentItemsAction } from '@/app/actions/erp/appointment-items';
import { getUnavailableTypesAction } from '@/app/actions/erp/unavailable-types';
import { FadeIn } from '@/components/animations/FadeIn';
import FilterSheet from '@/components/reusable/FilterSheet';
import AppointmentsPageControls from './AppointmentsPageControls';
import { AppointmentsSuggestionsSheet } from './AppointmentsSuggestionsSheet';
import { usePlanUpgrade } from '@/components/erp/subscription/PlanUpgradeModal';
import { hasMinimumPlan } from '@/lib/subscription/plan-tier';
import { AppointmentListRow } from './AppointmentListRow';
import { SelectionBanner } from '@/components/reusable/SelectionBanner';
import SavingStatusModal from '@/components/reusable/SavingStatusModal';
import { text } from 'node:stream/consumers';
import { useNotification } from '@/hooks/use-notification';

/**
 * Compute the visible date range based on the current view and date.
 * All filtering happens at the DB level - this determines the query bounds.
 */
function computeVisibleDateRange(date: Date, view: ViewType): { startDate: string; endDate: string } {
    if (view === 'day') {
        const dateStr = formatDateStr(date);
        return { startDate: dateStr, endDate: dateStr };
    }
    if (view === 'week') {
        const days = getWeekDays(date);
        return { startDate: formatDateStr(days[0]), endDate: formatDateStr(days[6]) };
    }
    // month - include full grid (may show days from prev/next month)
    const y = date.getFullYear();
    const m = date.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    // Extend to full week boundaries for the month grid
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(lastDay);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
    return { startDate: formatDateStr(gridStart), endDate: formatDateStr(gridEnd) };
}

const AppointmentsPage = ({
    partnerId: initialPartnerId,
    storeId: initialStoreId,
    initialTeam = [],
    initialCustomers = [],
    initialServices = [],
    initialUnavailableTypes = [],
    initialAppointments = [],
    openingHours = null,
}: {
    partnerId: string;
    storeId?: string | null;
    initialTeam?: Array<{ id: string; name: string; role: string }>;
    initialCustomers?: Array<{ id: string; name: string; email?: string; phone?: string; avatar_url?: string | null }>;
    initialServices?: Array<{ id: string; name: string; price: number; promotional_price?: number | null; category_id?: string | null; duration: string; bufferMinutes: number; category: string; billingUnit: string; resources?: any[] }>;
    initialUnavailableTypes?: any[];
    initialAppointments?: any[];
    openingHours?: any;
}) => {
    const router = useRouter();
    const APPOINTMENT_COLUMNS = useMemo<Array<{
        id: string;
        label: string;
        align: 'left' | 'center' | 'right';
        width?: string;
        minWidth?: string;
    }>>(() => ([
        { id: "customer", label: "Cliente", align: "left", width: "280px", minWidth: "280px" },
        { id: "datetime", label: "Data e hora", align: "left", width: "180px", minWidth: "180px" },
        { id: "staff", label: "Profissional", align: "left", width: "180px", minWidth: "160px" },
        { id: "price", label: "Valor", align: "left", width: "120px", minWidth: "120px" },
        { id: "status", label: "Status", align: "center", width: "110px", minWidth: "100px" },
        { id: "actions", label: "Ações", align: "center", width: "70px", minWidth: "70px" },
    ]), []);

    const [viewMode, setViewMode] = useState<ModeType>('calendar');
    const [calendarView, setCalendarView] = useState<ViewType>('day');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    const mapDbAppointment = useCallback((row: any): Appointment => ({
        id: String(row.id),
        customerId: row.customer_id || row.customerId || null,
        customerAvatar: row.customers?.image_url || row.customer_avatar || row.customerAvatar || null,
        customerPhone: row.customer_phone || row.customers?.phone || null,
        customerEmail: row.customer_email || row.customers?.email || null,
        customer: row.customer_name || 'Cliente Sem Nome',
        service: row.service_name || 'Serviço',
        date: row.start_date,
        time: String(row.start_time || '').slice(0, 5),
        endDate: row.end_date || undefined,
        endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
        duration: Number(row.duration_minutes || 0),
        status: row.status || 'Reservado',
        staff: row.staff_name || 'Profissional',
        staffId: String(row.staff_partner_user_id || ''),
        price: Number(row.price || 0),
        pricingUnit: row.pricing_unit || 'Por Serviço',
        notes: row.notes || undefined,
        partnerId: row.partner_id,
        source: (row.source as any) || (row.status?.toLowerCase() === 'indisponível' ? 'unavailable' : 'appointment'),
        recurrence: (row.recurrence as any) || 'none',
        saleId: row.sale_id || row.marketplace_order_id || null,
        marketplaceOrderId: row.marketplace_order_id || null,
        paidAmount: Number(row.orders?.paid_amount ?? row.paid_amount ?? 0),
        totalAmount: row.orders?.total_amount != null ? Number(row.orders.total_amount) : undefined,
        orderNumber: row.orders?.order_number || null,
        paymentMethod: row.orders?.payment_method || undefined,
        orderSource: row.orders?.order_source || undefined,
        salesChannel: row.orders?.order_source || row.sales_channel || "booking",
        paymentStatus: row.orders?.situation || row.payment_status || "unpaid",
        fulfillmentMode: row.fulfillment_mode || null,
        needsReschedule: Boolean(row.needs_reschedule),
        serviceId: row.service_id || null,
        categoryId: row.category_id || null,
    }), []);

    const [appointments, setAppointments] = useState<Appointment[]>(() => {
        if (initialAppointments && initialAppointments.length > 0) {
            return initialAppointments.map(mapDbAppointment);
        }
        return [];
    });
    const [isLoadingAppointments, setIsLoadingAppointments] = useState(() => !(initialAppointments && initialAppointments.length > 0));
    const [realStaffMembers, setRealStaffMembers] = useState<StaffMember[]>(() =>
        initialTeam.map(m => ({ id: m.id, name: m.name, role: m.role }))
    );
    const [realClients, setRealClients] = useState<any[]>(() =>
        initialCustomers.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, avatar_url: c.avatar_url }))
    );
    const [realServices, setRealServices] = useState<any[]>(() =>
        initialServices.map(s => ({ id: s.id, name: s.name, price: s.price, promotional_price: s.promotional_price, category_id: s.category_id, duration: s.duration, category: s.category, bufferMinutes: s.bufferMinutes, billingUnit: s.billingUnit, resources: Array.isArray((s as any).resources) ? (s as any).resources : [] }))
    );
    const [realUnavailableTypes, setRealUnavailableTypes] = useState<any[]>(initialUnavailableTypes);
    const [partnerId, setPartnerId] = useState<string>(initialPartnerId || '');
    const [storeId] = useState<string | null>(initialStoreId || null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [appointmentFilters, setAppointmentFilters] = useState<{ teamIds: string[] }>({ teamIds: [] });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    // Interaction State
    const [hoverTime, setHoverTime] = useState<{ hour: number, minutes: number, top: number } | null>(null);
    const [hoverColIndex, setHoverColIndex] = useState<number | null>(null);
    const [hoverStaffId, setHoverStaffId] = useState<string | null>(null);
    const [activePopover, setActivePopover] = useState<PopoverState | null>(null);

    // Sheet States
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetMode, setSheetMode] = useState<'create' | 'view'>('create');
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [isUnavailableSheetOpen, setIsUnavailableSheetOpen] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [moreSheetDate, setMoreSheetDate] = useState<string>('');
    const [moreSheetAppointments, setMoreSheetAppointments] = useState<Appointment[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { planSlug } = usePermissions();
    const { openPlanUpgrade } = usePlanUpgrade();
    const hasEscalarPlan = hasMinimumPlan(planSlug, 'escalar');
    const { error: notifyError } = useNotification();

    const handleOpenSuggestions = useCallback(() => {
        if (hasEscalarPlan) setShowSuggestions(true);
        else openPlanUpgrade('escalar');
    }, [hasEscalarPlan, openPlanUpgrade]);

    // Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [tempSelectionTime, setTempSelectionTime] = useState<string | null>(null);
    const [draftData, setDraftData] = useState<{ services: any[], client: any, staffId?: number } | null>(null);
    const [preSelectedStaffId, setPreSelectedStaffId] = useState<string | undefined>(undefined);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug);

    // Catalogs come from SSR props - only refresh unavailable types when needed
    const refreshUnavailableTypes = useCallback(async () => {
        const unavailRes = await getUnavailableTypesAction(partnerId);
        if (unavailRes?.success) {
            setRealUnavailableTypes(unavailRes.data || []);
        }
    }, [partnerId]);

    // -- Group services by category for AppointmentSheet --
    const groupedServices = useMemo(() => {
        const groups: Record<string, any> = {};
        realServices.forEach(svc => {
            const cat = svc.category || 'Serviços';
            if (!groups[cat]) {
                groups[cat] = {
                    category: cat,
                    category_display: true,
                    colorClass: 'bg-brand-primary', // Default color
                    items: []
                };
            }
            groups[cat].items.push(svc);
        });
        return Object.values(groups);
    }, [realServices]);

    const unavailableTypes = useMemo(() => {
        return realUnavailableTypes;
    }, [realUnavailableTypes]);

    // -- Appointment cache: keyed by "startDate|endDate" --
    // Stale-while-revalidate: serve cache instantly, revalidate in background.
    const appointmentCacheRef = useRef<Map<string, { data: Appointment[]; ts: number }>>((() => {
        const cache = new Map<string, { data: Appointment[]; ts: number }>();
        if (initialAppointments && initialAppointments.length > 0) {
            const todayStr = formatDateStr(new Date());
            cache.set(`${todayStr}|${todayStr}`, {
                data: initialAppointments.map(mapDbAppointment),
                ts: Date.now()
            });
        }
        return cache;
    })());
    const inFlightRef = useRef<Map<string, Promise<Appointment[] | null>>>(new Map());
    const fetchAbortRef = useRef<number>(0);

    // Stable cache key for the current view
    const currentRange = useMemo(
        () => computeVisibleDateRange(currentDate, calendarView),
        [currentDate, calendarView]
    );
    const cacheKey = useMemo(
        () => `${currentRange.startDate}|${currentRange.endDate}`,
        [currentRange]
    );

    // -- Core network fetch (deduped by key via shared promise) --
    const fetchRange = useCallback(async (
        startDate: string,
        endDate: string,
    ): Promise<Appointment[] | null> => {
        const key = `${startDate}|${endDate}`;

        const existing = inFlightRef.current.get(key);
        if (existing) return existing;

        const fetchPromise = (async () => {
            try {
                const res = await getAppointmentsByDateRangeAction(startDate, endDate, undefined, storeId);
                if (res.success) {
                    const mapped = (res.items || []).map(mapDbAppointment);
                    appointmentCacheRef.current.set(key, { data: mapped, ts: Date.now() });
                    return mapped;
                }
                return null;
            } catch (err) {
                console.error('[AppointmentsPage] Fetch failed:', err);
                return null;
            } finally {
                inFlightRef.current.delete(key);
            }
        })();

        inFlightRef.current.set(key, fetchPromise);
        return fetchPromise;
    }, [mapDbAppointment, storeId]);

    // -- Compute adjacent ranges for prefetching --
    const getAdjacentRanges = useCallback((date: Date, view: ViewType) => {
        const prevDate = new Date(date);
        const nextDate = new Date(date);

        if (view === 'month') {
            prevDate.setMonth(prevDate.getMonth() - 1);
            nextDate.setMonth(nextDate.getMonth() + 1);
        } else if (view === 'week') {
            prevDate.setDate(prevDate.getDate() - 7);
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            prevDate.setDate(prevDate.getDate() - 1);
            nextDate.setDate(nextDate.getDate() + 1);
        }

        return {
            prev: computeVisibleDateRange(prevDate, view),
            next: computeVisibleDateRange(nextDate, view),
        };
    }, []);

    // -- Main fetch effect: Stale-While-Revalidate --
    useEffect(() => {
        const fetchId = ++fetchAbortRef.current;

        // 1. Serve stale: if ANY cache entry exists, render it instantly (no loading spinner)
        const stale = appointmentCacheRef.current.get(cacheKey);
        if (stale) {
            setAppointments(stale.data);
            setIsLoadingAppointments(false);
        } else {
            // Cold fetch - show loading skeleton
            setIsLoadingAppointments(true);
        }

        // 2. Revalidate: always fetch fresh data in the background
        const revalidate = async () => {
            const freshData = await fetchRange(
                currentRange.startDate,
                currentRange.endDate,
            );

            // Only apply if this is still the latest request (race guard)
            if (fetchAbortRef.current !== fetchId) return;

            if (freshData) {
                setAppointments(freshData);
            }
            setIsLoadingAppointments(false);

            // 3. Prefetch next range during browser idle time for instant transitions
            if (typeof window !== 'undefined') {
                const prefetchFn = () => {
                    if (fetchAbortRef.current !== fetchId) return;
                    const { next } = getAdjacentRanges(currentDate, calendarView);
                    fetchRange(next.startDate, next.endDate);
                };
                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(prefetchFn, { timeout: 2000 });
                } else {
                    setTimeout(prefetchFn, 1000);
                }
            }
        };

        revalidate();
    }, [cacheKey, currentRange, currentDate, calendarView, fetchRange, getAdjacentRanges]);

    // -- Refresh data when page becomes visible (e.g. returning from checkout on orders page) --
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                appointmentCacheRef.current.clear();
                inFlightRef.current.clear();
                setIsLoadingAppointments(true);
                fetchRange(currentRange.startDate, currentRange.endDate).then(freshData => {
                    if (freshData) setAppointments(freshData);
                    setIsLoadingAppointments(false);
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [currentRange, fetchRange])

    // --- ACTIONS ---

    const handleOpenCreate = (time?: string, date?: Date, staffId?: string) => {
        setSheetMode('create');
        setSelectedAppointment(null);
        setDraftData(null); // Clear draft data when creating a new appointment
        setIsSheetOpen(true);
        setActivePopover(null);
        setIsSelectionMode(false);

        if (date) {
            setCurrentDate(date);
        }

        setPreSelectedStaffId(staffId);

        if (time) {
            setTempSelectionTime(time);
        } else {
            setTempSelectionTime(null);
        }
    };

    const handleOpenUnavailable = (time?: string, date?: Date, staffId?: string) => {
        setSelectedAppointment(null);
        setIsUnavailableSheetOpen(true);
        setActivePopover(null);

        if (date) {
            setCurrentDate(date);
        }

        setPreSelectedStaffId(staffId);

        if (time) {
            setTempSelectionTime(time);
        } else {
            setTempSelectionTime(null);
        }
    };

    const handleOpenView = (appointment: Appointment) => {
        if (isSelectionMode) return;

        // Redirect to Unavailable Sheet if it's an unavailable slot
        if (appointment.status?.toLowerCase() === 'indisponível' || appointment.source === 'unavailable') {
            setSelectedAppointment(appointment);
            setIsUnavailableSheetOpen(true);
            return;
        }

        // Open sheet INSTANTLY - never block the UI
        setSheetMode('view');
        setSelectedAppointment(appointment);
        setIsSheetOpen(true);

        // Load history in background (enriches the sheet after it's already visible)
        getAppointmentHistoryAction(appointment.id).then((historyRes) => {
            if (historyRes.success) {
                setSelectedAppointment(prev =>
                    prev && prev.id === appointment.id
                        ? { ...prev, activityLog: historyRes.history }
                        : prev
                );
            }
        });
    };

    const handleDeleteUnavailable = async (appointmentId: string, deleteAll: boolean, category: string) => {
        setIsSaving(true);
        try {
            let res;
            if (deleteAll) {
                res = await deleteUnavailableSeriesAction(partnerId, category);
            } else {
                res = await deleteAppointmentAction(appointmentId);
            }

            if (res.success) {
                appointmentCacheRef.current.clear();
                inFlightRef.current.clear();
                // We could just filter locally for speed, but let's re-fetch for safety or rely on revalidation
                setAppointments(prev => {
                    if (deleteAll) {
                        return prev.filter(a => !(a.service === category && (a.source === 'unavailable' || a.status?.toLowerCase() === 'indisponível')));
                    }
                    return prev.filter(a => a.id !== appointmentId);
                });
                setIsUnavailableSheetOpen(false);
                setSelectedAppointment(null);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAppointment = async (id: string, notify?: boolean, note?: string) => {
        setIsSaving(true);
        try {
            const res = await deleteAppointmentAction(id, notify, note);
            if (res.success) {
                appointmentCacheRef.current.clear();
                inFlightRef.current.clear();
                setAppointments(prev => prev.filter(a => a.id !== id));
                setIsSheetOpen(false);
                setSelectedAppointment(null);
                return true;
            }
            return false;
        } catch (error) {
            console.error(error);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenMore = (dateStr: string, apps: Appointment[]) => {
        if (isSelectionMode) return;
        setMoreSheetDate(dateStr);
        setMoreSheetAppointments(apps);
        setIsMoreSheetOpen(true);
    };

    const handleSaveAppointment = async (payload: any | any[]) => {
        // -- Frontend lock: prevent double-click duplicates --
        if (isSaving) return;
        setIsSaving(true);

        try {
            if (selectedAppointment && sheetMode === 'view') {
                // Save items FIRST so stock movements can find them in DB
                if (payload.appointmentItems && payload.appointmentItems.length > 0) {
                    await saveAppointmentItemsAction(selectedAppointment.id, payload.appointmentItems);
                }

                const updateRes = await updateAppointmentAction(selectedAppointment.id, {
                    customerName: payload.customerName || payload.customer || selectedAppointment.customer,
                    customerId: payload.customerId || null,
                    serviceName: payload.service || payload.serviceName,
                    serviceId: payload.serviceId || selectedAppointment.serviceId || null,
                    categoryId: payload.categoryId || selectedAppointment.categoryId || null,
                    date: payload.date || selectedAppointment.date,
                    time: payload.time || selectedAppointment.time,
                    endDate: payload.endDate || selectedAppointment.endDate,
                    endTime: payload.endTime || selectedAppointment.endTime,
                    duration: Number(payload.duration || selectedAppointment.duration),
                    staffId: payload.staffId || selectedAppointment.staffId,
                    staffName: payload.staff || payload.staffName || selectedAppointment.staff,
                    price: Number(payload.price || selectedAppointment.price),
                    pricingUnit: payload.pricingUnit || selectedAppointment.pricingUnit,
                    notes: payload.notes ?? selectedAppointment.notes,
                    status: payload.status || selectedAppointment.status,
                    services: payload.services,
                    storeId: storeId,
                });

                if (updateRes.success && updateRes.item) {
                    const mapped = mapDbAppointment(updateRes.item);
                    setAppointments((prev) => prev.map((a) => a.id === mapped.id ? {
                        ...a,
                        ...mapped,
                        orderNumber: mapped.orderNumber ?? a.orderNumber,
                        paymentStatus: mapped.paymentStatus ?? a.paymentStatus,
                        totalAmount: mapped.totalAmount ?? a.totalAmount,
                        paymentMethod: mapped.paymentMethod ?? a.paymentMethod,
                        orderSource: mapped.orderSource ?? a.orderSource,
                        customerAvatar: mapped.customerAvatar ?? a.customerAvatar,
                        customerId: mapped.customerId ?? a.customerId,
                    } : a));
                } else {
                    throw new Error(updateRes.error || 'Não foi possível atualizar o agendamento.');
                }
            } else {
                const rows = (Array.isArray(payload) ? payload : [payload]).map((item) => ({
                    customerName: item.customerName || 'Cliente Sem Nome',
                    serviceName: item.serviceName || 'Serviço',
                    serviceId: item.serviceId || null,
                    categoryId: item.categoryId || null,
                    date: item.date || formatDateStr(currentDate),
                    time: item.time || getDayOpeningTime(currentDate, openingHours),
                    // The server derives the end from start + duration when it
                    // is not an explicit range. Using start_time as end_time
                    // made every appointment look duration-zero to availability.
                    endDate: item.endDate || null,
                    endTime: item.endTime || null,
                    duration: Number(item.duration || 60),
                    staffId: String(item.staffId || preSelectedStaffId || realStaffMembers[0]?.id || ''),
                    staffName: item.staffName || realStaffMembers.find((s) => s.id === String(item.staffId || preSelectedStaffId))?.name || realStaffMembers[0]?.name || 'Profissional',
                    price: Number(item.price || 0),
                    pricingUnit: item.pricingUnit || 'Por Serviço',
                    notes: item.notes || null,
                    status: item.status || 'Reservado',
                    customerId: item.customerId || realClients.find((c) => c.name === item.customerName)?.id || null,
                    services: item.services || undefined,
                    items: item.items || undefined,
                    orderId: item.orderId || item.marketplaceOrderId || null,
                    orderItemId: item.orderItemId || item.order_item_id || null,
                    fulfillmentMode: item.fulfillmentMode || null,
                    storeId: storeId,
                }));

                const createRes = await createAppointmentsAction(rows);
                if (createRes.success) {
                    setAppointments((prev) => [...prev, ...(createRes.created || []).map(mapDbAppointment)]);
                } else {
                    throw new Error(createRes.error || 'Não foi possível criar o agendamento.');
                }
            }

            // Invalidate cache so next navigation fetches fresh data
            appointmentCacheRef.current.clear();
            inFlightRef.current.clear();

            setIsSheetOpen(false);
            setTempSelectionTime(null);
            setDraftData(null);
            setPreSelectedStaffId(undefined);
        } catch (error: any) {
            notifyError('Erro', error?.message || 'Não foi possível salvar o agendamento.');
        } finally {
            setIsSaving(false);
        }
    };

    const enterSelectionMode = (currentData: any) => {
        setDraftData(currentData);
        setIsSheetOpen(false);
        setIsSelectionMode(true);
    };

    const handleTimeSelection = (time: string, staffId?: string) => {
        setTempSelectionTime(time);
        if (staffId) {
            setPreSelectedStaffId(staffId);
        }
        setIsSelectionMode(false);
        setIsSheetOpen(true);
    };

    const cancelSelectionMode = () => {
        setIsSelectionMode(false);
        setTempSelectionTime(null);
        setDraftData(null);
        setPreSelectedStaffId(undefined);
    };

    const returnToSheet = () => {
        setIsSelectionMode(false);
        setIsSheetOpen(true);
    };

    const handleOpenCheckout = (data: any) => {
        setDraftData(data);
        setIsSheetOpen(false);
        setIsCheckoutOpen(true);
    };

    const handleCloseCheckout = (success: boolean = false) => {
        setIsCheckoutOpen(false);
        setDraftData(null);
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentDate);
        if (calendarView === 'month') {
            newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        } else if (calendarView === 'week') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        } else {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        }
        setCurrentDate(newDate);
    };

    const getViewLabel = () => {
        if (calendarView === 'day') {
            return currentDate.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
        }
        if (calendarView === 'week') {
            const days = getWeekDays(currentDate);
            const start = days[0];
            const end = days[6];
            const startStr = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
            const endStr = end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
            return `${startStr} - ${endStr}`;
        }
        return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    };

    const hasActiveFilters = appointmentFilters.teamIds.length > 0;

    const { selectedStore } = useStore();

    const handleExport = useCallback(() => {
        const { startDate, endDate } = computeVisibleDateRange(currentDate, calendarView);
        void exportData({
            partnerId,
            module: "appointments",
            format: "xlsx",
            filters: {
                storeId: selectedStore?.id || null,
                startDate,
                endDate,
                staffIds: appointmentFilters.teamIds,
            },
        });
    }, [exportData, partnerId, selectedStore?.id, currentDate, calendarView, appointmentFilters.teamIds]);

    const visibleStaffMembers = useMemo(() => {
        if (appointmentFilters.teamIds.length === 0) return realStaffMembers;
        const selected = new Set(appointmentFilters.teamIds);
        return realStaffMembers.filter((staff) => selected.has(staff.id));
    }, [realStaffMembers, appointmentFilters.teamIds]);

    const visibleAppointments = useMemo(() => {
        let items = appointments;
        if (appointmentFilters.teamIds.length > 0) {
            const selected = new Set(appointmentFilters.teamIds);
            items = items.filter((appointment) => selected.has(appointment.staffId));
        }
        if (searchTerm.trim() !== '') {
            const query = searchTerm.toLowerCase();
            const cleanDigits = searchTerm.replace(/\D/g, "");
            items = items.filter((appointment: Appointment) => {
                const phoneRaw = String(appointment.customerPhone || "");
                const phoneMatch = phoneRaw.includes(searchTerm) || (cleanDigits.length > 2 && phoneRaw.replace(/\D/g, "").includes(cleanDigits));
                return (
                    (appointment.customer || '').toLowerCase().includes(query) ||
                    (appointment.service || '').toLowerCase().includes(query) ||
                    (appointment.staff || '').toLowerCase().includes(query) ||
                    (appointment.orderNumber || '').toLowerCase().includes(query) ||
                    (appointment.paymentMethod || '').toLowerCase().includes(query) ||
                    (appointment.status || '').toLowerCase().includes(query) ||
                    (appointment.notes || '').toLowerCase().includes(query) ||
                    (appointment.customerEmail || '').toLowerCase().includes(query) ||
                    phoneMatch
                );
            });
        }
        return items;
    }, [appointments, appointmentFilters.teamIds, searchTerm]);

    const listTotalPages = Math.max(1, Math.ceil(visibleAppointments.length / itemsPerPage));
    const paginatedList = useMemo(
        () => visibleAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
        [visibleAppointments, currentPage, itemsPerPage]
    );

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds(new Set());
    }, [viewMode, calendarView, currentDate, appointmentFilters]);

    const handleGridMouseMove = useCallback((e: React.MouseEvent, colIndex: number) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hourHeight = 80;
        const { startHour } = getGridHoursRange(currentDate, openingHours);
        const totalMinutes = (y / hourHeight) * 60;
        const snappedMinutes = Math.floor(totalMinutes / 15) * 15;
        const hour = startHour + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;
        const top = (snappedMinutes / 60) * hourHeight;

        setHoverTime(prev => {
            if (prev && prev.hour === hour && prev.minutes === minutes && prev.top === top) {
                return prev;
            }
            return { hour, minutes, top };
        });
        setHoverColIndex(prev => prev === colIndex ? prev : colIndex);
    }, [currentDate, openingHours]);

    const handleTimelineMouseMove = useCallback((e: React.MouseEvent, staffId: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const { startHour, endHour } = getGridHoursRange(currentDate, openingHours);
        const hoursCount = endHour - startHour + 1;

        const totalWidth = rect.width;
        const hourWidth = totalWidth / hoursCount;

        const totalMinutes = (x / hourWidth) * 60;
        const snappedMinutes = Math.floor(totalMinutes / 15) * 15;

        const hour = startHour + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;
        const top = 0;

        setHoverTime(prev => {
            if (prev && prev.hour === hour && prev.minutes === minutes && prev.top === top) {
                return prev;
            }
            return { hour, minutes, top };
        });
        setHoverStaffId(prev => prev === staffId ? prev : staffId);
    }, [currentDate, openingHours]);

    const handleGridMouseLeave = () => {
        setHoverTime(null);
        setHoverColIndex(null);
        setHoverStaffId(null);
    };

    const handleGridClick = (e: React.MouseEvent, staffId: string) => {
        if (hoverTime) {
            const timeStr = `${String(hoverTime.hour).padStart(2, '0')}:${String(hoverTime.minutes).padStart(2, '0')}`;
            if (isSelectionMode) {
                handleTimeSelection(timeStr, staffId);
            } else {
                const screenWidth = window.innerWidth;
                const align = e.clientX > screenWidth / 2 ? 'left' : 'right';
                setActivePopover({
                    staffId,
                    time: timeStr,
                    date: currentDate,
                    top: e.clientY,
                    left: e.clientX,
                    align,
                    mode: 'absolute'
                });
            }
        }
    };

    const handleGenericCellClick = (e: React.MouseEvent, date: Date) => {
        if (isSelectionMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        const screenWidth = window.innerWidth;
        const align = x > screenWidth / 2 ? 'left' : 'right';
        const timeStr = getDayOpeningTime(date, openingHours);
        setActivePopover({
            time: timeStr,
            date: date,
            top: y,
            left: x,
            align,
            mode: 'absolute'
        });
    };

    return (
        <>
            <AnimatePresence mode="wait">
                <FadeIn
                    key="list"
                    className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 erp-fill-viewport"
                >
                    <style>{`
                    .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                    .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .hide-scrollbar::-webkit-scrollbar { display: none; }
                    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
                    <div className="flex flex-col bg-white dark:bg-dark-surface transition-colors duration-300 min-h-full relative">
                        <AnimatePresence>
                            {isSelectionMode && (
                                <TopSelectionBar
                                    onClose={cancelSelectionMode}
                                    onViewSheet={returnToSheet}
                                />
                            )}
                        </AnimatePresence>

                        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                            {/* Desktop Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Agendamentos
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie sua agenda de serviços e compromissos.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outlineorange"
                                        className="w-[42px] h-[42px]"
                                        onClick={handleOpenSuggestions}
                                        leftIcon={<StarIcon size={18} />}
                                    >
                                    </Button>
                                    <Dropdown
                                        trigger={
                                            <Button variant="outline" leftIcon={<Settings2Icon size={18} />}>
                                                Ações
                                            </Button>
                                        }
                                        align="right"
                                        showChevron={false}
                                        fullWidth={false}
                                    >
                                        <DropdownItem onClick={() => handleOpenUnavailable()}>
                                            <CalendarOff size={16} /> Horário indisponível
                                        </DropdownItem>
                                        <DropdownItem onClick={() => {
                                            setCurrentDate(new Date());
                                            setViewMode('calendar');
                                            setCalendarView('day');
                                            setAppointmentFilters({ teamIds: [] });
                                        }}>
                                            <RefreshCw size={16} /> Redefinir visualização
                                        </DropdownItem>
                                        <DropdownItem onClick={handleExport} >
                                            <ExportFileIcon size={16} /> {isExporting ? "Exportando..." : "Exportar"}
                                        </DropdownItem>
                                        <DropdownItem onClick={() => router.push('/erp/agendamentos/importar')}>
                                            <UploadIcon size={16} /> Importar agendamentos
                                        </DropdownItem>
                                    </Dropdown>
                                    <Button onClick={() => handleOpenCreate()} leftIcon={<PlusIcon size={18} />}>
                                        Novo agendamento
                                    </Button>
                                </div>
                            </div>
                            <AppointmentsPageControls
                                currentLabel={getViewLabel()}
                                onToday={() => setCurrentDate(new Date())}
                                onPrev={() => navigateDate('prev')}
                                onNext={() => navigateDate('next')}
                                onOpenFilter={() => setFiltersOpen(true)}
                                filters={appointmentFilters}
                                setFilters={setAppointmentFilters}
                                teamOptions={realStaffMembers.map((staff) => ({ id: staff.id, name: staff.name }))}
                                hasActiveFilters={hasActiveFilters}
                                viewMode={viewMode}
                                onViewModeChange={(mode) => setViewMode(mode)}
                                calendarView={calendarView}
                                onCalendarViewChange={(view) => setCalendarView(view)}
                                onOpenCreate={() => handleOpenCreate()}
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                onOpenUnavailable={() => handleOpenUnavailable()}
                                onResetView={() => {
                                    setCurrentDate(new Date());
                                    setViewMode('calendar');
                                    setCalendarView('day');
                                    setAppointmentFilters({ teamIds: [] });
                                }}
                                onExport={handleExport}
                                isExporting={isExporting}
                                onImport={() => router.push('/erp/agendamentos/importar')}
                                onOpenSuggestions={handleOpenSuggestions}
                                hasEscalarPlan={hasEscalarPlan}
                            />

                            <SelectionBanner
                                selectedCount={selectedIds.size}
                                totalCount={visibleAppointments.length}
                                onSelectAll={() => setSelectedIds(new Set(visibleAppointments.map((appointment) => appointment.id)))}
                                onClearSelection={() => setSelectedIds(new Set())}
                                itemName="agendamentos"
                                singularItemName="agendamento"
                            />

                            <div className="flex-1 bg-white dark:bg-dark-surface md:rounded-2xl overflow-hidden h-full md:px-8">

                                <AnimatePresence mode="wait">
                                    {/* Mobile/Tablet View (Always render cards) */}
                                    <div className="block md:hidden h-full">
                                        <MobileView
                                            currentDate={currentDate}
                                            appointments={visibleAppointments}
                                            allAppointments={appointments}
                                            setCurrentDate={setCurrentDate}
                                            navigateDate={navigateDate}
                                            getViewLabel={getViewLabel}
                                            handleOpenCreate={handleOpenCreate}
                                            handleOpenView={handleOpenView}
                                            columns={APPOINTMENT_COLUMNS}
                                            openingHours={openingHours}
                                        />
                                    </div>

                                    {/* Desktop view switcher (Calendar / List) */}
                                    <div className="hidden md:flex flex-1 flex-col overflow-y-auto no-scrollbar">
                                        <div className="flex flex-col h-full">
                                            {viewMode === 'list' ? (
                                                <>
                                                    {visibleAppointments.length === 0 ? (
                                                        <div className="flex flex-col items-center justify-center py-20 text-center h-full">
                                                            <IconPlaceholder
                                                                placeholderType="image"
                                                                imageSrc="https://img.dudit.com.br/static/mascots/Agendamentos.png"
                                                                imageAlt="Sem Agendamentos"
                                                                title="Sem agendamentos"
                                                                subtitle="Não há agendamentos para este período."
                                                                buttons={[
                                                                    { text: "Adicionar", action: () => handleOpenCreate(), variant: "default" }
                                                                ]}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="w-full overflow-hidden rounded-xl relative">
                                                                <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                                    <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                                        <thead>
                                                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                                <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                                    <div className="flex items-center">
                                                                                        <Checkbox
                                                                                            checked={paginatedList.length > 0 && paginatedList.every(a => selectedIds.has(a.id))}
                                                                                            onChange={(checked) => {
                                                                                                setSelectedIds(checked ? new Set(paginatedList.map(a => a.id)) : new Set())
                                                                                            }}
                                                                                            className="bg-white dark:bg-dark-background"
                                                                                        />
                                                                                    </div>
                                                                                </th>
                                                                                {APPOINTMENT_COLUMNS.map((col, idx) => (
                                                                                    <th
                                                                                        key={col.id}
                                                                                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === APPOINTMENT_COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                                                                                        style={{ width: col.width, minWidth: col.minWidth }}
                                                                                    >
                                                                                        <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                            <span>{col.label}</span>
                                                                                        </div>
                                                                                    </th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {paginatedList.map((appointment) => (
                                                                                <AppointmentListRow
                                                                                    key={appointment.id}
                                                                                    appointment={appointment}
                                                                                    appointments={visibleAppointments}
                                                                                    openingHours={openingHours}
                                                                                    columns={APPOINTMENT_COLUMNS}
                                                                                    selected={selectedIds.has(appointment.id)}
                                                                                    onSelect={(id) => {
                                                                                        setSelectedIds(prev => {
                                                                                            const next = new Set(prev)
                                                                                            if (next.has(id)) next.delete(id); else next.add(id)
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                    onView={handleOpenView}
                                                                                />
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                            {listTotalPages > 1 && (
                                                                <div className="mt-auto">
                                                                    <Pagination
                                                                        currentPage={currentPage}
                                                                        totalPages={listTotalPages}
                                                                        onPageChange={setCurrentPage}
                                                                        inline
                                                                    />
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    {calendarView === 'month' && (
                                                        <>
                                                            <div className="grid grid-cols-7 border-b border-brand-border dark:border-dark-border bg-gray-50 dark:bg-zinc-900/50 flex-shrink-0">
                                                                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                                                    <div key={day} className="py-2 text-center text-xs font-bold text-brand-inactive-text">
                                                                        {day}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <MonthView
                                                                appointments={visibleAppointments}
                                                                currentDate={currentDate}
                                                                handleGenericCellClick={handleGenericCellClick}
                                                                activePopover={activePopover}
                                                                handleOpenCreate={handleOpenCreate}
                                                                handleOpenUnavailable={handleOpenUnavailable}
                                                                setActivePopover={setActivePopover}
                                                                handleOpenView={handleOpenView}
                                                                handleOpenMore={handleOpenMore}
                                                                openingHours={openingHours}
                                                            />
                                                        </>
                                                    )}

                                                    {calendarView === 'week' && (
                                                        <TimelineView
                                                            appointments={visibleAppointments}
                                                            allAppointments={appointments}
                                                            currentDate={currentDate}
                                                            staffMembers={visibleStaffMembers}
                                                            onOpenView={handleOpenView}
                                                            handleTimelineMouseMove={handleTimelineMouseMove}
                                                            handleGridMouseLeave={handleGridMouseLeave}
                                                            handleGridClick={handleGridClick}
                                                            hoverStaffId={hoverStaffId}
                                                            hoverTime={hoverTime}
                                                            activePopover={activePopover}
                                                            setActivePopover={setActivePopover}
                                                            handleOpenCreate={handleOpenCreate}
                                                            handleOpenUnavailable={handleOpenUnavailable}
                                                            openingHours={openingHours}
                                                        />
                                                    )}

                                                    {calendarView === 'day' && (
                                                        <DayView
                                                            appointments={visibleAppointments}
                                                            allAppointments={appointments}
                                                            currentDate={currentDate}
                                                            staffMembers={visibleStaffMembers}
                                                            onOpenView={handleOpenView}
                                                            handleGridMouseMove={handleGridMouseMove}
                                                            handleGridMouseLeave={handleGridMouseLeave}
                                                            handleGridClick={handleGridClick}
                                                            hoverColIndex={hoverColIndex}
                                                            hoverTime={hoverTime}
                                                            activePopover={activePopover}
                                                            setActivePopover={setActivePopover}
                                                            handleOpenCreate={handleOpenCreate}
                                                            handleOpenUnavailable={handleOpenUnavailable}
                                                            openingHours={openingHours}
                                                        />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    <FilterSheet
                        isOpen={filtersOpen}
                        onClose={() => setFiltersOpen(false)}
                        sections={[
                            {
                                id: "teamIds",
                                title: "Equipe",
                                type: "checkbox-list",
                                options: realStaffMembers.map((staff) => staff.name),
                            },
                        ]}
                        filters={{
                            teamIds: appointmentFilters.teamIds
                                .map((id) => realStaffMembers.find((staff) => staff.id === id)?.name)
                                .filter(Boolean),
                        }}
                        setFilters={(next: { teamIds: string[] }) => {
                            setAppointmentFilters({
                                teamIds: next.teamIds
                                    .map((name) => realStaffMembers.find((staff) => staff.name === name)?.id)
                                    .filter(Boolean) as string[],
                            });
                        }}
                        onClear={() => setAppointmentFilters({ teamIds: [] })}
                    />

                    {/* Sheets */}
                    <AnimatePresence>
                        {isSheetOpen && (
                            <AppointmentSheet
                                key={sheetMode}
                                onClose={() => {
                                    setIsSheetOpen(false);
                                    setDraftData(null);
                                    setTempSelectionTime(null);
                                    setPreSelectedStaffId(undefined);
                                    setSelectedAppointment(null);
                                }}
                                onDelete={handleDeleteAppointment}
                                mode={sheetMode}
                                appointment={selectedAppointment}
                                onSave={handleSaveAppointment}
                                onEnterSelectionMode={(data) => enterSelectionMode(data)}
                                selectedDate={tempSelectionTime ? new Date(currentDate) : undefined}
                                initialTimeSlot={tempSelectionTime || undefined}
                                defaultDate={currentDate}
                                initialDraft={draftData}
                                initialStaffId={preSelectedStaffId}
                                onCheckout={handleOpenCheckout}
                                servicesCatalog={groupedServices}
                                staffCatalog={realStaffMembers}
                                clientsCatalog={realClients}
                                partnerId={partnerId}
                                storeId={storeId}
                                isSaving={isSaving}
                                openingHours={openingHours}
                                appointmentsList={appointments}
                                onAppointmentUpdated={(dbItem) => {
                                    const mapped = mapDbAppointment(dbItem);
                                    setAppointments(prev => prev.map(a => a.id === mapped.id ? mapped : a));
                                    setSelectedAppointment(mapped);
                                }}
                            />
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isCheckoutOpen && (
                            <CheckoutSheet
                                onClose={() => setIsCheckoutOpen(false)}
                                onComplete={() => handleCloseCheckout(true)}
                                initialData={draftData}
                                partnerId={partnerId}
                            />
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isMoreSheetOpen && (
                            <MoreAppointmentsSheet
                                date={moreSheetDate}
                                appointments={moreSheetAppointments}
                                onClose={() => setIsMoreSheetOpen(false)}
                                onViewAppointment={(apt) => {
                                    setIsMoreSheetOpen(false);
                                    handleOpenView(apt);
                                }}
                            />
                        )}
                    </AnimatePresence>
                    <AnimatePresence>
                        {isUnavailableSheetOpen && (
                            <AddUnavailableSheet
                                onClose={() => {
                                    setIsUnavailableSheetOpen(false);
                                    setSelectedAppointment(null);
                                }}
                                appointment={selectedAppointment}
                                onDelete={handleDeleteUnavailable}
                                staffMembers={realStaffMembers}
                                defaultDate={currentDate}
                                initialTimeSlot={tempSelectionTime || undefined}
                                initialStaffId={preSelectedStaffId}
                                unavailableTypes={unavailableTypes}
                                partnerId={partnerId}
                                onRefreshServices={refreshUnavailableTypes}
                                onSave={async (item) => {
                                    setIsSaving(true);
                                    try {
                                        // Resolve ALL selected staff members (fixes bug: was only using staffIds[0])
                                        const staffIds: string[] = item.staffIds?.length ? item.staffIds : (item.staffId ? [item.staffId] : []);
                                        const resolvedStaff = staffIds
                                            .map((id: string) => realStaffMembers.find((s) => s.id === id))
                                            .filter(Boolean) as typeof realStaffMembers;

                                        if (resolvedStaff.length === 0 && realStaffMembers[0]) {
                                            resolvedStaff.push(realStaffMembers[0]);
                                        }
                                        if (resolvedStaff.length === 0) return;

                                        // If editing, update the single existing appointment
                                        if (selectedAppointment && selectedAppointment.id) {
                                            const staff = resolvedStaff[0];
                                            const updateRes = await updateAppointmentAction(selectedAppointment.id, {
                                                serviceName: item.title || item.type || 'Indisponível',
                                                date: item.date,
                                                time: item.startTime,
                                                endDate: item.date,
                                                endTime: item.endTime,
                                                duration: item.duration,
                                                staffId: staff.id,
                                                staffName: staff.name,
                                                notes: item.description || null,
                                                status: 'Indisponível',
                                                source: 'unavailable'
                                            });

                                            if (updateRes.success && updateRes.item) {
                                                const mapped = mapDbAppointment(updateRes.item);
                                                setAppointments((prev) => prev.map((a) => a.id === mapped.id ? mapped : a));
                                            }
                                        } else {
                                            // --- Compute repeat count from recurrenceEnd options ---
                                            let repeatCount = 1;
                                            if (item.recurrence !== 'none') {
                                                const endOpts = item.recurrenceEnd;
                                                if (endOpts?.type === 'count' && endOpts.count) {
                                                    repeatCount = Math.max(1, Math.min(365, Number(endOpts.count)));
                                                } else if (endOpts?.type === 'date' && endOpts.date) {
                                                    // Calculate occurrences until end date
                                                    const startD = new Date(item.date + 'T12:00:00');
                                                    const endD = new Date(endOpts.date + 'T12:00:00');
                                                    const stepDays = item.recurrence === 'daily' ? 1 : 7;
                                                    const diffMs = endD.getTime() - startD.getTime();
                                                    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                                                    repeatCount = Math.min(365, Math.floor(diffDays / stepDays) + 1);
                                                } else {
                                                    // 'never' - use sensible defaults
                                                    repeatCount = item.recurrence === 'daily' ? 30 : 12;
                                                }
                                            }

                                            const baseDate = new Date(item.date + 'T12:00:00');
                                            const recurrenceGroupId = item.recurrence !== 'none' ? crypto.randomUUID() : null;
                                            const payloads: AppointmentInput[] = [];

                                            // Generate payloads for EACH staff member × EACH recurrence date
                                            for (const staff of resolvedStaff) {
                                                for (let i = 0; i < repeatCount; i++) {
                                                    const currentDate = new Date(baseDate);
                                                    if (item.recurrence === 'daily') {
                                                        currentDate.setDate(baseDate.getDate() + i);
                                                    } else if (item.recurrence === 'weekly') {
                                                        currentDate.setDate(baseDate.getDate() + (i * 7));
                                                    }

                                                    const dateStr = currentDate.toISOString().split('T')[0];

                                                    payloads.push({
                                                        customerName: 'Horário Indisponível',
                                                        serviceName: item.title || item.type || 'Indisponível',
                                                        date: dateStr,
                                                        time: item.startTime,
                                                        endDate: dateStr,
                                                        endTime: item.endTime,
                                                        duration: item.duration,
                                                        staffId: staff.id,
                                                        staffName: staff.name,
                                                        price: 0,
                                                        pricingUnit: 'Por Serviço',
                                                        notes: item.description || null,
                                                        status: 'Indisponível',
                                                        source: 'unavailable',
                                                        recurrenceGroupId: recurrenceGroupId,
                                                        recurrenceRule: item.recurrence !== 'none' ? item.recurrence : null,
                                                        storeId: storeId,
                                                    });
                                                }
                                            }

                                            const createRes = await createAppointmentsAction(payloads);
                                            if (createRes.success) {
                                                appointmentCacheRef.current.clear();
                                                inFlightRef.current.clear();
                                                setAppointments((prev) => [...prev, ...(createRes.created || []).map(mapDbAppointment)]);
                                            }
                                        }
                                        setIsUnavailableSheetOpen(false);
                                        setSelectedAppointment(null);
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                            />
                        )}
                    </AnimatePresence>
                    <SavingStatusModal isOpen={isSaving} text="Salvando agendamento..." />
                    <AppointmentsSuggestionsSheet
                        isOpen={showSuggestions}
                        onClose={() => setShowSuggestions(false)}
                        partnerId={partnerId}
                        storeId={storeId || undefined}
                        onSelectAppointment={(appointmentId) => {
                            const target = appointments.find((a) => a.id === appointmentId);
                            if (target) {
                                setSelectedAppointment(target);
                                setIsSheetOpen(true);
                            }
                        }}
                    />
                </FadeIn>
            </AnimatePresence >
        </>
    );

    <ExportColumnSelectionModal
        isOpen={columnSelectionModal.isOpen}
        canExportAllColumns={columnSelectionModal.canExportAllColumns}
        onConfirm={handleColumnConfirm}
        onClose={closeColumnSelectionModal}
    />
};

export default AppointmentsPage;
