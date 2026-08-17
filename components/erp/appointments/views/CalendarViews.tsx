import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarX, X, CalendarPlus, CalendarOff, ArrowUpDown, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { MoneyIcon, PartiallyPaidIcon, LikeIcon, PlayIcon, EyeOffIcon, ClockIcon, BlockedIcon } from '@/lib/icons';
import { Button } from '../../../reusable';
import { Appointment, StaffMember } from '../types';
import {
    getAppointmentStyle,
    getMultiDaySolidStyle,
    getMultiDayStyle,
    getEndTime,
    formatDateStr,
    getWeekDays,
    arrangeAppointments,
    isMultiDay,
    checkAppointmentCollision,
    getGridHoursRange,
    getDayOpeningTime,
    formatDuration
} from '../utils';
import { AppointmentListCard } from '../AppointmentListCard';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const checkOutsideOperatingHours = (aptDateStr: string, aptTimeStr: string, durationMinutes: number, openingHours: any) => {
    if (!openingHours) return false;
    const parseLocalDate = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    };
    const dateObj = parseLocalDate(aptDateStr);
    const dName = DAYS_OF_WEEK[dateObj.getDay()];
    const dConfig = openingHours[dName];
    if (!dConfig || dConfig.enabled === false) return false;

    const parseTimeToMinutes = (timeStr: string) => {
        if (!timeStr || !timeStr.includes(':')) return -1;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const fromMin = parseTimeToMinutes(dConfig.from);
    const toMin = parseTimeToMinutes(dConfig.to);

    const aptStartMin = parseTimeToMinutes(aptTimeStr);
    const aptEndMin = aptStartMin + durationMinutes;

    return aptStartMin < fromMin || aptEndMin > toMin;
};

const getClosedBlocks = (date: Date, openingHours: any, startHour: number, endHour: number) => {
    if (!openingHours) return [];
    const dName = DAYS_OF_WEEK[date.getDay()];
    const dConfig = openingHours[dName];

    const startMin = startHour * 60;
    const endMin = (endHour + 1) * 60;

    if (!dConfig || !dConfig.enabled) {
        return [{
            top: 0,
            height: ((endMin - startMin) / 60) * 80,
            label: "Fechado"
        }];
    }

    const parseTimeToMinutes = (timeStr: string) => {
        if (!timeStr || !timeStr.includes(':')) return -1;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const fromMin = parseTimeToMinutes(dConfig.from);
    const toMin = parseTimeToMinutes(dConfig.to);

    const blocks = [];

    if (fromMin > startMin) {
        const duration = fromMin - startMin;
        blocks.push({
            top: 0,
            height: (duration / 60) * 80,
            label: "Fora do Expediente"
        });
    }

    if (toMin < endMin) {
        const duration = endMin - toMin;
        const top = ((toMin - startMin) / 60) * 80;
        blocks.push({
            top,
            height: (duration / 60) * 80,
            label: "Fora do Expediente"
        });
    }

    return blocks;
};

// --- HELPER COMPONENTS ---

const PopoverContent = ({ activePopover, handleOpenCreate, handleOpenUnavailable, setActivePopover }: any) => (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl border border-brand-border dark:border-dark-border w-64 overflow-hidden origin-center animate-in fade-in zoom-in-95 duration-100">
        <div className="bg-gray-50 dark:bg-zinc-800/50 px-4 py-2 border-b border-brand-border dark:border-dark-border flex justify-between items-center">
            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                {activePopover?.date && <span className="ml-0 text-xs font-normal opacity-75">{activePopover.date.toLocaleDateString('pt-BR')}</span>}
                {activePopover?.time && <span className="ml-2">{activePopover.time}</span>}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setActivePopover(null); }} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                <X size={14} />
            </button>
        </div>
        <div className="p-1">
            <button className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors group" onClick={(e) => { e.stopPropagation(); handleOpenCreate(activePopover?.time, activePopover?.date, activePopover?.staffId); }}>
                <div className="w-8 h-8 rounded-full bg-brand-dark dark:bg-white flex items-center justify-center text-white dark:text-brand-dark">
                    <CalendarPlus size={16} />
                </div>
                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading group-hover:translate-x-1 transition-transform">Adicionar agendamento</span>
            </button>
            <button className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors group" onClick={(e) => { e.stopPropagation(); if (handleOpenUnavailable) handleOpenUnavailable(activePopover?.time, activePopover?.date, activePopover?.staffId); else setActivePopover(null); }}>
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center text-brand-inactive-text dark:text-dark-body">
                    <CalendarOff size={16} />
                </div>
                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading group-hover:translate-x-1 transition-transform">Adicionar horário indisponível</span>
            </button>
        </div>
    </div>
);

