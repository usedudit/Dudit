"use client";

import React from "react";
import { motion } from "framer-motion";
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable";
import { UserProfileImage } from "@/lib/utils/UserProfileImage";
import { CalendarIcon, ClockIcon } from "@/lib/icons";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { Appointment } from "./types";

interface ColumnDef {
    id: string;
    align?: "left" | "center" | "right";
}

interface AppointmentListRowProps {
    appointment: Appointment;
    columns: ColumnDef[];
    selected: boolean;
    onSelect: (id: string) => void;
    onView: (appointment: Appointment) => void;
}

export const AppointmentListRow = React.memo(
    ({
        appointment,
        columns,
        selected,
        onSelect,
        onView,
    }: AppointmentListRowProps) => {
        const getStatusVariant = (status: string) => {
            const normalized = status.toLowerCase();
            if (normalized.includes("confirm") || normalized === "pago") return "green";
            if (normalized.includes("cancel") || normalized.includes("aus") || normalized.includes("indis")) return "red";
            if (normalized.includes("aguard") || normalized.includes("reserv")) return "orange";
            return "gray";
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
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                                    {appointment.customer}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {appointment.service}
                                </span>
                            </div>
                        </div>
                    );

                case "datetime":
                    return (
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-1.5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                <CalendarIcon size={14} />
                                <span>{formatDate(appointment.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                <ClockIcon size={12} />
                                <span>{appointment.time}</span>
                            </div>
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
                    return (
                        <Badge variant={getStatusVariant(appointment.status)}>
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
