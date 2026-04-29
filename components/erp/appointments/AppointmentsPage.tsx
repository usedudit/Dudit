"use client";
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    LayoutList,
    LayoutGrid,
    ChevronDown,
    RotateCcw,
    Users,
    Plus,
    Calendar as CalendarIcon,
    PlusIcon,
    Search,
    Filter,
    Loader2
} from 'lucide-react';
import { Button, Dropdown, DropdownItem, Checkbox, Tabs, TabsList, TabsTrigger, Input as FormInput } from '@/components/reusable';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { motion, AnimatePresence } from 'framer-motion';

import {
    Appointment,
    ViewType,
    ModeType,
    PopoverState
} from './types';

import {
    formatDateStr,
    getWeekDays
} from './utils';

import { TopSelectionBar } from './Shared';
import { AppointmentSheet } from './sheets/AppointmentSheet';
import CheckoutSheet from './sheets/CheckoutSheet';
import { MoreAppointmentsSheet, AddUnavailableSheet } from './sheets/ActionSheets';
import { MobileView, DayView, TimelineView, MonthView, ListView } from './views/CalendarViews';
import {
    createAppointmentsAction,
    getAppointmentHistoryAction,
    getAppointmentsByDateRangeAction,
    updateAppointmentAction,
} from '@/app/actions/erp/appointments';
import { fetchPartnerCustomersBucket, fetchPartnerTeamMembersBucket, fetchPartnerServicesBucket } from '@/app/actions/erp/client-loaders';
import { FadeIn } from '@/components/animations/FadeIn';

