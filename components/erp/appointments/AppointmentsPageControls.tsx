"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Button, Input, Dropdown } from "@/components/reusable";
import FilterChip from "@/components/reusable/FilterChip";
import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    FilterIcon,
    PlusIcon,
    SearchIcon,
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
    onOpenCreate: () => void;
    searchTerm: string;
    setSearchTerm: (val: string) => void;
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
    calendarView,
    onCalendarViewChange,
    onOpenCreate,
    searchTerm,
    setSearchTerm,
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
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8 w-full">
                {/* Left Side: Date Navigation Slider */}
                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-start">
                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[42px] overflow-hidden min-w-[180px] md:min-w-[200px]">
                        <button
                            onClick={onPrev}
                            className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronLeftIcon size={18} />
                        </button>
                        <div className="flex-1 px-4 text-xs md:text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap text-center truncate select-none">
                            {currentLabel}
                        </div>
                        <button
                            onClick={onNext}
                            className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronRightIcon size={18} />
                        </button>
                    </div>

                    {/* Mobile control actions (Filters and View shortcuts) */}
                    <div className="md:hidden flex items-center gap-2 shrink-0">
                        <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] relative p-0 flex items-center justify-center">
                            <FilterIcon className="w-[18px] h-[18px]" />
                            {hasActiveFilters && <div className="absolute top-2 right-2 w-2 h-2 bg-brand-primary rounded-full"></div>}
                        </Button>

                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0 flex items-center justify-center">
                                    <CalendarIcon className="w-[18px] h-[18px]" />
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            fullWidth={false}
                        >
                            <div className="min-w-[160px] p-1 space-y-1">
                                <button
                                    onClick={() => onCalendarViewChange("day")}
                                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "day" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-55 dark:hover:bg-zinc-800"}`}
                                >
                                    Dia
                                </button>
                                <button
                                    onClick={() => onCalendarViewChange("week")}
                                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "week" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-55 dark:hover:bg-zinc-800"}`}
                                >
                                    Semana
                                </button>
                                <button
                                    onClick={() => onCalendarViewChange("month")}
                                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "month" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-55 dark:hover:bg-zinc-800"}`}
                                >
                                    Mês
                                </button>
                                <div className="border-t border-brand-border dark:border-dark-border my-1"></div>
                                <button
                                    onClick={onToday}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    Hoje
                                </button>
                                <div className="border-t border-brand-border dark:border-dark-border my-1"></div>
                                <button
                                    onClick={() => {
                                        onToday();
                                        onCalendarViewChange("day");
                                        setFilters({ teamIds: [] });
                                    }}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    Redefinir visualização
                                </button>
                            </div>
                        </Dropdown>

                        <Button onClick={onOpenCreate} className="w-[42px] h-[42px] p-0 flex items-center justify-center">
                            <PlusIcon size={18} />
                        </Button>
                    </div>
                </div>

                {/* Right Side: Search input, Filter button, Calendar Dropdown */}
                <div className="flex flex-col md:flex-row items-center w-full md:w-auto gap-3 flex-1 md:flex-none">
                    {/* Search Input bar */}
                    <div className="w-full md:w-[260px] lg:w-[320px] shrink-0">
                        <Input
                            label=""
                            name="search"
                            placeholder="Pesquisar cliente ou serviço..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                            className="mb-0 h-[42px]"
                            variant="full-rounded"
                        />
                    </div>

                    <div className="hidden md:flex items-center gap-3 shrink-0">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
                            className="h-[42px] relative"
                        >
                            Filtros
                            {hasActiveFilters && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-brand-primary text-white rounded-full">
                                    {filters.teamIds.length}
                                </span>
                            )}
                        </Button>

                        {/* Calendar Dropdown Button */}
                        <Dropdown
                            trigger={
                                <Button
                                    variant="outline"
                                    className="h-[42px]"
                                    leftIcon={<CalendarIcon className="w-[18px] h-[18px]" />}
                                >
                                    Calendário
                                </Button>
                            }
                            align="right"
                            showChevron={true}
                            fullWidth={false}
                        >
                            <div className="w-56 p-1.5 space-y-1">
                                <div className="text-[10px] font-bold text-brand-inactive-text px-3 py-1 uppercase tracking-wider">
                                    Visualização
                                </div>
                                <button
                                    onClick={() => onCalendarViewChange("day")}
                                    className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "day" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
                                >
                                    <span>Dia</span>
                                    {calendarView === "day" && <span className="text-brand-green">✓</span>}
                                </button>
                                <button
                                    onClick={() => onCalendarViewChange("week")}
                                    className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "week" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
                                >
                                    <span>Semana</span>
                                    {calendarView === "week" && <span className="text-brand-green">✓</span>}
                                </button>
                                <button
                                    onClick={() => onCalendarViewChange("month")}
                                    className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${calendarView === "month" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
                                >
                                    <span>Mês</span>
                                    {calendarView === "month" && <span className="text-brand-green">✓</span>}
                                </button>
                                <div className="border-t border-brand-border dark:border-dark-border my-1.5"></div>
                                <button
                                    onClick={onToday}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    Hoje
                                </button>
                                <div className="border-t border-brand-border dark:border-dark-border my-1.5"></div>
                                <button
                                    onClick={() => {
                                        onToday();
                                        onCalendarViewChange("day");
                                        setFilters({ teamIds: [] });
                                    }}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    Redefinir visualização
                                </button>
                            </div>
                        </Dropdown>
                    </div>

                    <div className="flex-1 min-w-0 relative h-[42px] hidden md:flex items-center">
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
