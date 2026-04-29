"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/reusable";
import FilterChip from "@/components/reusable/FilterChip";
import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    FilterIcon,
    GridIcon,
    ListIcon,
    ReloadIcon,
    Users,
} from "@/lib/icons";

interface AppointmentsFilters {
    teamIds: string[];
}

interface TeamOption {
    id: string;
    name: string;
}

interface AppointmentsPageControlsProps {
    currentLabel: string;
    onToday: () => void;
    onPrev: () => void;
    onNext: () => void;
    onOpenFilter: () => void;
    filters: AppointmentsFilters;
    setFilters: React.Dispatch<React.SetStateAction<AppointmentsFilters>>;
    teamOptions: TeamOption[];
    hasActiveFilters: boolean;
    viewMode: "calendar" | "list";
    onViewModeChange: (mode: "calendar" | "list") => void;
    calendarView: "day" | "week" | "month";
    onCalendarViewChange: (view: "day" | "week" | "month") => void;
}

const AppointmentsPageControls: React.FC<AppointmentsPageControlsProps> = ({
    currentLabel,
    onToday,
    onPrev,
    onNext,
    onOpenFilter,
    filters,
    setFilters,
    teamOptions,
    hasActiveFilters,
    viewMode,
    onViewModeChange,
    calendarView,
    onCalendarViewChange,
}) => {
    const filtersContainerRef = useRef<HTMLDivElement>(null);
    const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false });

    const checkFilterScroll = useCallback(() => {
        if (!filtersContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = filtersContainerRef.current;
        setFilterScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        });
    }, []);

    useEffect(() => {
        checkFilterScroll();
        window.addEventListener("resize", checkFilterScroll);
        return () => window.removeEventListener("resize", checkFilterScroll);
    }, [checkFilterScroll, filters]);

    const selectedTeamNames = filters.teamIds
        .map((id) => teamOptions.find((team) => team.id === id)?.name)
        .filter(Boolean) as string[];

    const teamBadge =
        selectedTeamNames.length > 0 ? (
            <FilterChip
                label="Equipe"
                icon={<Users size={12} />}
                value={
                    selectedTeamNames.length <= 3
                        ? selectedTeamNames.join(", ")
                        : `${selectedTeamNames.slice(0, 3).join(", ")}...`
                }
                tooltip={`Equipe: ${selectedTeamNames.join(", ")}`}
                onRemove={() => setFilters((prev) => ({ ...prev, teamIds: [] }))}
            />
        ) : null;

    return (
        <>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Button variant="outline" className="w-[42px] h-[42px] p-0 md:hidden" onClick={onToday}>
                        <ReloadIcon size={18} />
                    </Button>

                    <Button variant="outline" className="hidden md:inline-flex" onClick={onToday}>
                        Hoje
                    </Button>

                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[42px] shadow-sm overflow-hidden flex-1 md:flex-none">
                        <button
                            onClick={onPrev}
                            className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                        >
                            <ChevronLeftIcon size={18} />
                        </button>
                        <div className="flex-1 md:flex-none px-4 text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap text-center min-w-[140px]">
                            {currentLabel}
                        </div>
                        <button
                            onClick={onNext}
                            className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                        >
                            <ChevronRightIcon size={18} />
                        </button>
                    </div>
                </div>

                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
                        >
                            Filtros
                        </Button>
                        {hasActiveFilters && (
                            <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                        <div
                            className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.left ? "opacity-100" : "opacity-0"}`}
                        />

                        <div
                            ref={filtersContainerRef}
                            onScroll={checkFilterScroll}
                            className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
                        >
                            <AnimatePresence>{teamBadge}</AnimatePresence>
                        </div>

                        <div
                            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
                        />
                    </div>

                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("calendar")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "calendar" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <CalendarIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>

                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onCalendarViewChange("day")}
                            className={`px-3 h-full flex items-center justify-center rounded-full text-sm font-medium transition-colors ${calendarView === "day" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <ListIcon className="w-[16px] h-[16px] mr-1.5" />
                            Dia
                        </button>
                        <button
                            onClick={() => onCalendarViewChange("week")}
                            className={`px-3 h-full flex items-center justify-center rounded-full text-sm font-medium transition-colors ${calendarView === "week" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <GridIcon className="w-[16px] h-[16px] mr-1.5" />
                            Semana
                        </button>
                        <button
                            onClick={() => onCalendarViewChange("month")}
                            className={`px-3 h-full flex items-center justify-center rounded-full text-sm font-medium transition-colors ${calendarView === "month" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <CalendarIcon className="w-[16px] h-[16px] mr-1.5" />
                            Mes
                        </button>
                    </div>
                </div>

                <div className="md:hidden flex items-center gap-2 w-full">
                    <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0">
                        <FilterIcon className="w-4 h-4" />
                    </Button>

                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("calendar")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "calendar" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <CalendarIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>

                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onCalendarViewChange("day")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${calendarView === "day" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <ListIcon className="w-[16px] h-[16px]" />
                        </button>
                        <button
                            onClick={() => onCalendarViewChange("week")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${calendarView === "week" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <GridIcon className="w-[16px] h-[16px]" />
                        </button>
                        <button
                            onClick={() => onCalendarViewChange("month")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${calendarView === "month" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <CalendarIcon className="w-[16px] h-[16px]" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <AnimatePresence>{teamBadge}</AnimatePresence>
                </div>
            </div>
        </>
    );
};

export default AppointmentsPageControls;