// --- Google Calendar Style Multi-Day Bar ---
const GoogleCalendarMultiDayBar: React.FC<{
    appointment: Appointment;
    isStart: boolean;
    isEnd: boolean;
    showTitle?: boolean;
    onClick: () => void;
    className?: string;
}> = ({ appointment, isStart, isEnd, showTitle = true, onClick, className = '' }) => {
    const solidStyle = getMultiDaySolidStyle(appointment.status);

    const tooltip = `${appointment.customer} • ${appointment.service}\nInício: ${appointment.date} ${appointment.time}\nTérmino: ${appointment.endDate || appointment.date} ${appointment.endTime || appointment.time}\nDuração: ${formatDuration(appointment.duration)}\nStatus: ${appointment.status}`;

    return (
        <div
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            title={tooltip}
            className={`
                h-6 text-[11px] font-semibold flex items-center cursor-pointer transition-all hover:brightness-105 active:scale-[0.99] select-none
                ${solidStyle.bg} ${solidStyle.text} ${solidStyle.shadow}
                ${isStart ? 'rounded-l-md ml-1 pl-2' : 'rounded-l-none pl-1.5 border-l-0'}
                ${isEnd ? 'rounded-r-md mr-1 pr-2' : 'rounded-r-none pr-1.5 border-r-0'}
                ${className}
            `}
        >
            {!isStart && (
                <span className="text-[10px] opacity-70 mr-0.5 shrink-0 select-none">‹</span>
            )}

            {showTitle && (
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {isStart && appointment.time && (
                        <span className="text-[10px] font-bold opacity-90 shrink-0">
                            {appointment.time}
                        </span>
                    )}
                    <span className="truncate font-semibold text-white leading-none">
                        {appointment.customer}
                    </span>
                    <span className="text-[10px] opacity-80 truncate hidden sm:inline leading-none">
                        • {appointment.service}
                    </span>
                </div>
            )}

            {!isEnd && (
                <span className="text-[10px] opacity-70 ml-auto shrink-0 select-none">›</span>
            )}
        </div>
    );
};

// --- MOBILE VIEW ---