/**
 * Compute the visible date range based on the current view and date.
 * All filtering happens at the DB level — this determines the query bounds.
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
    // month — include full grid (may show days from prev/next month)
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

const AppointmentsPage = () => {
    const [viewMode, setViewMode] = useState<ModeType>('calendar');
    const [calendarView, setCalendarView] = useState<ViewType>('day');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
    const [realStaffMembers, setRealStaffMembers] = useState<Array<{ id: string; name: string; role: string; avatar: string }>>([]);
    const [realClients, setRealClients] = useState<any[]>([]);
    const [realServices, setRealServices] = useState<any[]>([]);
    const [selectedStaffFilter, setSelectedStaffFilter] = useState<string | null>(null);

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
    const [moreSheetDate, setMoreSheetDate] = useState<string>('');
    const [moreSheetAppointments, setMoreSheetAppointments] = useState<Appointment[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [tempSelectionTime, setTempSelectionTime] = useState<string | null>(null);
    const [draftData, setDraftData] = useState<{ services: any[], client: any, staffId?: number } | null>(null);
    const [preSelectedStaffId, setPreSelectedStaffId] = useState<string | undefined>(undefined);

    const mapDbAppointment = useCallback((row: any): Appointment => ({
        id: String(row.id),
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
    }), []);

    // -- Load staff + clients + services on mount (once) --
    useEffect(() => {
        const loadCatalogs = async () => {
            const [teamRes, clientsRes, servicesRes] = await Promise.all([
                fetchPartnerTeamMembersBucket(),
                fetchPartnerCustomersBucket(),
                fetchPartnerServicesBucket(),
            ]);

            if (teamRes?.length) {
                setRealStaffMembers(teamRes.map((member) => ({
                    id: String(member.id),
                    name: member.fullName || member.email || 'Sem nome',
                    role: member.role,
                    avatar: `https://i.pravatar.cc/150?u=${member.id}`,
                })));
            }

            if (clientsRes?.length) {
                setRealClients(clientsRes.map((client) => ({
                    id: client.id,
                    name: client.name,
                    email: client.email || undefined,
                })));
            }

            if (servicesRes?.length) {
                setRealServices(servicesRes.map((svc) => ({
                    id: svc.id,
                    name: svc.name,
                    price: svc.price,
                    duration: String(svc.duration),
                    category: svc.category || 'Sem categoria',
                    bufferMinutes: svc.bufferMinutes,
                    billingUnit: svc.billingUnit,
                })));
            }
        };
        loadCatalogs();
    }, []);

    // -- Appointment cache: keyed by "startDate|endDate|staffId" --
    // Stale-while-revalidate: serve cache instantly, revalidate in background.
    const appointmentCacheRef = useRef<Map<string, { data: Appointment[]; ts: number }>>(new Map());
    const inFlightRef = useRef<Set<string>>(new Set());
    const fetchAbortRef = useRef<number>(0);

    // Stable cache key for the current view
    const currentRange = useMemo(
        () => computeVisibleDateRange(currentDate, calendarView),
        [currentDate, calendarView]
    );
    const cacheKey = useMemo(
        () => `${currentRange.startDate}|${currentRange.endDate}|${selectedStaffFilter || ''}`,
        [currentRange, selectedStaffFilter]
    );

    // -- Core network fetch (always hits server, deduped by key) --
    const fetchRange = useCallback(async (
        startDate: string,
        endDate: string,
        staffFilter: string | null,
    ): Promise<Appointment[] | null> => {
        const key = `${startDate}|${endDate}|${staffFilter || ''}`;

        // Skip if already in-flight (prevents duplicate requests)
        if (inFlightRef.current.has(key)) return null;
        inFlightRef.current.add(key);

        try {
            const res = await getAppointmentsByDateRangeAction(startDate, endDate, staffFilter || undefined);
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
    }, [mapDbAppointment]);

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
            // Cold fetch — show loading skeleton
            setIsLoadingAppointments(true);
        }

        // 2. Revalidate: always fetch fresh data in the background
        const revalidate = async () => {
            const freshData = await fetchRange(
                currentRange.startDate,
                currentRange.endDate,
                selectedStaffFilter
            );

            // Only apply if this is still the latest request (race guard)
            if (fetchAbortRef.current !== fetchId) return;

            if (freshData) {
                setAppointments(freshData);
            }
            setIsLoadingAppointments(false);

            // 3. Prefetch adjacent ranges (fire-and-forget)
            const { prev, next } = getAdjacentRanges(currentDate, calendarView);
            fetchRange(prev.startDate, prev.endDate, selectedStaffFilter);
            fetchRange(next.startDate, next.endDate, selectedStaffFilter);
        };

        revalidate();
    }, [cacheKey, currentRange, selectedStaffFilter, currentDate, calendarView, fetchRange, getAdjacentRanges]);

    // --- ACTIONS ---

    const handleOpenCreate = (time?: string, date?: Date, staffId?: string) => {
        setSheetMode('create');
        setSelectedAppointment(null);
        setIsSheetOpen(true);
        setActivePopover(null);
        setIsSelectionMode(false);

        if (date) {
            setCurrentDate(date);
        }

        setPreSelectedStaffId(staffId);

        if (time && time !== "09:00") {
            setTempSelectionTime(time);
        } else {
            setTempSelectionTime(null);
        }
    };

    const handleOpenView = async (appointment: Appointment) => {
        if (isSelectionMode) return;
        const historyRes = await getAppointmentHistoryAction(appointment.id);
        const enrichedAppointment = historyRes.success
            ? { ...appointment, activityLog: historyRes.history }
            : appointment;
        setSheetMode('view');
        setSelectedAppointment(enrichedAppointment);
        setIsSheetOpen(true);
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
                const updateRes = await updateAppointmentAction(selectedAppointment.id, {
                    customerName: payload.customer || payload.customerName,
                    serviceName: payload.service || payload.serviceName,
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
                });

                if (updateRes.success && updateRes.item) {
                    const mapped = mapDbAppointment(updateRes.item);
                    setAppointments((prev) => prev.map((a) => a.id === mapped.id ? mapped : a));
                }
            } else {
                const rows = (Array.isArray(payload) ? payload : [payload]).map((item) => ({
                    customerName: item.customerName || 'Cliente Sem Nome',
                    serviceName: item.serviceName || 'Serviço',
                    date: item.date || formatDateStr(currentDate),
                    time: item.time || '09:00',
                    endDate: item.endDate || item.date || formatDateStr(currentDate),
                    endTime: item.endTime || item.time || '09:00',
                    duration: Number(item.duration || 60),
                    staffId: String(item.staffId || preSelectedStaffId || realStaffMembers[0]?.id || ''),
                    staffName: item.staffName || realStaffMembers.find((s) => s.id === String(item.staffId || preSelectedStaffId))?.name || realStaffMembers[0]?.name || 'Profissional',
                    price: Number(item.price || 0),
                    pricingUnit: item.pricingUnit || 'Por Serviço',
                    notes: item.notes || null,
                    status: item.status || 'Reservado',
                    customerId: realClients.find((c) => c.name === item.customerName)?.id || null,
                }));

                const createRes = await createAppointmentsAction(rows);
                if (createRes.success) {
                    setAppointments((prev) => [...prev, ...(createRes.created || []).map(mapDbAppointment)]);
                }
            }

            // Invalidate cache so next navigation fetches fresh data
            appointmentCacheRef.current.clear();

            setIsSheetOpen(false);
            setTempSelectionTime(null);
            setDraftData(null);
            setPreSelectedStaffId(undefined);
        } finally {
            setIsSaving(false);
        }
    };

    const enterSelectionMode = (currentData: any) => {
        setDraftData(currentData);
        setIsSheetOpen(false);
        setIsSelectionMode(true);
    };

    const handleTimeSelection = (time: string) => {
        setTempSelectionTime(time);
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

    // Appointments are already filtered by date range + staff at the DB level.
    // This sorted memo is used by the ListView and any other component that needs sorted data.
    const sortedAppointments = useMemo(() => {
        return [...appointments].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        });
    }, [appointments]);

    const handleGridMouseMove = (e: React.MouseEvent, colIndex: number) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hourHeight = 80;
        const startHour = 8;
        const totalMinutes = (y / hourHeight) * 60;
        const snappedMinutes = Math.floor(totalMinutes / 15) * 15;
        const hour = startHour + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;
        const top = (snappedMinutes / 60) * hourHeight;
        setHoverTime({ hour, minutes, top });
        setHoverColIndex(colIndex);
    };

    const handleTimelineMouseMove = (e: React.MouseEvent, staffId: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const startHour = 8;
        const endHour = 19;
        const hoursCount = endHour - startHour + 1;

        const totalWidth = rect.width;
        const hourWidth = totalWidth / hoursCount;

        const totalMinutes = (x / hourWidth) * 60;
        const snappedMinutes = Math.floor(totalMinutes / 15) * 15;

        const hour = startHour + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;
        const top = 0;

        setHoverTime({ hour, minutes, top });
        setHoverStaffId(staffId);
    };

    const handleGridMouseLeave = () => {
        setHoverTime(null);
        setHoverColIndex(null);
        setHoverStaffId(null);
    };

    const handleGridClick = (e: React.MouseEvent, staffId: string) => {
        if (hoverTime) {
            const timeStr = `${String(hoverTime.hour).padStart(2, '0')}:${String(hoverTime.minutes).padStart(2, '0')}`;
            if (isSelectionMode) {
                handleTimeSelection(timeStr);
            } else {
                const screenWidth = window.innerWidth;
                const align = e.clientX > screenWidth / 2 ? 'left' : 'right';
                setActivePopover({
                    staffId,
                    time: timeStr,
                    top: calendarView === 'week' ? e.clientY : hoverTime.top,
                    left: e.clientX,
                    align,
                    mode: 'resource'
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
        const timeStr = "09:00";
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
                    className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
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
                                    <Button onClick={() => handleOpenCreate()} leftIcon={<PlusIcon size={18} />}>
                                        Novo Agendamento
                                    </Button>
                                </div>
                            </div>

                            {/* Standard ERP Header Controls */}
                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 px-4 md:px-8">
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <Button 
                                        variant="outline" 
                                        className="rounded-full h-10 px-4" 
                                        onClick={() => setCurrentDate(new Date())}
                                    >
                                        Hoje
                                    </Button>

                                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-10 shadow-sm overflow-hidden">
                                        <button
                                            onClick={() => navigateDate('prev')}
                                            className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors hover:bg-gray-50 dark:hover:bg-zinc-900"
                                        >
                                            <ChevronLeft size={18} />
                                        </button>
                                        <div className="px-4 text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap min-w-[140px] text-center">
                                            {getViewLabel()}
                                        </div>
                                        <button
                                            onClick={() => navigateDate('next')}
                                            className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors hover:bg-gray-50 dark:hover:bg-zinc-900"
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>

                                    <Dropdown
                                        width="w-72"
                                        trigger={
                                            <button className="flex items-center gap-2 px-4 h-10 border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shadow-sm">
                                                <Users size={16} className="text-brand-inactive-text" />
                                                {selectedStaffFilter
                                                    ? realStaffMembers.find(s => s.id === selectedStaffFilter)?.name || 'Profissional'
                                                    : 'Toda a equipe'
                                                }
                                                <ChevronDown size={14} className="text-brand-inactive-text" />
                                            </button>
                                        }
                                    >
                                        <div className="p-1">
                                            <DropdownItem
                                                onClick={() => setSelectedStaffFilter(null)}
                                                className={`rounded-lg font-medium gap-2 ${!selectedStaffFilter ? 'bg-brand-dark/5 dark:bg-white/5 text-brand-dark dark:text-dark-heading' : ''}`}
                                            >
                                                <Users size={16} /> Toda a equipe
                                            </DropdownItem>
                                            <div className="my-2 border-t border-brand-border dark:border-dark-border"></div>
                                            <div className="space-y-1 px-1">
                                                {realStaffMembers.map(staff => (
                                                    <DropdownItem
                                                        key={staff.id}
                                                        onClick={() => setSelectedStaffFilter(staff.id)}
                                                        className={`gap-3 ${selectedStaffFilter === staff.id ? 'bg-brand-dark/5 dark:bg-white/5' : ''}`}
                                                    >
                                                        <UserProfileImage fullName={staff.name} imageUrl={staff.avatar} className="w-6 h-6" />
                                                        <span className="text-sm">{staff.name}</span>
                                                    </DropdownItem>
                                                ))}
                                            </div>
                                        </div>
                                    </Dropdown>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="flex-1 md:w-64">
                                        <FormInput 
                                            placeholder="Buscar agendamentos..." 
                                            prefix={<Search size={18} className="text-brand-inactive-text" />}
                                            className="h-10 rounded-full"
                                        />
                                    </div>
                                    
                                    <Tabs 
                                        value={viewMode}
                                        onValueChange={(val: any) => setViewMode(val as ModeType)}
                                        className="w-auto"
                                    >
                                        <TabsList className="bg-gray-100 dark:bg-zinc-900 p-1 rounded-full h-10 border-0 gap-1 flex">
                                            <TabsTrigger 
                                                value="calendar" 
                                                className="rounded-full px-4 data-[state=active]:bg-white dark:data-[state=active]:bg-dark-surface data-[state=active]:text-brand-dark dark:data-[state=active]:text-white shadow-sm h-full flex items-center gap-2 pb-0"
                                            >
                                                <CalendarIcon size={16} /> Calendário
                                            </TabsTrigger>
                                            <TabsTrigger 
                                                value="list" 
                                                className="rounded-full px-4 data-[state=active]:bg-white dark:data-[state=active]:bg-dark-surface data-[state=active]:text-brand-dark dark:data-[state=active]:text-white shadow-sm h-full flex items-center gap-2 pb-0"
                                            >
                                                <LayoutList size={16} /> Lista
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>

                                    <Dropdown
                                        width="w-32"
                                        align="right"
                                        trigger={
                                            <button className="flex items-center gap-2 px-4 h-10 border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shadow-sm">
                                                {calendarView === 'day' ? 'Dia' : calendarView === 'week' ? 'Semana' : 'Mês'}
                                                <ChevronDown size={14} className="text-brand-inactive-text" />
                                            </button>
                                        }
                                    >
                                        <DropdownItem onClick={() => setCalendarView('day')} className="font-medium gap-2"><LayoutList size={16} /> Dia</DropdownItem>
                                        <DropdownItem onClick={() => setCalendarView('week')} className="font-medium gap-2"><LayoutGrid size={16} /> Semana</DropdownItem>
                                        <DropdownItem onClick={() => setCalendarView('month')} className="font-medium gap-2"><CalendarIcon size={16} /> Mês</DropdownItem>
                                    </Dropdown>
                                </div>
                            </div>

                            {/* Mobile View Container */}
                            <div className="block md:hidden h-full">
                                <MobileView
                                    currentDate={currentDate}
                                    appointments={appointments}
                                    setCurrentDate={setCurrentDate}
                                    navigateDate={navigateDate}
                                    getViewLabel={getViewLabel}
                                    handleOpenCreate={handleOpenCreate}
                                    handleOpenView={handleOpenView}
                                />
                            </div>

                            {/* Desktop Container */}
                            <div className="hidden md:block bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">

                                <AnimatePresence mode="wait">
                                    {viewMode === 'calendar' ? (
                                        <motion.div
                                            key="calendar"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col h-full"
                                        >
                                            <div className="flex-1 overflow-y-auto no-scrollbar">
                                                {calendarView === 'month' && (
                                                    <>
                                                        <div className="grid grid-cols-7 border-b border-brand-border dark:border-dark-border bg-gray-50 dark:bg-zinc-900/50 flex-shrink-0">
                                                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                                                <div key={day} className="py-2 text-center text-xs font-bold text-brand-inactive-text uppercase tracking-wide">
                                                                    {day}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <MonthView
                                                            appointments={appointments}
                                                            currentDate={currentDate}
                                                            handleGenericCellClick={handleGenericCellClick}
                                                            activePopover={activePopover}
                                                            handleOpenCreate={handleOpenCreate}
                                                            setIsUnavailableSheetOpen={setIsUnavailableSheetOpen}
                                                            setActivePopover={setActivePopover}
                                                            handleOpenView={handleOpenView}
                                                            handleOpenMore={handleOpenMore}
                                                        />
                                                    </>
                                                )}

                                                {calendarView === 'week' && (
                                                    <TimelineView
                                                        appointments={appointments}
                                                        currentDate={currentDate}
                                                        staffMembers={realStaffMembers}
                                                        onOpenView={handleOpenView}
                                                        handleTimelineMouseMove={handleTimelineMouseMove}
                                                        handleGridMouseLeave={handleGridMouseLeave}
                                                        handleGridClick={handleGridClick}
                                                        hoverStaffId={hoverStaffId}
                                                        hoverTime={hoverTime}
                                                        activePopover={activePopover}
                                                        setActivePopover={setActivePopover}
                                                        handleOpenCreate={handleOpenCreate}
                                                        setIsUnavailableSheetOpen={setIsUnavailableSheetOpen}
                                                    />
                                                )}

                                                {calendarView === 'day' && (
                                                    <DayView
                                                        appointments={appointments}
                                                        currentDate={currentDate}
                                                        staffMembers={realStaffMembers}
                                                        onOpenView={handleOpenView}
                                                        handleGridMouseMove={handleGridMouseMove}
                                                        handleGridMouseLeave={handleGridMouseLeave}
                                                        handleGridClick={handleGridClick}
                                                        hoverColIndex={hoverColIndex}
                                                        hoverTime={hoverTime}
                                                        activePopover={activePopover}
                                                        setActivePopover={setActivePopover}
                                                        handleOpenCreate={handleOpenCreate}
                                                        setIsUnavailableSheetOpen={setIsUnavailableSheetOpen}
                                                    />
                                                )}
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="list"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <ListView
                                                appointments={sortedAppointments}
                                                onOpenView={handleOpenView}
                                                currentPage={currentPage}
                                                setCurrentPage={setCurrentPage}
                                                itemsPerPage={itemsPerPage}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* Sheets */}
                    <AnimatePresence>
                        {isSheetOpen && (
                            <AppointmentSheet
                                onClose={() => setIsSheetOpen(false)}
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
                                servicesCatalog={realServices}
                                staffCatalog={realStaffMembers}
                                clientsCatalog={realClients}
                                isSaving={isSaving}
                            />
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isCheckoutOpen && (
                            <CheckoutSheet
                                onClose={() => setIsCheckoutOpen(false)}
                                onComplete={() => handleCloseCheckout(true)}
                                initialData={draftData}
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
                                onClose={() => setIsUnavailableSheetOpen(false)}
                                onSave={async (item) => {
                                    const staff = realStaffMembers.find((s) => s.name === item.staff) || realStaffMembers[0];
                                    if (!staff) return;
                                    const createRes = await createAppointmentsAction([{
                                        customerName: 'Horário Indisponível',
                                        serviceName: item.title || item.type || 'Indisponível',
                                        date: item.date,
                                        time: item.startTime,
                                        endDate: item.date,
                                        endTime: item.endTime,
                                        duration: item.duration,
                                        staffId: staff.id,
                                        staffName: staff.name,
                                        price: 0,
                                        pricingUnit: 'Por Serviço',
                                        notes: item.description || null,
                                        status: 'Indisponível',
                                        source: 'unavailable',
                                    }]);
                                    if (createRes.success) {
                                        appointmentCacheRef.current.clear();
                                        setAppointments((prev) => [...prev, ...(createRes.created || []).map(mapDbAppointment)]);
                                    }
                                    setIsUnavailableSheetOpen(false);
                                }}
                            />
                        )}
                    </AnimatePresence>
                </FadeIn>
            </AnimatePresence>
        </>
    );
};

export default AppointmentsPage;
