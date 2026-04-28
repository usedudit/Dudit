
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarX, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, RotateCcw, X, CalendarPlus, CalendarOff, User, MoreHorizontal, LayoutList, LayoutGrid, Clock, ArrowUpDown, Plus, Edit3, Utensils, Briefcase } from 'lucide-react';
import { Button, Dropdown, DropdownItem, Badge, Checkbox as FormCheckbox } from '../../../reusable';
import { Appointment, LayoutAppointment, StaffMember, PopoverState } from '../types';
import { getAppointmentStyle, getEndTime, formatDateStr, getWeekDays, arrangeAppointments, formatDuration, isMultiDay, getMultiDayStyle, parseLocalDate } from '../utils';

// --- HELPER COMPONENTS ---

const PopoverContent = ({ activePopover, handleOpenCreate, setIsUnavailableSheetOpen, setActivePopover }: any) => (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl border border-brand-border dark:border-dark-border w-64 overflow-hidden origin-center animate-in fade-in zoom-in-95 duration-100">
        <div className="bg-gray-50 dark:bg-zinc-800/50 px-4 py-2 border-b border-brand-border dark:border-dark-border flex justify-between items-center">
            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                {activePopover?.date && <span className="ml-0 text-xs font-normal opacity-75">{activePopover.date.toLocaleDateString('pt-BR')}</span>}
                {activePopover?.mode === 'resource' && <span className="ml-2">{activePopover.time}</span>}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setActivePopover(null); }} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                <X size={14} />
            </button>
        </div>
        <div className="p-1">
            <button className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors group" onClick={(e) => { e.stopPropagation(); handleOpenCreate(activePopover?.mode === 'resource' ? activePopover?.time : undefined, activePopover?.date, activePopover?.staffId); }}>
                <div className="w-8 h-8 rounded-full bg-brand-dark dark:bg-white flex items-center justify-center text-white dark:text-brand-dark">
                    <CalendarPlus size={16} />
                </div>
                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading group-hover:translate-x-1 transition-transform">Adicionar agendamento</span>
            </button>
            <button className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors group" onClick={(e) => { e.stopPropagation(); setIsUnavailableSheetOpen(true); setActivePopover(null); }}>
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center text-brand-inactive-text dark:text-dark-body">
                    <CalendarOff size={16} />
                </div>
                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading group-hover:translate-x-1 transition-transform">Adicionar horário indisponível</span>
            </button>
        </div>
    </div>
);

const SortableHeader = ({ label, right = false }: { label: string, right?: boolean }) => (
    <th className={`py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative ${right ? 'text-right' : ''}`}>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
        <div className={`flex items-center gap-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading group ${right ? 'justify-end' : ''}`}>
            {label}
            <ArrowUpDown size={14} className="text-brand-inactive-text group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300 transition-colors" />
        </div>
    </th>
);

// UPDATED LongEventBar to match AppointmentListCard style
const LongEventBar: React.FC<{ appointment: Appointment, onClick: () => void }> = ({ appointment, onClick }) => {
    // Reusing the exact same style logic as AppointmentListCard/Grid Cards
    const style = getAppointmentStyle(appointment.status);
    // Convert 'bg-X' to 'border-X' for left border
    const borderColorClass = style.bar.replace('bg-', 'border-');

    return (
        <div
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`
                w-full rounded-md px-2 py-1.5 border-l-4 border-y border-r cursor-pointer shadow-sm relative overflow-hidden transition-all active:scale-[0.98]
                ${style.container} ${borderColorClass}
                flex items-center gap-2 mb-1 h-8
            `}
        >
            <span className={`font-bold text-xs truncate ${style.title}`}>
                {appointment.customer}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></div>
            <span className={`text-[10px] truncate ${style.text} opacity-90`}>{appointment.service}</span>
            {/* Optional time if provided for start/end in same day block */}
            {appointment.time && (
                <>
                    <span className={`text-[10px] ${style.text} opacity-75`}>•</span>
                    <span className={`text-[10px] font-bold ${style.text} truncate`}>{appointment.time}</span>
                </>
            )}
        </div>
    );
}

// --- MOBILE VIEW ---

