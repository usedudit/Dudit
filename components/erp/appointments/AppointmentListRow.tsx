"use client";

import React from 'react';
import { Appointment } from './types';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { Badge, BadgeVariant, Checkbox, Dropdown, DropdownItem } from '@/components/reusable';
import { MoreHorizontalIcon, ClockIcon, CalendarIcon } from '@/lib/icons';
import { formatCurrency } from '@/lib/utils/formatters';
import { formatDate } from '@/lib/utils/formatters';

interface AppointmentListRowProps {
    appointment: Appointment;
    onView: (appointment: Appointment) => void;
    selected?: boolean;
    onSelect?: (selected: boolean) => void;
}

export const AppointmentListRow: React.FC<AppointmentListRowProps> = ({
    appointment,
    onView,
    selected,
    onSelect
}) => {
    const getStatusVariant = (status: string): BadgeVariant => {
        const s = status.toLowerCase();
        if (s === 'confirmado' || s === 'pago') return 'green';
        if (s === 'cancelado' || s === 'ausência') return 'red';
        if (s === 'aguardando' || s === 'reservado') return 'orange';
        return 'gray';
    };

    return (
        <div
            onClick={() => onView(appointment)}
            className={`flex flex-col md:flex-row md:items-center p-4 gap-4 border-b border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-surface/50 transition-colors cursor-pointer ${selected ? 'bg-brand-dark/5 dark:bg-brand-dark/10' : ''}`}
        >
            <div className="flex items-center gap-4 flex-1">
                {onSelect && (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected || false} onChange={onSelect} />
                    </div>
                )}

                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <UserProfileImage
                        fullName={appointment.customer}
                        className="w-10 h-10 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-brand-dark dark:text-dark-heading truncate">
                            {appointment.customer}
                        </span>
                        <span className="text-xs text-brand-inactive-text truncate">
                            {appointment.service}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-8 shrink-0">
                <div className="flex flex-col md:w-32">
                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-wider mb-0.5">Data e Hora</span>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-brand-dark dark:text-dark-heading">
                        <CalendarIcon size={14} className="text-brand-inactive-text" />
                        {formatDate(appointment.date)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text mt-0.5">
                        <ClockIcon size={12} />
                        {appointment.time}
                    </div>
                </div>

                <div className="flex flex-col md:w-40">
                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-wider mb-0.5">Profissional</span>
                    <div className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-dark-heading">
                        <UserProfileImage fullName={appointment.staff} className="w-5 h-5" />
                        <span className="truncate">{appointment.staff}</span>
                    </div>
                </div>

                <div className="flex flex-col md:w-24">
                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-wider mb-0.5">Valor</span>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(appointment.price)}
                    </span>
                </div>

                <div className="flex items-center justify-between md:justify-end md:w-28">
                    <Badge variant={getStatusVariant(appointment.status)}>
                        {appointment.status}
                    </Badge>

                    <div className="md:ml-4" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                            align="right"
                            showChevron={false}
                            trigger={
                                <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                                    <MoreHorizontalIcon size={18} className="text-brand-inactive-text" />
                                </button>
                            }
                        >
                            <DropdownItem onClick={() => onView(appointment)}>Ver detalhes</DropdownItem>
                            <DropdownItem>Editar</DropdownItem>
                            <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                            <DropdownItem className="text-red-500">Cancelar agendamento</DropdownItem>
                        </Dropdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
