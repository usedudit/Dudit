
import React from 'react';
import { motion } from 'framer-motion';
import { Badge, Tooltip } from '@/components/reusable';
import { MoneyIcon, BlockedIcon, EyeOffIcon, PartiallyPaidIcon, LikeIcon, ClockIcon, PlayIcon } from '@/lib/icons';
import { AlertTriangle } from 'lucide-react';
import { Appointment } from './types';
import { getAppointmentStyle, getEndTime, checkAppointmentCollision, isMultiDay, formatDuration } from './utils';

interface AppointmentListCardProps {
    appointment: Appointment;
    onClick: (apt: Appointment) => void;
    openingHours?: any;
    appointments?: Appointment[];
}

export const AppointmentListCard: React.FC<AppointmentListCardProps> = ({ appointment, onClick, openingHours, appointments }) => {
    const style = getAppointmentStyle(appointment.status);
    const endTime = getEndTime(appointment.time, appointment.duration);

    // Normalize status for check
    const s = (appointment.status || '').toLowerCase();
    const ps = (appointment.paymentStatus || '').toLowerCase();

    // Determine Status Icon
    let StatusIcon = ClockIcon;
    if (s === 'confirmed' || s === 'confirmado' || s === 'completed' || s === 'concluído' || s === 'concluido' || s === 'finished') StatusIcon = LikeIcon;
    else if (s === 'iniciado' || s === 'in progress') StatusIcon = PlayIcon;
    else if (s === 'ausência' || s === 'absent' || s === 'ausencia') StatusIcon = EyeOffIcon;
    else if (s === 'canceled' || s === 'cancelado') StatusIcon = BlockedIcon;

    // Determine Payment Icon
    let PaymentIcon = null;
    if (ps === 'paid' || ps === 'pago') PaymentIcon = MoneyIcon;
    else if (ps === 'partially paid' || ps === 'parcialmente pago') PaymentIcon = PartiallyPaidIcon;

    const checkOutsideOperatingHours = (aptDateStr: string, aptTimeStr: string, durationMinutes: number) => {
        if (!openingHours) return false;
        const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
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

    const isOutsideHours = checkOutsideOperatingHours(appointment.date, appointment.time, appointment.duration);
    const hasCollision = appointments ? checkAppointmentCollision(appointment, appointments) : false;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`
                w-full rounded-xl p-2.5 border cursor-pointer relative overflow-hidden transition-all active:scale-[0.98]
                ${style.container}
            `}
            onClick={() => onClick(appointment)}
        >
            <div className="flex h-full gap-2">
                <div className={`w-1 rounded-full flex-shrink-0 ${style.bar}`}></div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-center justify-between mb-0.5">
                        {isMultiDay(appointment) ? (
                            <span className={`font-bold text-[10px] ${style.title} truncate flex items-center gap-1`}>
                                <span>{appointment.date} {appointment.time}</span>
                                <span className="opacity-60">→</span>
                                <span>{appointment.endDate || appointment.date} {appointment.endTime || appointment.time}</span>
                            </span>
                        ) : (
                            <span className={`font-bold text-[10px] ${style.title} truncate`}>{appointment.time} - {endTime}</span>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {hasCollision && (
                                <Tooltip text="Conflito de horário detectado">
                                    <Badge
                                        variant="red"
                                        icon={<AlertTriangle size={12} />}
                                        className="whitespace-nowrap scale-75 shrink-0"
                                    />
                                </Tooltip>
                            )}
                            {isOutsideHours && (
                                <Tooltip text="Agendado fora do horário de funcionamento">
                                    <Badge
                                        variant="orange"
                                        icon={<AlertTriangle size={12} />}
                                        className="whitespace-nowrap scale-75 shrink-0"
                                    />
                                </Tooltip>
                            )}
                            {PaymentIcon && <PaymentIcon size={14} className={`${style.text} opacity-70`} />}
                            <StatusIcon size={14} className={`${style.text} opacity-70`} />
                        </div>
                    </div>
                    <div className={`font-bold text-[11px] ${style.title} truncate leading-tight mb-0.5`}>{appointment.customer}</div>
                    <div className={`text-[10px] ${style.text} truncate opacity-90 mb-2`}>{appointment.service}</div>

                    <div className="border-t border-black/5 dark:border-white/5 pt-1 mt-auto flex items-center justify-between">
                        <span className={`text-[9px] font-bold ${style.text} truncate block`}>{appointment.staff}</span>
                        {isMultiDay(appointment) && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.bar} text-white`}>
                                {formatDuration(appointment.duration)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