export const MobileView = ({
    currentDate,
    appointments,
    setCurrentDate,
    navigateDate,
    getViewLabel,
    handleOpenCreate,
    handleOpenView
}: any) => {
    // ... Mobile View implementation same as previous ...
    const renderMobileHeader = () => {
        const fullLabel = getViewLabel();
        return (
            <div className="flex flex-col gap-3 mb-4 px-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[40px] shadow-sm min-w-0">
                        <button onClick={() => navigateDate('prev')} className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><ChevronLeft size={18} /></button>
                        <div className="flex-1 px-2 text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap text-center truncate">{fullLabel}</div>
                        <button onClick={() => navigateDate('next')} className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><ChevronRight size={18} /></button>
                    </div>

                    <Button className="w-10 h-10" onClick={() => setCurrentDate(new Date())}>
                        <RotateCcw size={18} />
                    </Button>
                    <Button className="w-10 h-10">
                        <Users size={18} />
                    </Button>
                    <Button className="w-10 h-10">
                        <CalendarIcon size={18} />
                    </Button>
                </div>

                <Button
                    variant="default"
                    className="w-full h-[40px] rounded-full shadow-sm bg-brand-green hover:bg-brand-green/90 text-white font-bold"
                    onClick={() => handleOpenCreate()}
                >
                    Novo Agendamento
                </Button>
            </div>
        )
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const dayApps = appointments.filter((a: Appointment) => a.date === dateStr);
        const isSelected = date.getDate() === currentDate.getDate();

        days.push({ date, dayNumber: d, dayName: date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3), hasAppointments: dayApps.length > 0, appointments: dayApps, isSelected });
    }

    const selectedDateApps = appointments.filter((a: Appointment) => a.date === formatDateStr(currentDate)).sort((a: Appointment, b: Appointment) => a.time.localeCompare(b.time));

    return (
        <div className="flex flex-col h-full">
            {renderMobileHeader()}
            <div className="bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border py-4 mb-4">
                <div className="flex overflow-x-auto gap-4 px-4 no-scrollbar snap-x items-center justify-between text-center">
                    {days.map((dayItem, index) => (
                        <div
                            key={index}
                            onClick={() => setCurrentDate(dayItem.date)}
                            className="flex flex-col items-center gap-1 cursor-pointer group min-w-[50px] snap-center"
                        >
                            <div className={`w-10 h-10 rounded-full flex flex-col items-center justify-center text-sm font-bold transition-all relative ${dayItem.isSelected
                                ? 'bg-brand-dark dark:bg-white text-white dark:text-brand-dark shadow-md'
                                : 'text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface'
                                }`}>
                                <span className="leading-none mt-0.5">{dayItem.dayNumber}</span>
                                {dayItem.hasAppointments && (
                                    <div className={`w-1 h-1 rounded-full mt-0.5 ${dayItem.isSelected ? 'bg-white/70 dark:bg-brand-dark/70' : 'bg-brand-green'}`}></div>
                                )}
                            </div>
                            <span className={`text-[10px] font-medium uppercase tracking-wide ${dayItem.isSelected ? 'text-brand-dark dark:text-dark-heading' : 'text-brand-inactive-text dark:text-dark-body'}`}>
                                {dayItem.dayName}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <AnimatePresence mode='wait'>
                <motion.div key={currentDate.toISOString()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto px-4 pb-20 space-y-3">
                    {selectedDateApps.length > 0 ? (
                        selectedDateApps.map((apt: Appointment) => {
                            const style = getAppointmentStyle(apt.status);
                            const borderColor = style.bar.replace('bg-', 'border-');

                            let timeLabel = `${apt.time}`;
                            if (apt.endDate && apt.date !== apt.endDate) {
                                const endD = new Date(apt.endDate);
                                timeLabel += ` - ${endD.getDate()}/${endD.getMonth() + 1}`;
                            } else {
                                const endTime = getEndTime(apt.time, apt.duration);
                                timeLabel += ` - ${endTime}`;
                            }

                            return (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    key={apt.id}
                                    className={`w-full rounded-xl p-3 border-l-4 border-y border-r ${style.container} ${borderColor} cursor-pointer shadow-sm relative overflow-hidden transition-all active:scale-[0.98]`}
                                    onClick={() => handleOpenView(apt)}
                                >
                                    <div className="flex gap-3 h-full">
                                        <div className="flex-1 min-w-0 flex flex-col">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`font-bold text-xs ${style.title} truncate`}>{timeLabel}</span>
                                                <div className={`w-2 h-2 rounded-full ${style.dot}`}></div>
                                            </div>
                                            <div className={`font-bold text-sm ${style.title} truncate leading-tight mb-1`}>{apt.customer}</div>
                                            <div className={`text-xs ${style.text} truncate opacity-90 mb-2`}>{apt.service}</div>
                                            <div className="flex items-center gap-2 pt-2 border-t border-black/5 dark:border-white/5 mt-auto">
                                                <span className={`text-[10px] font-bold ${style.text}`}>{apt.staff}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })
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

// ... DayView ...
export const DayView = ({ appointments, currentDate, staffMembers, onOpenView, handleGridMouseMove, handleGridMouseLeave, handleGridClick, hoverColIndex, hoverTime, activePopover, setActivePopover, handleOpenCreate, setIsUnavailableSheetOpen }: any) => {
    const startHour = 8;
    const endHour = 19;
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

    // Split appointments into all-day/multi-day and regular hourly
    const currentDateStr = formatDateStr(currentDate);

    // Find multi-day events that cover this day
    const allDayEvents = appointments.filter((a: Appointment) => {
        if (!isMultiDay(a)) return false;

        const start = a.date;
        const end = a.endDate || a.date;
        return currentDateStr >= start && currentDateStr <= end;
    });

    const hourlyEvents = appointments.filter((a: Appointment) => a.date === currentDateStr && !isMultiDay(a));

    return (
        <div className="flex flex-col h-full overflow-hidden relative">

            {/* Top Section for Multi-Day Events */}
            {allDayEvents.length > 0 && (
                <div className="flex border-b border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-zinc-900/20">
                    <div className="w-16 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-2 text-[10px] font-bold text-brand-inactive-text text-center flex items-center justify-center uppercase tracking-wide">
                        Dia Todo
                    </div>
                    <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[140px]">
                        {allDayEvents.map((apt: Appointment) => (
                            <LongEventBar key={apt.id} appointment={apt} onClick={() => onOpenView(apt)} />
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative">
                <div className="w-16 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                    <div className="h-16 border-b border-brand-border dark:border-dark-border"></div>
                    <div className="overflow-hidden">
                        {hours.map(h => <div key={h} className="h-20 border-b border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body text-center pt-2 relative select-none">{String(h).padStart(2, '0')}:00</div>)}
                    </div>
                </div>

                <div className="flex-1 flex overflow-x-auto no-scrollbar relative overflow-y-scroll custom-scrollbar">
                    {staffMembers.map((staff: StaffMember, colIndex: number) => {
                        const rawAppointments = hourlyEvents.filter((a: Appointment) => a.staffId === staff.id);
                        const staffAppointments = arrangeAppointments(rawAppointments);

                        return (
                            <div key={staff.id} className="flex-1 min-w-[200px] border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface relative group resource-column">
                                <div className="h-16 border-b border-brand-border dark:border-dark-border flex flex-col items-center justify-center sticky top-0 bg-white dark:bg-dark-surface z-20 px-2 pointer-events-none">
                                    <div className="flex items-center gap-2"><img src={staff.avatar} className="w-8 h-8 rounded-full object-cover border border-brand-border dark:border-dark-border" /><div className="flex flex-col"><span className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">{staff.name}</span><span className="text-[10px] text-brand-inactive-text dark:text-dark-body truncate max-w-[100px]">{staff.role}</span></div></div>
                                </div>
                                <div className="relative" onMouseMove={(e) => handleGridMouseMove(e, colIndex)} onMouseLeave={handleGridMouseLeave} onClick={(e) => handleGridClick(e, staff.id)}>
                                    {hours.map(h => (
                                        <div key={h} className="h-20 border-b border-brand-border dark:border-dark-border border-dashed dark:border-zinc-800 pointer-events-none relative">
                                            <div className="absolute top-[25%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                            <div className="absolute top-[50%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                            <div className="absolute top-[75%] left-0 w-full border-t border-brand-border/30 dark:border-dark-border/20 border-dashed"></div>
                                        </div>
                                    ))}
                                    {hoverColIndex === colIndex && hoverTime && <div className="absolute w-full h-[1px] bg-blue-500 z-30 pointer-events-none flex items-center" style={{ top: hoverTime.top }}><div className="absolute left-0 -top-3 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">{String(hoverTime.hour).padStart(2, '0')}:{String(hoverTime.minutes).padStart(2, '0')}</div></div>}
                                    <AnimatePresence>
                                        {staffAppointments.map(apt => {
                                            const top = ((apt.start / 60) - startHour) * 80;
                                            const effectiveDuration = Math.min(apt.duration, (endHour - startHour + 1) * 60);
                                            const height = (effectiveDuration / 60) * 80;
                                            const style = getAppointmentStyle(apt.status);
                                            const endTime = getEndTime(apt.time, apt.duration);

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
                                                    <div className="flex h-full gap-2"><div className={`w-1 rounded-full flex-shrink-0 ${style.bar}`}></div>
                                                        <div className="flex-1 min-w-0 flex flex-col">
                                                            <div className="flex items-center justify-between mb-0.5">
                                                                <span className={`font-bold text-[10px] ${style.title} truncate`}>{apt.time} - {endTime}</span>
                                                                {height > 60 && <User size={12} className={style.text} />}
                                                            </div>
                                                            <div className={`font-bold text-[11px] ${style.title} truncate leading-tight mb-0.5`}>{apt.customer}</div>
                                                            <div className={`text-[9px] ${style.text} truncate opacity-90 mb-1`}>{apt.service}</div>

                                                            {height > 50 && (
                                                                <div className="border-t border-black/5 dark:border-white/5 pt-1 mt-auto">
                                                                    <span className={`text-[9px] font-bold ${style.text} truncate block`}>{apt.staff}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                    <AnimatePresence>{activePopover && activePopover.mode === 'resource' && activePopover.staffId === staff.id && (
                                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }} style={{ position: 'absolute', top: activePopover.top, ...(activePopover.align === 'right' ? { left: '100%', marginLeft: '10px' } : { right: '100%', marginRight: '10px' }), zIndex: 50 }}>
                                            <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} setIsUnavailableSheetOpen={setIsUnavailableSheetOpen} setActivePopover={setActivePopover} />
                                        </motion.div>
                                    )}</AnimatePresence>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    )
};

// ... TimelineView (Week) ...
export const TimelineView = ({ appointments, currentDate, staffMembers, onOpenView, handleTimelineMouseMove, handleGridMouseLeave, handleGridClick, hoverStaffId, hoverTime, activePopover, setActivePopover, handleOpenCreate, setIsUnavailableSheetOpen, handleOpenMore }: any) => {

    const days = getWeekDays(currentDate);
    const staffCount = staffMembers.length;
    const maxItems = staffCount <= 4 ? 4 : 3;

    // Filter Long events for the Week View Header
    const weekStartStr = formatDateStr(days[0]);
    const weekEndStr = formatDateStr(days[6]);

    const longWeekEvents = appointments.filter((a: Appointment) => {
        if (!isMultiDay(a)) return false;
        const start = a.date;
        const end = a.endDate || a.date;
        // Check overlapping with current week
        return (start <= weekEndStr) && (end >= weekStartStr);
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
                        const isToday = day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth();
                        return (
                            <div key={idx} className="flex-1 border-r border-brand-border dark:border-dark-border flex flex-col items-center justify-center bg-white dark:bg-dark-surface relative min-w-[140px]">
                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isToday ? 'text-brand-green' : 'text-brand-inactive-text dark:text-dark-body'}`}>
                                    {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                                </span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isToday ? 'bg-brand-dark text-white' : 'text-brand-dark dark:text-dark-heading'}`}>
                                    {day.getDate()}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Top Strip for Long Events */}
            {longWeekEvents.length > 0 && (
                <div className="flex border-b border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-zinc-900/20 flex-shrink-0">
                    <div className="w-48 flex-shrink-0 border-r border-brand-border dark:border-dark-border flex items-center justify-center p-2">
                        <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wide">Longa Duração</span>
                    </div>
                    <div className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[80px]">
                        {longWeekEvents.map((apt: Appointment) => (
                            <LongEventBar key={apt.id} appointment={apt} onClick={() => onOpenView(apt)} />
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <div className="w-48 flex-shrink-0 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-20 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] overflow-y-auto no-scrollbar">
                    {staffMembers.map((staff: StaffMember) => (
                        <div key={staff.id} className="h-40 border-b border-brand-border dark:border-dark-border flex items-center gap-3 px-4">
                            <img src={staff.avatar} className="w-10 h-10 rounded-full object-cover border border-brand-border dark:border-dark-border" />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">{staff.name}</span>
                                <span className="text-[10px] text-brand-inactive-text dark:text-dark-body truncate max-w-[100px]">{staff.role}</span>
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

                                    const cellApps = appointments.filter((a: Appointment) =>
                                        a.date === dateStr && a.staffId === staff.id && !isMultiDay(a)
                                    ).sort((a: Appointment, b: Appointment) => a.time.localeCompare(b.time));

                                    const displayApps = cellApps.slice(0, maxItems);
                                    const remainingCount = cellApps.length - maxItems;

                                    return (
                                        <div
                                            key={dIdx}
                                            className="flex-1 border-r border-brand-border dark:border-dark-border relative min-w-[140px] p-2 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX;
                                                const y = e.clientY;
                                                const align = x > window.innerWidth / 2 ? 'left' : 'right';

                                                setActivePopover({
                                                    staffId: staff.id,
                                                    date: day,
                                                    time: '09:00',
                                                    top: y,
                                                    left: x,
                                                    align,
                                                    mode: 'absolute'
                                                });
                                            }}
                                        >
                                            <div className="flex flex-col gap-1.5 h-full overflow-hidden">
                                                {displayApps.map((apt: Appointment) => {
                                                    const style = getAppointmentStyle(apt.status);
                                                    const endTime = getEndTime(apt.time, apt.duration);

                                                    return (
                                                        <motion.div
                                                            key={apt.id}
                                                            initial={{ opacity: 0, scale: 0.9 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            className={`text-[10px] px-1.5 py-1 rounded truncate border cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1.5 font-bold ${style.container} ${style.title}`}
                                                            onClick={(e) => { e.stopPropagation(); onOpenView(apt); }}
                                                        >
                                                            <div className={`w-0.5 h-2 rounded-full ${style.bar}`}></div>
                                                            {apt.time}-{endTime} {apt.customer}
                                                        </motion.div>
                                                    )
                                                })}
                                                {remainingCount > 0 && (
                                                    <div
                                                        className="text-[10px] text-brand-inactive-text font-medium pl-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading"
                                                        onClick={(e) => { e.stopPropagation(); if (handleOpenMore) handleOpenMore(dateStr, cellApps); }}
                                                    >
                                                        + {remainingCount} more
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
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
                    <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} setIsUnavailableSheetOpen={setIsUnavailableSheetOpen} setActivePopover={setActivePopover} />
                </motion.div>
            )}</AnimatePresence>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    )
};

// ... MonthView ...
export const MonthView = ({ appointments, currentDate, handleGenericCellClick, activePopover, handleOpenCreate, setIsUnavailableSheetOpen, setActivePopover, handleOpenView, handleOpenMore }: any) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const days = [];

    const sortedApps = [...appointments].sort((a, b) => b.duration - a.duration);

    for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="min-h-[120px] bg-gray-50/50 dark:bg-zinc-900/30 border-b border-r border-brand-border dark:border-dark-border"></div>);

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dateObj = new Date(year, month, d);

        const cellApps = sortedApps.filter((a: Appointment) => {
            if (isMultiDay(a)) {
                const end = a.endDate || a.date;
                return dateStr >= a.date && dateStr <= end;
            }
            return a.date === dateStr;
        });

        days.push(
            <div key={d} className="min-h-[120px] p-2 border-b border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface relative group hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer" onClick={(e) => handleGenericCellClick(e, dateObj)}>
                <span className={`text-sm font-bold ${cellApps.length > 0 ? 'text-brand-dark dark:text-dark-heading' : 'text-brand-inactive-text'}`}>{d}</span>
                <div className="mt-2 flex flex-col gap-1">
                    <AnimatePresence>
                        {cellApps.slice(0, 4).map((apt: Appointment, i: number) => {

                            const isLong = isMultiDay(apt);
                            const isStart = apt.date === dateStr;
                            const isEnd = (apt.endDate || apt.date) === dateStr;

                            if (isLong) {
                                const style = getAppointmentStyle(apt.status);
                                // Use same color scheme as normal cards but as a strip
                                const borderColorClass = style.bar.replace('bg-', 'border-');

                                return (
                                    <motion.div
                                        key={apt.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        onClick={(e) => { e.stopPropagation(); handleOpenView(apt); }}
                                        className={`
                                            h-5 text-[10px] flex items-center font-bold px-1 cursor-pointer transition-opacity hover:opacity-80 relative z-10
                                            border-l-4 border-y border-r ${style.container} ${borderColorClass}
                                            ${isStart ? 'rounded-l-md ml-0.5' : '-ml-[9px] border-l-0'} 
                                            ${isEnd ? 'rounded-r-md mr-0.5 border-r' : '-mr-[9px] border-r-0'}
                                        `}
                                    >
                                        {(isStart || dateObj.getDay() === 0) && (
                                            <span className={`truncate w-full pl-1 ${style.title}`}>{apt.customer}</span>
                                        )}
                                    </motion.div>
                                )
                            } else {
                                const style = getAppointmentStyle(apt.status);
                                return (
                                    <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`text-[10px] px-1.5 py-0.5 rounded truncate border cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1.5 font-bold ${style.container} ${style.title}`} onClick={(e) => { e.stopPropagation(); handleOpenView(apt); }}>
                                        <div className={`w-0.5 h-2 rounded-full ${style.bar}`}></div>
                                        {apt.time} {apt.customer}
                                    </motion.div>
                                )
                            }
                        })}
                    </AnimatePresence>
                    {cellApps.length > 4 && <div className="text-[10px] text-brand-inactive-text font-medium pl-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading" onClick={(e) => { e.stopPropagation(); handleOpenMore(dateStr, cellApps); }}>+ {cellApps.length - 4} more</div>}
                </div>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-7 border-l border-t border-brand-border dark:border-dark-border relative">
            {days}
            <AnimatePresence>
                {activePopover && activePopover.mode === 'absolute' && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }} style={{ position: 'fixed', top: activePopover.top, left: activePopover.align === 'left' ? activePopover.left : (activePopover.left ? activePopover.left - 256 : 0), zIndex: 60 }}>
                        <PopoverContent activePopover={activePopover} handleOpenCreate={handleOpenCreate} setIsUnavailableSheetOpen={setIsUnavailableSheetOpen} setActivePopover={setActivePopover} />
                    </motion.div>
                )}
            </AnimatePresence>
            {activePopover && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActivePopover(null)}></div>}
        </div>
    )
};

export const ListView = ({ appointments, onOpenView, currentPage, setCurrentPage, itemsPerPage }: any) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const visibleItems = appointments.slice(startIndex, startIndex + itemsPerPage);

    // UPDATED BADGE LOGIC
    const getStatusBadge = (status: string) => {
        const s = status.toLowerCase();

        if (s === 'ausência' || s === 'absent' || s === 'ausencia') return <Badge variant="red">Ausência</Badge>;
        if (s === 'canceled' || s === 'cancelado' || s === 'cancelar') return <Badge variant="red">Cancelado</Badge>;

        // Paid -> Green
        if (s === 'paid' || s === 'pago') return <Badge variant="green">Pago</Badge>;

        // Confirmed -> Green
        if (s === 'confirmed' || s === 'confirmado') return <Badge variant="green">Confirmado</Badge>;

        if (s === 'pending' || s === 'aguardando') return <Badge variant="orange">Aguardando</Badge>;
        if (s === 'reservado' || s === 'reserved') return <Badge variant="blue">Reservado</Badge>;

        if (s === 'iniciado' || s === 'in progress') return <Badge variant="blue">Iniciado</Badge>;

        // Finished -> Gray
        if (s === 'finalizado' || s === 'finished' || s === 'completed' || s === 'concluído') return <Badge variant="gray">Concluído</Badge>;

        return <Badge variant="gray">{status}</Badge>;
    };

    const getPaymentBadge = (status: string) => {
        const s = status.toLowerCase();
        // Payment badge logic if needed separate from status, currently integrated above for 'Paid'
        if (s === 'partially paid' || s === 'pago parcialmente') return <Badge variant="orange">Parcial</Badge>;
        return null;
    }

    return (
        <div className="overflow-x-auto pb-4 custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                <thead>
                    <tr className="bg-[#f3f5f9] dark:bg-dark-surface transition-colors">
                        <th className="py-2 px-4 w-12 pl-6 rounded-l-xl"><FormCheckbox checked={false} onChange={() => { }} name="select-all" /></th>
                        <SortableHeader label="Cliente" />
                        <SortableHeader label="Serviço" />
                        <SortableHeader label="Data & Hora" />
                        <SortableHeader label="Profissional" />
                        <SortableHeader label="Status" />
                        <SortableHeader label="Valor" right />
                        <th className="py-2 px-4 w-16 rounded-r-xl relative text-center text-[13px] font-medium text-brand-inactive-text dark:text-dark-body"><div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <AnimatePresence mode='popLayout'>
                        {visibleItems.length > 0 ? (
                            visibleItems.map((apt: Appointment) => {
                                // Format Date Range if needed
                                let dateDisplay = `${apt.date}`;
                                let timeDisplay = `${apt.time}`;

                                if (isMultiDay(apt)) {
                                    const endD = apt.endDate || apt.date;
                                    dateDisplay += ` - ${endD}`;
                                    timeDisplay = formatDuration(apt.duration);
                                } else {
                                    timeDisplay += ` - ${getEndTime(apt.time, apt.duration)}`;
                                }

                                return (
                                    <motion.tr key={apt.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="group hover:bg-gray-50 dark:hover:bg-dark-border/50 transition-colors cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0" onClick={() => onOpenView(apt)}>
                                        <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border"><div onClick={(e) => e.stopPropagation()}><FormCheckbox checked={false} onChange={() => { }} name={`select-${apt.id}`} /></div></td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#f3f5f9] dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border">{apt.customer.charAt(0)}</div><span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{apt.customer}</span></div></td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border"><span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{apt.service}</span><div className="text-[11px] text-brand-inactive-text">{formatDuration(apt.duration)}</div></td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border"><div className="flex flex-col"><div className="flex items-center gap-1.5 text-[13px] font-medium text-brand-dark dark:text-dark-heading"><CalendarIcon size={14} className="text-brand-inactive-text" /> {dateDisplay}</div><div className="flex items-center gap-1.5 text-[11px] text-brand-inactive-text mt-0.5 ml-0.5"><Clock size={12} /> {timeDisplay}</div></div></td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border"><span className="text-[10px] font-bold text-brand-inactive-text">{apt.staff.charAt(0)}</span></div><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{apt.staff}</span></div></td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border"><div className="flex gap-2">{getStatusBadge(apt.status)}{getPaymentBadge(apt.status)}</div></td>
                                        <td className="p-4 text-right border-b border-brand-border dark:border-dark-border"><span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">R$ {apt.price.toFixed(2)}</span></td>
                                        <td className="p-4 text-center border-b border-brand-border dark:border-dark-border"><div className="flex justify-center"><button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-dark-border text-brand-inactive-text"><MoreHorizontal size={16} /></button></div></td>
                                    </motion.tr>
                                )
                            })
                        ) : (<tr><td colSpan={8} className="p-8 text-center text-brand-inactive-text">Nenhum agendamento encontrado para este período.</td></tr>)}
                    </AnimatePresence>
                </tbody>
            </table>
            <div className="flex justify-center mt-6">
                <div className="flex items-center gap-2">
                    <Button className="w-8 h-8 flex items-center justify-center" onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></Button>
                    {[1, 2].map(p => (<button key={p} onClick={() => setCurrentPage(p)} className={`w-8 h-8 flex items-center justify-center ${currentPage === p ? 'bg-[#f3f5f9] dark:bg-gray-800 text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border shadow-sm' : 'text-brand-inactive-text dark:text-dark-body hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{p}</button>))}
                    <Button className="w-8 h-8 flex items-center justify-center" onClick={() => setCurrentPage((p: number) => Math.min(2, p + 1))} disabled={currentPage === 2}><ChevronRight size={18} /></Button>
                </div>
            </div>
        </div>
    )
}
