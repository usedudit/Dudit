"use client";
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  LayoutList, 
  LayoutGrid,
  ArrowUpDown,
  ChevronDown,
  RotateCcw,
  Users,
  Check,
  Plus,
  Calendar as CalendarIcon
} from 'lucide-react';
import Button from '../Button';
import Dropdown, { DropdownItem } from '../Dropdown';
import { motion, AnimatePresence } from 'framer-motion';

import { 
    Appointment, 
    ViewType, 
    ModeType,
    PopoverState 
} from './types';

import { 
    initialAppointments,
    mockClients,
    staffMembers 
} from './data';

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
  getAppointmentsAction,
  updateAppointmentAction,
} from '@/app/actions/erp/appointments';
import { fetchPartnerCustomersBucket, fetchPartnerTeamMembersBucket } from '@/app/actions/erp/client-loaders';

const AppointmentsPage = () => {
  const [viewMode, setViewMode] = useState<ModeType>('calendar'); 
  const [calendarView, setCalendarView] = useState<ViewType>('day'); 
  const [currentDate, setCurrentDate] = useState(new Date(2024, 1, 24)); 
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [realStaffMembers, setRealStaffMembers] = useState(staffMembers);
  const [realClients, setRealClients] = useState<any[]>(mockClients);

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
  }), []);

  useEffect(() => {
      const loadRealData = async () => {
          const [appointmentsRes, teamRes, clientsRes] = await Promise.all([
              getAppointmentsAction(),
              fetchPartnerTeamMembersBucket(),
              fetchPartnerCustomersBucket(),
          ]);

          if (appointmentsRes.success) {
              setAppointments((appointmentsRes.items || []).map(mapDbAppointment));
          }

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
      };

      loadRealData();
  }, [mapDbAppointment]);

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

      setIsSheetOpen(false);
      setTempSelectionTime(null); 
      setDraftData(null); 
      setPreSelectedStaffId(undefined);
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

  const getFilteredAppointments = useMemo(() => {
      let filtered: Appointment[] = [];
      
      if (calendarView === 'day' || calendarView === 'week') {
          if (calendarView === 'week') {
              const weekDays = getWeekDays(currentDate);
              const startStr = formatDateStr(weekDays[0]);
              const endStr = formatDateStr(weekDays[6]);
              filtered = appointments.filter(a => a.date >= startStr && a.date <= endStr);
          } else {
              const dateStr = formatDateStr(currentDate);
              filtered = appointments.filter(a => a.date === dateStr);
          }
      } else if (calendarView === 'month') {
          const y = currentDate.getFullYear();
          const m = currentDate.getMonth() + 1; 
          const prefix = `${y}-${String(m).padStart(2, '0')}`;
          filtered = appointments.filter(a => a.date.startsWith(prefix));
      }

      return filtered.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
      });
  }, [currentDate, calendarView, appointments]);
  
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
    <div className="flex flex-col bg-white dark:bg-dark-surface transition-colors duration-300 min-h-full relative">
      <div className="max-w-[1700px] mx-auto w-full p-4 md:p-8 pt-6">
        
        <AnimatePresence>
            {isSelectionMode && (
                <TopSelectionBar 
                    onClose={cancelSelectionMode} 
                    onViewSheet={returnToSheet}
                />
            )}
        </AnimatePresence>

        {/* Page Header (Desktop) */}
        <div className={`hidden md:flex flex-col md:flex-row items-start justify-between gap-4 mb-8 transition-all ${isSelectionMode ? 'mt-[60px]' : ''}`}>
            <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Agendamentos</h1>
                </div>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Gerencie sua agenda de serviços e compromissos.</p>
            </div>
            
            <Button 
                variant="default"
                className="px-5 h-[42px] shadow-sm shadow-green-200 dark:shadow-none"
                leftIcon={<Plus size={18} strokeWidth={3} />}
                onClick={() => handleOpenCreate()}
            >
                Adicionar Agendamento
            </Button>
        </div>
        
        {/* Header Controls (Desktop) */}
        <div className="hidden md:block">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto no-scrollbar pb-2 lg:pb-0">
                  <Button variant="outline" className="rounded-full h-[40px] px-4" onClick={() => setCurrentDate(new Date())}>
                      Hoje
                  </Button>
                  
                  <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[40px] shadow-sm">
                      <button 
                        onClick={() => navigateDate('prev')}
                        className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                      >
                          <ChevronLeft size={18} />
                      </button>
                      <div className="px-4 text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap min-w-[160px] text-center">
                          {getViewLabel()}
                      </div>
                      <button 
                        onClick={() => navigateDate('next')}
                        className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                      >
                          <ChevronRight size={18} />
                      </button>
                  </div>

                  <Dropdown 
                    width="w-72" 
                    trigger={
                        <button className="flex items-center gap-2 px-4 h-[40px] border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shadow-sm">
                            Toda a equipe
                            <ChevronDown size={14} className="text-brand-inactive-text" />
                        </button>
                    }
                  >
                      <div className="p-1">
                          <DropdownItem className="rounded-lg font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"><Users size={16} className="text-purple-600 dark:text-purple-400" /> Toda a equipe</DropdownItem>
                          <div className="my-2 border-t border-brand-border dark:border-dark-border"></div>
                          <div className="space-y-2 px-3 py-2">
                              {realStaffMembers.slice(0,2).map(staff => (
                                  <label key={staff.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/50 p-1.5 rounded-lg -mx-1.5 transition-colors">
                                      <div className="relative flex items-center justify-center">
                                          <input type="checkbox" defaultChecked className="peer appearance-none w-5 h-5 border border-gray-300 rounded bg-white checked:bg-brand-green checked:border-brand-green" />
                                          <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                      </div>
                                      <img src={staff.avatar} className="w-6 h-6 rounded-full" />
                                      <span className="text-sm text-brand-dark dark:text-dark-body">{staff.name}</span>
                                  </label>
                              ))}
                          </div>
                      </div>
                  </Dropdown>
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                  <div className="flex items-center bg-gray-100 dark:bg-zinc-900 rounded-full p-1 h-[40px]">
                      <button 
                          onClick={() => setViewMode('calendar')}
                          className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-700 text-brand-dark dark:text-white shadow-sm' : 'text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading'}`}
                      >
                          <CalendarIcon size={16} />
                      </button>
                      <button 
                          onClick={() => setViewMode('list')}
                          className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-brand-dark dark:text-white shadow-sm' : 'text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading'}`}
                      >
                          <LayoutList size={16} />
                      </button>
                  </div>

                  <Button variant="outline" className="rounded-full h-[40px] w-[40px] p-0 flex items-center justify-center border-brand-border dark:border-dark-border shadow-sm" onClick={() => setCalendarView('day')}>
                        <RotateCcw size={16} className="text-brand-inactive-text" />
                  </Button>

                  <Dropdown 
                    width="w-32"
                    align="right"
                    trigger={
                        <button className="flex items-center gap-2 px-4 h-[40px] border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shadow-sm">
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
                        appointments={getFilteredAppointments} 
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
                staffCatalog={realStaffMembers}
                clientsCatalog={realClients}
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
                        setAppointments((prev) => [...prev, ...(createRes.created || []).map(mapDbAppointment)]);
                    }
                    setIsUnavailableSheetOpen(false);
                }}
              />
          )}
      </AnimatePresence>
    </div>
  );
};

export default AppointmentsPage;
