"use client";

import React from "react";
import { motion } from "framer-motion";
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable";
import { UserProfileImage } from "@/lib/utils/UserProfileImage";
import { 
    CalendarIcon, 
    ClockIcon, 
    LikeIcon, 
    MoneyIcon, 
    PartiallyPaidIcon, 
    PlayIcon, 
    BlockedIcon, 
    EyeOffIcon 
} from "@/lib/icons";
import { AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { Appointment } from "./types";
import { getEndTime, checkAppointmentCollision } from "./utils";

interface ColumnDef {
    id: string;
    align?: "left" | "center" | "right";
}

interface AppointmentListRowProps {
    appointment: Appointment;
    appointments: Appointment[];
    openingHours?: any;
    columns: ColumnDef[];
    selected: boolean;
    onSelect: (id: string) => void;
    onView: (appointment: Appointment) => void;
}

const checkOutsideOperatingHours = (aptDateStr: string, aptTimeStr: string, durationMinutes: number, openingHours: any) => {
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
    if (!dConfig || !dConfig.enabled) return true;

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

export const AppointmentListRow = React.memo(
    ({
        appointment,
        appointments,
        openingHours,
        columns,
        selected,
        onSelect,
        onView,
    }: AppointmentListRowProps) => {
        const getStatusBadgeConfig = (status: string) => {
            const s = status.toLowerCase();
            if (s === 'confirmado' || s === 'confirmed') {
                return { variant: "green" as const, icon: <LikeIcon /> };
            }
            if (s === 'pago' || s === 'completed' || s === 'concluído' || s === 'concluido' || s === 'finished') {
                return { variant: "green" as const, icon: <MoneyIcon /> };
            }
            if (s === 'pago parcialmente' || s === 'parcialmente pago' || s === 'partially paid') {
                return { variant: "orange" as const, icon: <PartiallyPaidIcon /> };
            }
            if (s === 'pendente' || s === 'pending' || s === 'reservado' || s === 'aguardando') {
                return { variant: "orange" as const, icon: <ClockIcon /> };
            }
            if (s === 'iniciado' || s === 'in progress') {
                return { variant: "cyan" as const, icon: <PlayIcon /> };
            }
            if (s === 'cancelado' || s === 'canceled') {
                return { variant: "red" as const, icon: <BlockedIcon /> };
            }
            if (s === 'ausência' || s === 'ausencia' || s === 'absent' || s === 'indisponível' || s === 'indisponivel' || s === 'unavailable') {
                return { variant: "gray" as const, icon: <EyeOffIcon /> };
            }
            return { variant: "gray" as const, icon: <ClockIcon /> };
        };

        const getJustifyClass = (align?: string) => {
            if (align === "center") return "justify-center";
            if (align === "right") return "justify-end";
            return "justify-start";
        };

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center";
            if (align === "right") return "text-right";
            return "text-left";
        };

        const isOutsideHours = checkOutsideOperatingHours(appointment.date, appointment.time, appointment.duration, openingHours);
        const hasCollision = appointments ? checkAppointmentCollision(appointment, appointments) : false;

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "customer":
                    return (
                        <div className="flex items-center gap-3 text-left">
                            <UserProfileImage
                                fullName={appointment.customer}
                                className="w-10 h-10 text-[14px]"
                            />
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[150px] xl:max-w-[250px]">
                                        {appointment.customer}
                                    </span>
                                    {hasCollision && (
                                        <span title="Conflito de horário detectado">
                                            <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                        </span>
                                    )}
                                    {isOutsideHours && (
                                        <span title="Fora do horário de expediente">
                                            <AlertTriangle size={14} className="text-orange-500 shrink-0" />
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {appointment.service}
                                </span>
                            </div>
                        </div>
                    );

                case "datetime":
                    const endTimeStr = getEndTime(appointment.time, appointment.duration);
                    return (
                        <div className="flex flex-col text-left min-w-0">
                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                {formatDate(appointment.date)}
                            </span>
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                {appointment.time} - {endTimeStr}
                            </span>
                        </div>
                    );

                case "staff":
                    return (
                        <div className="flex items-center gap-2 min-w-0">
                            <UserProfileImage fullName={appointment.staff} className="w-5 h-5 shrink-0" />
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                {appointment.staff}
                            </span>
                        </div>
                    );

                case "price":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            {formatCurrency(appointment.price)}
                        </span>
                    );

                case "status":
                    const config = getStatusBadgeConfig(appointment.status);
                    return (
                        <Badge variant={config.variant} icon={config.icon}>
                            {appointment.status}
                        </Badge>
                    );

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown onView={() => onView(appointment)} />
                        </div>
                    );

                default:
                    return null;
            }
        };

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onView(appointment)}
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(appointment.id)} />
                </td>

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        );
    },
    (prev, next) =>
        prev.appointment === next.appointment &&
        prev.selected === next.selected &&
        prev.columns === next.columns
);

AppointmentListRow.displayName = "AppointmentListRow";
