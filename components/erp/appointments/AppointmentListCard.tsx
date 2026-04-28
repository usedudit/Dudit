
import React from 'react';
import { motion } from 'framer-motion';
import { User, Banknote, Ban, MessageSquare, UserX, Wallet, Check, Clock, Play } from 'lucide-react';
import { Appointment } from './types';
import { getAppointmentStyle, getEndTime } from './utils';

interface AppointmentListCardProps {
    appointment: Appointment;
    onClick: (apt: Appointment) => void;
}

export const AppointmentListCard: React.FC<AppointmentListCardProps> = ({ appointment, onClick }) => {
    const style = getAppointmentStyle(appointment.status);
    const endTime = getEndTime(appointment.time, appointment.duration);
    
    // Normalize status for check
    const s = appointment.status.toLowerCase();

    // Determine Top Right Icon based on status
    let StatusIcon = User;
    
    if (s === 'paid' || s === 'pago') {
        StatusIcon = Banknote;
    } else if (s === 'partially paid' || s === 'pago parcialmente') {
        StatusIcon = Wallet;
    } else if (s === 'ausência' || s === 'absent' || s === 'ausencia') {
        StatusIcon = UserX;
    } else if (s === 'confirmed' || s === 'confirmado') {
        StatusIcon = Check;
    } else if (s === 'iniciado' || s === 'in progress') {
        StatusIcon = Play;
    } else if (s === 'pending' || s === 'aguardando' || s === 'reservado') {
        StatusIcon = Clock;
    } else if (s === 'canceled' || s === 'cancelado') {
        StatusIcon = Ban;
    }

    // Extract border color logic
    const borderColorClass = style.bar.replace('bg-', 'border-');

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`
                w-full rounded-xl p-3 border-l-4 border-y border-r cursor-pointer shadow-sm relative overflow-hidden transition-all active:scale-[0.98]
                ${style.container} ${borderColorClass}
            `}
            onClick={() => onClick(appointment)}
        >
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold text-xs truncate ${style.title}`}>{appointment.time} - {endTime}</span>
                    <div className="flex items-center gap-1">
                        {appointment.notes && <MessageSquare size={12} className="text-brand-inactive-text mr-1" />}
                        <StatusIcon size={14} className={`${style.text} opacity-70`} />
                    </div>
                </div>
                <div className={`font-bold text-sm truncate leading-tight mb-0.5 ${style.title}`}>{appointment.customer}</div>
                <div className={`text-xs truncate mb-2 ${style.text} opacity-90`}>{appointment.service}</div>
                
                <div className="border-t border-black/5 dark:border-white/5 pt-2 mt-auto">
                    <span className={`text-[11px] font-medium truncate ${style.text}`}>{appointment.staff}</span>
                </div>
            </div>
        </motion.div>
    );
};