export const MobileView = ({
    currentDate,
    appointments,
    allAppointments = [],
    setCurrentDate,
    navigateDate,
    getViewLabel,
    handleOpenCreate,
    handleOpenView,
    columns,
    openingHours
}: any) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const dayApps = appointments.filter((a: Appointment) => {
            if (isMultiDay(a)) {
                const end = a.endDate || a.date;
                return dateStr >= a.date && dateStr <= end;
            }
            return a.date === dateStr;
        });
        const isSelected = date.getDate() === currentDate.getDate();

        days.push({
            date,
            dayNumber: d,
            dayName: date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
            hasAppointments: dayApps.length > 0,
            appointments: dayApps,
            isSelected
        });
    }

    const currentDateStr = formatDateStr(currentDate);
    const selectedDateApps = appointments
        .filter((a: Appointment) => {
            if (isMultiDay(a)) {
                const end = a.endDate || a.date;
                return currentDateStr >= a.date && currentDateStr <= end;
            }
            return a.date === currentDateStr;
        })
        .sort((a: Appointment, b: Appointment) => {
            // Multi-day first, then by time
            const aMulti = isMultiDay(a);
            const bMulti = isMultiDay(b);
            if (aMulti && !bMulti) return -1;
            if (!aMulti && bMulti) return 1;
            return a.time.localeCompare(b.time);
        });

    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!scrollContainerRef.current) return;
        const activeEl = scrollContainerRef.current.querySelector('[data-active="true"]');
        if (activeEl) {
            activeEl.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [currentDate]);

    return (
        <div className="flex flex-col h-full mt-4">
            <div className="bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border py-4 mb-4 relative">
                {/* Left Fade/Shadow */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-surface to-transparent pointer-events-none z-10" />

                <div
                    ref={scrollContainerRef}
                    className="flex overflow-x-auto gap-4 px-8 no-scrollbar snap-x items-center justify-between text-center"
                >
                    {days.map((dayItem, index) => (
                        <div
                            key={index}
                            onClick={() => setCurrentDate(dayItem.date)}
                            data-active={dayItem.isSelected}
                            className="flex flex-col items-center gap-1 cursor-pointer group min-w-[50px] snap-center"
                        >
                            <div className={`w-10 h-10 rounded-full flex flex-col items-center justify-center text-sm font-bold transition-all relative ${dayItem.isSelected
                                ? 'bg-brand-green text-white'
                                : 'text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border'
                                }`}>
                                <span className="leading-none mt-0.5">{dayItem.dayNumber}</span>
                                {dayItem.hasAppointments && (
                                    <div className={`w-1 h-1 rounded-full mt-0.5 ${dayItem.isSelected ? 'bg-white/70' : 'bg-brand-green'}`}></div>
                                )}
                            </div>
                            <span className={`text-[10px] font-medium uppercase tracking-wide ${dayItem.isSelected ? 'text-brand-dark dark:text-dark-heading' : 'text-brand-inactive-text dark:text-dark-body'}`}>
                                {dayItem.dayName}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Right Fade/Shadow */}
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-surface to-transparent pointer-events-none z-10" />
            </div>
            <AnimatePresence mode='wait'>
                <motion.div key={currentDate.toISOString()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto pb-20 space-y-3">
                    {selectedDateApps.length > 0 ? (
                        <div className="space-y-3 mt-2">
                            {selectedDateApps.map((apt: Appointment) => (
                                <AppointmentListCard
                                    key={apt.id}
                                    appointment={apt}
                                    onClick={handleOpenView}
                                    openingHours={openingHours}
                                    appointments={allAppointments}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4 text-brand-inactive-text"><CalendarX size={24} /></div>
                            <h3 className="text-brand-dark dark:text-dark-heading font-bold mb-1">Sem agendamentos</h3>
                            <p className="text-sm text-brand-inactive-text max-w-[200px]">Não há agendamentos para este dia.</p>
                            <Button variant="outline" className="mt-4 rounded-full" onClick={() => handleOpenCreate()}>Adicionar</Button>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

// --- DAY VIEW (Image 4 Google Agenda Style) ---

export const DayView = ({
    appointments,
    allAppointments = [],
    currentDate,
    staffMembers,
    onOpenView,
    handleGridMouseMove,
    handleGridMouseLeave,
    handleGridClick,
    hoverColIndex,
    hoverTime,
    activePopover,
    setActivePopover,
    handleOpenCreate,
    handleOpenUnavailable,
    openingHours
}: any) => {
    const { startHour, endHour } = getGridHoursRange(currentDate, openingHours);
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

    const currentDateStr = formatDateStr(currentDate);

    // Multi-day events covering this date
    const allDayEvents = appointments.filter((a: Appointment) => {
        if (!isMultiDay(a)) return false;
        const start = a.date;
        const end = a.endDate || a.date;
        return currentDateStr >= start && currentDateStr <= end;
    });

    // Hourly single-day events for this specific date
    const hourlyEvents = appointments.filter((a: Appointment) => a.date === currentDateStr && !isMultiDay(a));

    const closedBlocks = getClosedBlocks(currentDate, openingHours, startHour, endHour);

    return (
        <div className="flex flex-col h-full overflow-hidden relative">

            {/* Google Calendar Top All-Day / Multi-Day Bar (Image 4) */}
            {allDayEvents.length > 0 && (
                <div className="flex border-b border-brand-border dark:border-dark-border bg-gray-50/70 dark:bg-zinc-900/40 flex-shrink-0 z-20">
                    <div className="w-16 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-2 text-[10px] font-bold text-brand-inactive-text text-center flex flex-col items-center justify-center uppercase tracking-wider">
                        <span>GMT-03</span>
                        <span className="text-[9px] font-normal text-brand-inactive-text/70">Dia Todo</span>
                    </div>
                    <div className="flex-1 p-2 space-y-1.5 overflow-y-auto max-h-[140px] custom-scrollbar">
                        {allDayEvents.map((apt: Appointment) => {
                            const isStart = apt.date === currentDateStr;
                            const isEnd = (apt.endDate || apt.date) === currentDateStr;

                            return (
                                <GoogleCalendarMultiDayBar
                                    key={apt.id}
                                    appointment={apt}
                                    isStart={isStart}
                                    isEnd={isEnd}
                                    showTitle={true}
                                    onClick={() => onOpenView(apt)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative">
                <div className="w-16 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                    <div className="h-16 border-b border-brand-border dark:border-dark-border"></div>
                    <div className="overflow-hidden">
                        {hours.map(h => (
                            <div key={h} className="h-20 border-b border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body text-center pt-2 relative select-none">
                                {String(h).padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-1 flex overflow-x-auto no-scrollbar relative overflow-y-scroll custom-scrollbar">
                    {staffMembers.map((staff: StaffMember, colIndex: number) => {
                        const rawAppointments = hourlyEvents.filter((a: Appointment) => a.staffId === staff.id);
                        const staffAppointments = arrangeAppointments(rawAppointments);

                        return (
                            <div key={staff.id} className="flex-1 min-w-[200px] border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface relative group resource-column">
                                <div className="h-16 border-b border-brand-border dark:border-dark-border flex flex-col items-center justify-center sticky top-0 bg-white dark:bg-dark-surface z-20 px-2 pointer-events-none">
                                    <div className="flex items-center gap-2">
                                        <UserProfileImage fullName={staff.name} imageUrl={staff.avatar} className="w-8 h-8 shrink-0 text-[10px]" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">{staff.name}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative" onMouseMove={(e) => handleGridMouseMove(e, colIndex)} onMouseLeave={handleGridMouseLeave} onClick={(e) => handleGridClick(e, staff.id)}>
                                    {/* Closed Blocks */}
                                    {closedBlocks.map((block, bIdx) => (
                                        <div
                                            key={bIdx}
                                            className="absolute left-0 right-0 z-0 bg-[repeating-linear-gradient(-45deg,rgba(239,68,68,0.04),rgba(239,68,68,0.04)_10px,transparent_10px,transparent_20px)] bg-red-50/5 dark:bg-red-950/5 border-y border-red-100/10 dark:border-red-900/10 flex items-center justify-center pointer-events-none"
                                            style={{ top: `${block.top}px`, height: `${block.height}px` }}
                                        >
                                            <span className="text-xs font-bold text-brand-red/70 uppercase tracking-widest">{block.label}</span>
                                        </div>
                                    ))}

                                    {hours.map(h => (
                                        <div key={h} className="h-20 border-b border-brand-border dark:border-dark-border border-dashed dark:border-zinc-800 pointer-events-none relative z-10">
                                            <div className="absolute top-[25%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                            <div className="absolute top-[50%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                            <div className="absolute top-[75%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                        </div>
                                    ))}
                                    {hoverColIndex === colIndex && hoverTime && (
                                        <div className="absolute w-full h-[1px] bg-blue-500 z-30 pointer-events-none flex items-center" style={{ top: hoverTime.top }}>
                                            <div className="absolute left-0 -top-3 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                                {String(hoverTime.hour).padStart(2, '0')}:{String(hoverTime.minutes).padStart(2, '0')}
                                            </div>
                                        </div>
                                    )}
                                    <AnimatePresence>
                                        {staffAppointments.map(apt => {
                                            const top = ((apt.start / 60) - startHour) * 80;
                                            const effectiveDuration = Math.min(apt.duration, (endHour - startHour + 1) * 60);
                                            const height = (effectiveDuration / 60) * 80;
                                            const style = getAppointmentStyle(apt.status);
                                            const endTime = getEndTime(apt.time, apt.duration);

                                            const s = (apt.status || '').toLowerCase();
                                            let StatusIcon = ClockIcon;
                                            if (s === 'confirmed' || s === 'confirmado' || s === 'completed' || s === 'concluído' || s === 'concluido' || s === 'finished') StatusIcon = LikeIcon;
                                            else if (s === 'iniciado' || s === 'in progress') StatusIcon = PlayIcon;
                                            else if (s === 'ausência' || s === 'absent' || s === 'ausencia') StatusIcon = EyeOffIcon;
                                            else if (s === 'canceled' || s === 'cancelado') StatusIcon = BlockedIcon;

                                            const isOutsideHours = checkOutsideOperatingHours(apt.date, apt.time, apt.duration, openingHours);
                                            const hasCollision = checkAppointmentCollision(apt, allAppointments);
                                            const isCompact = height < 50;

                                            return (
                                                <motion.div
                                                    key={apt.id}
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    className={`absolute rounded-xl p-2 border ${style.container} cursor-pointer hover:opacity-90 transition-all z-10 flex flex-col justify-start overflow-hidden`}
                                                    style={{ top: `${top}px`, height: `${height}px`, left: `${(apt.column || 0) * (100 / (apt.totalColumns || 1))}%`, width: `${100 / (apt.totalColumns || 1)}%`, marginRight: '2px', boxSizing: 'border-box' }}
                                                    onClick={(e) => { e.stopPropagation(); onOpenView(apt); }}
                                                >
                                                    <div className="flex h-full gap-2 items-center">
                                                        <div className={`w-1 h-full rounded-full flex-shrink-0 ${style.bar}`}></div>
                                                        {isCompact ? (
                                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                                                <div className="flex items-center gap-1.5 min-w-0 truncate">
                                                                    <span className={`font-bold text-[9px] ${style.title} shrink-0`}>{apt.time}</span>
                                                                    <span className={`font-bold text-[10px] ${style.title} truncate`}>{apt.customer}</span>
                                                                    <span className={`text-[9px] ${style.text} truncate opacity-90`}>• {apt.service}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    {hasCollision && (
                                                                        <span title="Conflito de horário detectado">
                                                                            <AlertTriangle size={11} className="text-red-500 shrink-0" />
                                                                        </span>
                                                                    )}
                                                                    {isOutsideHours && (
                                                                        <span title="Fora do horário de expediente">
                                                                            <AlertTriangle size={11} className="text-orange-500 shrink-0" />
                                                                        </span>
                                                                    )}
                                                                    {apt.paymentStatus && ['paid', 'pago', 'partially paid', 'parcialmente pago'].includes(apt.paymentStatus.toLowerCase()) && (
                                                                        <div className={`${style.text} opacity-70`}>
                                                                            {['paid', 'pago'].includes(apt.paymentStatus.toLowerCase()) ? <MoneyIcon size={11} /> : <PartiallyPaidIcon size={11} />}
                                                                        </div>
                                                                    )}
                                                                    <div className={`${style.text} opacity-70`}>
                                                                        <StatusIcon size={11} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center justify-between mb-0.5">
                                                                        <span className={`font-bold text-[10px] ${style.title} truncate`}>{apt.time} - {endTime}</span>
                                                                        <div className="flex items-center gap-1">
                                                                            {hasCollision && (
                                                                                <span title="Conflito de horário detectado">
                                                                                    <AlertTriangle size={12} className="text-red-500 shrink-0" />
                                                                                </span>
                                                                            )}
                                                                            {isOutsideHours && (
                                                                                <span title="Fora do horário de expediente">
                                                                                    <AlertTriangle size={12} className="text-orange-500 shrink-0" />
                                                                                </span>
                                                                            )}
                                                                            {apt.paymentStatus && ['paid', 'pago', 'partially paid', 'parcialmente pago'].includes(apt.paymentStatus.toLowerCase()) && (
                                                                                <div className={`${style.text} opacity-70`}>
                                                                                    {['paid', 'pago'].includes(apt.paymentStatus.toLowerCase()) ? <MoneyIcon size={12} /> : <PartiallyPaidIcon size={12} />}
                                                                                </div>
                                                                            )}
                                                                            <div className={`${style.text} opacity-70`}>
                                                                                <StatusIcon size={12} />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`font-bold text-[11px] ${style.title} truncate leading-tight mb-0.5`}>{apt.customer}</div>
                                                                    <div className={`text-[9px] ${style.text} truncate opacity-90 mb-1`}>{apt.service}</div>
                                                                </div>

                                                                {height >= 70 && (
                                                                    <div className="border-t border-black/5 dark:border-white/5 pt-1 mt-auto">
                                                                        <span className={`text-[9px] font-bold ${style.text} truncate block`}>{apt.staff}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>

                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <AnimatePresence>{activePopover && activePopover.mode === 'absolute' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'fixed', top: activePopover.top, left: activePopover.align === 'left' ? activePopover.left - 256 : activePopover.left, zIndex: 60 }}
                >
                    <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} handleOpenUnavailable={handleOpenUnavailable} setActivePopover={setActivePopover} />
                </motion.div>
            )}</AnimatePresence>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    );
};

// --- TIMELINE VIEW (Week View - Image 3 Google Agenda Style) ---

export const TimelineView = ({
    appointments,
    allAppointments = [],
    currentDate,
    staffMembers,
    onOpenView,
    handleTimelineMouseMove,
    handleGridMouseLeave,
    handleGridClick,
    hoverStaffId,
    hoverTime,
    activePopover,
    setActivePopover,
    handleOpenCreate,
    handleOpenUnavailable,
    handleOpenMore,
    openingHours
}: any) => {
    const days = getWeekDays(currentDate);
    const staffCount = staffMembers.length;
    const maxItems = staffCount <= 4 ? 4 : 3;

    const weekStartStr = formatDateStr(days[0]);
    const weekEndStr = formatDateStr(days[6]);

    // Multi-day events that overlap with current week
    const longWeekEvents = appointments.filter((a: Appointment) => {
        if (!isMultiDay(a)) return false;
        const start = a.date;
        const end = a.endDate || a.date;
        return (start <= weekEndStr) && (end >= weekStartStr);
    }).sort((a: Appointment, b: Appointment) => a.date.localeCompare(b.date) || b.duration - a.duration);

    // Compute multi-day slot layout so overlapping bars are placed in separate horizontal rows
    const multiDaySlots: Array<{
        apt: Appointment;
        startCol: number;
        endCol: number;
        span: number;
        slotRow: number;
        isStart: boolean;
        isEnd: boolean;
    }> = [];

    const slotGrid: boolean[][] = []; // slotGrid[row][col]

    longWeekEvents.forEach((apt: Appointment) => {
        const aptStart = apt.date;
        const aptEnd = apt.endDate || apt.date;

        let startCol = 0;
        let endCol = 6;

        days.forEach((d: Date, idx: number) => {
            const dStr = formatDateStr(d);
            if (dStr === aptStart) startCol = idx;
            if (dStr < aptStart && idx > startCol) startCol = idx + 1;
            if (dStr === aptEnd) endCol = idx;
            if (dStr > aptEnd && idx <= endCol) endCol = Math.max(0, idx - 1);
        });

        // Clamp
        startCol = Math.max(0, Math.min(6, startCol));
        endCol = Math.max(startCol, Math.min(6, endCol));
        const span = endCol - startCol + 1;

        // Find first row where columns startCol..endCol are free
        let slotRow = 0;
        while (true) {
            if (!slotGrid[slotRow]) slotGrid[slotRow] = Array(7).fill(false);
            let free = true;
            for (let c = startCol; c <= endCol; c++) {
                if (slotGrid[slotRow][c]) {
                    free = false;
                    break;
                }
            }
            if (free) {
                for (let c = startCol; c <= endCol; c++) {
                    slotGrid[slotRow][c] = true;
                }
                break;
            }
            slotRow++;
        }

        multiDaySlots.push({
            apt,
            startCol,
            endCol,
            span,
            slotRow,
            isStart: aptStart >= weekStartStr,
            isEnd: aptEnd <= weekEndStr
        });
    });

    return (
        <div className="flex flex-col h-full min-h-[600px] relative overflow-hidden">
            {/* Header Row with Days */}
            <div className="flex h-16 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10 flex-shrink-0">
                <div className="w-48 flex-shrink-0 border-r border-brand-border dark:border-dark-border flex items-center justify-center bg-gray-50 dark:bg-zinc-900/50">
                    <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Profissionais</span>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    {days.map((day: Date, idx: number) => {
                        const isToday = day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth() && day.getFullYear() === new Date().getFullYear();
                        return (
                            <div key={idx} className="flex-1 border-r border-brand-border dark:border-dark-border flex flex-col items-center justify-center bg-white dark:bg-dark-surface relative min-w-[140px]">
                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isToday ? 'text-brand-green' : 'text-brand-inactive-text dark:text-dark-body'}`}>
                                    {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                                </span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isToday ? 'bg-brand-dark dark:bg-white text-white dark:text-brand-dark' : 'text-brand-dark dark:text-dark-heading'}`}>
                                    {day.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Google Calendar Multi-Day Bar Section across Week Columns (Image 3) */}
            {longWeekEvents.length > 0 && (
                <div className="flex border-b border-brand-border dark:border-dark-border bg-gray-50/70 dark:bg-zinc-900/40 flex-shrink-0 z-20">
                    <div className="w-48 flex-shrink-0 border-r border-brand-border dark:border-dark-border flex flex-col items-center justify-center p-2 bg-white dark:bg-dark-surface">
                        <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide">GMT-03</span>
                        <span className="text-[9px] font-normal text-brand-inactive-text/70">Longa Duração</span>
                    </div>
                    <div className="flex-1 overflow-x-auto custom-scrollbar no-scrollbar">
                        <div className="min-w-[1000px] p-1.5 relative">
                            {/* Grid container for multi-day slots */}
                            <div
                                className="grid grid-cols-7 gap-y-1.5 w-full relative"
                                style={{
                                    gridTemplateRows: `repeat(${slotGrid.length || 1}, minmax(26px, auto))`
                                }}
                            >
                                {multiDaySlots.map(({ apt, startCol, span, slotRow, isStart, isEnd }) => (
                                    <div
                                        key={apt.id}
                                        style={{
                                            gridColumn: `${startCol + 1} / span ${span}`,
                                            gridRow: `${slotRow + 1}`
                                        }}
                                        className="w-full"
                                    >
                                        <GoogleCalendarMultiDayBar
                                            appointment={apt}
                                            isStart={isStart}
                                            isEnd={isEnd}
                                            showTitle={true}
                                            onClick={() => onOpenView(apt)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Staff Rows Timeline Grid */}
            <div className="flex-1 flex overflow-hidden">
                <div className="w-48 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-20 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] overflow-y-auto no-scrollbar">
                    {staffMembers.map((staff: StaffMember) => (
                        <div key={staff.id} className="h-40 border-b border-brand-border dark:border-dark-border flex items-center gap-3 px-4">
                            <UserProfileImage fullName={staff.name} imageUrl={staff.avatar} className="w-10 h-10 shrink-0 text-xs" />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">{staff.name}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-x-auto custom-scrollbar relative overflow-y-auto">
                    <div className="min-w-[1000px] h-full relative">
                        <div className="absolute inset-0 flex pointer-events-none h-full">
                            {days.map((_: any, i: number) => (
                                <div key={i} className="flex-1 border-r border-brand-border dark:border-dark-border h-full relative min-w-[140px]"></div>
                            ))}
                        </div>

                        {staffMembers.map((staff: StaffMember) => (
                            <div key={staff.id} className="flex h-40 border-b border-brand-border dark:border-dark-border relative">
                                {days.map((day: Date, dIdx: number) => {
                                    const dateStr = formatDateStr(day);

                                    // Filter only single-day hourly events for this cell
                                    const cellApps = appointments.filter((a: Appointment) =>
                                        a.date === dateStr && a.staffId === staff.id && !isMultiDay(a)
                                    ).sort((a: Appointment, b: Appointment) => a.time.localeCompare(b.time));

                                    const displayApps = cellApps.slice(0, maxItems);
                                    const remainingCount = cellApps.length - maxItems;

                                    const dName = DAYS_OF_WEEK[day.getDay()];
                                    const dConfig = openingHours ? openingHours[dName] : null;
                                    const isClosed = openingHours && (!dConfig || !dConfig.enabled);

                                    return (
                                        <div
                                            key={dIdx}
                                            className={`flex-1 relative min-w-[140px] p-2 transition-colors cursor-pointer group ${isClosed ? 'border border-red-200 dark:border-red-900 bg-[#fef2f2]/60 dark:bg-red-950/5 rounded-xl m-1 hover:bg-[#fee2e2]/40 dark:hover:bg-red-950/10' : 'border-r border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-zinc-900/50'}`}
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX;
                                                const y = e.clientY;
                                                const align = x > window.innerWidth / 2 ? 'left' : 'right';

                                                setActivePopover({
                                                    staffId: staff.id,
                                                    date: day,
                                                    time: getDayOpeningTime(day, openingHours),
                                                    top: y,
                                                    left: x,
                                                    align,
                                                    mode: 'absolute'
                                                });
                                            }}
                                        >
                                            {isClosed && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                                    <span className="px-4 py-1 text-xs font-semibold text-[#991b1b] bg-[#fee2e2] dark:text-red-200 dark:bg-red-950/80 border border-red-200/50 rounded-full">
                                                        Fechado
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-1.5 h-full overflow-hidden relative z-10">
                                                {displayApps.map((apt: Appointment) => {
                                                    const style = getAppointmentStyle(apt.status);
                                                    const endTime = getEndTime(apt.time, apt.duration);
                                                    const isOutsideHours = checkOutsideOperatingHours(apt.date, apt.time, apt.duration, openingHours);
                                                    const hasCollision = checkAppointmentCollision(apt, allAppointments);
                                                    const s = (apt.status || '').toLowerCase();
                                                    const isCompleted = s === 'completed' || s === 'concluído' || s === 'concluido' || s === 'finished';

                                                    return (
                                                        <motion.div
                                                            key={apt.id}
                                                            initial={{ opacity: 0, scale: 0.9 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            className={`text-[10px] px-1.5 py-1 rounded truncate border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-between gap-1.5 font-bold ${style.container} ${style.title}`}
                                                            onClick={(e) => { e.stopPropagation(); onOpenView(apt); }}
                                                        >
                                                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                                                                <div className={`w-0.5 h-2 rounded-full ${style.bar} shrink-0`}></div>
                                                                <span className="truncate">{apt.time}-{endTime} {apt.customer}</span>
                                                            </div>
                                                            <div className="flex items-center gap-0.5 shrink-0">
                                                                {hasCollision && (
                                                                    <span title="Conflito de horário detectado">
                                                                        <AlertTriangle size={10} className="text-red-500 shrink-0" />
                                                                    </span>
                                                                )}
                                                                {isOutsideHours && <AlertTriangle size={10} className="text-orange-500" />}
                                                                {isCompleted && <LikeIcon size={10} />}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                                {remainingCount > 0 && (
                                                    <div
                                                        className="text-[10px] text-brand-inactive-text font-medium pl-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading"
                                                        onClick={(e) => { e.stopPropagation(); if (handleOpenMore) handleOpenMore(dateStr, cellApps); }}
                                                    >
                                                        + {remainingCount} agendamentos
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <AnimatePresence>{activePopover && activePopover.mode === 'absolute' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'fixed', top: activePopover.top, left: activePopover.left, zIndex: 60 }}
                >
                    <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} handleOpenUnavailable={handleOpenUnavailable} setActivePopover={setActivePopover} />
                </motion.div>
            )}</AnimatePresence>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    );
};

// --- MONTH VIEW (Image 1 & 2 Google Agenda Style) ---

export const MonthView = ({
    appointments,
    currentDate,
    handleGenericCellClick,
    activePopover,
    handleOpenCreate,
    handleOpenUnavailable,
    setActivePopover,
    handleOpenView,
    handleOpenMore,
    openingHours
}: any) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Compute grid weeks from Sunday before 1st of month to Saturday after last of month
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const gridStartDate = new Date(firstDayOfMonth);
    gridStartDate.setDate(gridStartDate.getDate() - gridStartDate.getDay()); // Start on Sunday

    const gridEndDate = new Date(lastDayOfMonth);
    gridEndDate.setDate(gridEndDate.getDate() + (6 - gridEndDate.getDay())); // End on Saturday

    // Build weeks array
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    const iterDate = new Date(gridStartDate);

    while (iterDate <= gridEndDate || currentWeek.length > 0) {
        currentWeek.push(new Date(iterDate));
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
        iterDate.setDate(iterDate.getDate() + 1);
        if (iterDate > gridEndDate && currentWeek.length === 0) break;
    }

    const todayDateStr = formatDateStr(new Date());

    return (
        <div className="flex flex-col border-l border-t border-brand-border dark:border-dark-border relative select-none">
            {weeks.map((weekDays: Date[], weekIdx: number) => {
                const weekStartStr = formatDateStr(weekDays[0]);
                const weekEndStr = formatDateStr(weekDays[6]);

                // Filter appointments active in this week
                const weekMultiDayEvents = appointments.filter((a: Appointment) => {
                    if (!isMultiDay(a)) return false;
                    const start = a.date;
                    const end = a.endDate || a.date;
                    return (start <= weekEndStr) && (end >= weekStartStr);
                }).sort((a: Appointment, b: Appointment) => a.date.localeCompare(b.date) || b.duration - a.duration);

                // Slot allocation matrix for the week: slotGrid[slotRow][colIdx]
                const slotGrid: boolean[][] = [];
                const multiDaySlots: Array<{
                    apt: Appointment;
                    startCol: number;
                    endCol: number;
                    span: number;
                    slotRow: number;
                    isStart: boolean;
                    isEnd: boolean;
                }> = [];

                // 1. Allocate multi-day events first
                weekMultiDayEvents.forEach((apt: Appointment) => {
                    const aptStart = apt.date;
                    const aptEnd = apt.endDate || apt.date;

                    let startCol = 0;
                    let endCol = 6;

                    weekDays.forEach((d: Date, idx: number) => {
                        const dStr = formatDateStr(d);
                        if (dStr === aptStart) startCol = idx;
                        if (dStr < aptStart && idx > startCol) startCol = idx + 1;
                        if (dStr === aptEnd) endCol = idx;
                        if (dStr > aptEnd && idx <= endCol) endCol = Math.max(0, idx - 1);
                    });

                    startCol = Math.max(0, Math.min(6, startCol));
                    endCol = Math.max(startCol, Math.min(6, endCol));
                    const span = endCol - startCol + 1;

                    let slotRow = 0;
                    while (true) {
                        if (!slotGrid[slotRow]) slotGrid[slotRow] = Array(7).fill(false);
                        let free = true;
                        for (let c = startCol; c <= endCol; c++) {
                            if (slotGrid[slotRow][c]) {
                                free = false;
                                break;
                            }
                        }
                        if (free) {
                            for (let c = startCol; c <= endCol; c++) {
                                slotGrid[slotRow][c] = true;
                            }
                            break;
                        }
                        slotRow++;
                    }

                    multiDaySlots.push({
                        apt,
                        startCol,
                        endCol,
                        span,
                        slotRow,
                        isStart: aptStart === formatDateStr(weekDays[startCol]),
                        isEnd: aptEnd === formatDateStr(weekDays[endCol])
                    });
                });

                // 2. Allocate single-day events for each day of this week
                const singleDaySlots: Array<{
                    apt: Appointment;
                    colIdx: number;
                    slotRow: number;
                }> = [];

                const dayOverflowCounts: number[] = Array(7).fill(0);
                const MAX_VISIBLE_SLOTS = 3;

                weekDays.forEach((day: Date, colIdx: number) => {
                    const dStr = formatDateStr(day);
                    const daySingleApps = appointments.filter((a: Appointment) => a.date === dStr && !isMultiDay(a))
                        .sort((a: Appointment, b: Appointment) => a.time.localeCompare(b.time));

                    daySingleApps.forEach((apt: Appointment) => {
                        let slotRow = 0;
                        while (true) {
                            if (!slotGrid[slotRow]) slotGrid[slotRow] = Array(7).fill(false);
                            if (!slotGrid[slotRow][colIdx]) {
                                slotGrid[slotRow][colIdx] = true;
                                break;
                            }
                            slotRow++;
                        }

                        if (slotRow < MAX_VISIBLE_SLOTS) {
                            singleDaySlots.push({
                                apt,
                                colIdx,
                                slotRow
                            });
                        } else {
                            dayOverflowCounts[colIdx]++;
                        }
                    });
                });

                const totalRows = Math.min(MAX_VISIBLE_SLOTS, Math.max(1, slotGrid.length));

                return (
                    <div key={weekIdx} className="grid grid-cols-7 relative min-h-[125px] border-b border-brand-border dark:border-dark-border group/week">
                        {/* Background Day Cells */}
                        {weekDays.map((day: Date, colIdx: number) => {
                            const dStr = formatDateStr(day);
                            const isCurrentMonth = day.getMonth() === month;
                            const isToday = dStr === todayDateStr;

                            const dName = DAYS_OF_WEEK[day.getDay()];
                            const dConfig = openingHours ? openingHours[dName] : null;
                            const isClosed = openingHours && (!dConfig || !dConfig.enabled);

                            const allDayEventsForModal = appointments.filter((a: Appointment) => {
                                if (isMultiDay(a)) {
                                    const end = a.endDate || a.date;
                                    return dStr >= a.date && dStr <= end;
                                }
                                return a.date === dStr;
                            });

                            return (
                                <div
                                    key={colIdx}
                                    className={`
                                        border-r border-brand-border dark:border-dark-border p-2 flex flex-col justify-between transition-colors cursor-pointer relative
                                        ${isClosed
                                            ? 'bg-red-50/20 dark:bg-red-950/10 hover:bg-red-50/40'
                                            : isCurrentMonth
                                                ? 'bg-white dark:bg-dark-surface hover:bg-gray-50/80 dark:hover:bg-zinc-900/50'
                                                : 'bg-gray-50/50 dark:bg-zinc-900/30 hover:bg-gray-100/50 text-brand-inactive-text/50'
                                        }
                                    `}
                                    onClick={(e) => handleGenericCellClick(e, day)}
                                >
                                    {/* Header with day number */}
                                    <div className="flex items-center justify-between mb-1 z-0">
                                        <div className={`
                                            w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                                            ${isToday
                                                ? 'bg-brand-dark dark:bg-white text-white dark:text-brand-dark shadow-sm'
                                                : isCurrentMonth
                                                    ? 'text-brand-dark dark:text-dark-heading'
                                                    : 'text-brand-inactive-text/50 dark:text-dark-body/50'
                                            }
                                        `}>
                                            {day.getDate()}
                                        </div>

                                        {isClosed && (
                                            <span className="text-[9px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/80 px-1.5 py-0.5 rounded-full border border-red-200/50">
                                                Fechado
                                            </span>
                                        )}
                                    </div>

                                    {/* Overflow Button (+ X mais) */}
                                    {dayOverflowCounts[colIdx] > 0 && (
                                        <div
                                            className="mt-auto pt-1 text-[10px] text-brand-inactive-text font-bold hover:text-brand-dark dark:hover:text-dark-heading z-20 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (handleOpenMore) handleOpenMore(dStr, allDayEventsForModal);
                                            }}
                                        >
                                            + {dayOverflowCounts[colIdx]} mais
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Foreground Multi-Day & Single-Day Event Layer across the 7 columns */}
                        <div
                            className="absolute inset-x-0 top-8 bottom-1 grid grid-cols-7 gap-y-1 pointer-events-none px-0.5 z-10"
                            style={{
                                gridTemplateRows: `repeat(${totalRows}, minmax(22px, 24px))`
                            }}
                        >
                            {/* Multi-Day Bars */}
                            {multiDaySlots
                                .filter(s => s.slotRow < MAX_VISIBLE_SLOTS)
                                .map(({ apt, startCol, span, slotRow, isStart, isEnd }) => (
                                    <div
                                        key={apt.id}
                                        style={{
                                            gridColumn: `${startCol + 1} / span ${span}`,
                                            gridRow: `${slotRow + 1}`
                                        }}
                                        className="w-full pointer-events-auto"
                                    >
                                        <GoogleCalendarMultiDayBar
                                            appointment={apt}
                                            isStart={isStart}
                                            isEnd={isEnd}
                                            showTitle={true}
                                            onClick={() => handleOpenView(apt)}
                                        />
                                    </div>
                                ))}

                            {/* Single-Day Compact Cards */}
                            {singleDaySlots.map(({ apt, colIdx, slotRow }) => {
                                const style = getAppointmentStyle(apt.status);
                                return (
                                    <div
                                        key={apt.id}
                                        style={{
                                            gridColumn: `${colIdx + 1} / span 1`,
                                            gridRow: `${slotRow + 1}`
                                        }}
                                        className="w-full pointer-events-auto px-1"
                                    >
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenView(apt);
                                            }}
                                            className={`
                                                h-5 text-[10px] px-1.5 py-0.5 rounded truncate border cursor-pointer hover:opacity-85 transition-all flex items-center gap-1 font-bold
                                                ${style.container} ${style.title}
                                            `}
                                        >
                                            <div className={`w-1 h-2 rounded-full ${style.bar} shrink-0`}></div>
                                            <span className="truncate font-semibold">{apt.time} {apt.customer}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            <AnimatePresence>{activePopover && activePopover.mode === 'absolute' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'fixed', top: activePopover.top, left: activePopover.align === 'left' ? activePopover.left : (activePopover.left ? activePopover.left - 256 : 0), zIndex: 60 }}
                >
                    <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} handleOpenUnavailable={handleOpenUnavailable} setActivePopover={setActivePopover} />
                </motion.div>
            )}</AnimatePresence>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    );
};
