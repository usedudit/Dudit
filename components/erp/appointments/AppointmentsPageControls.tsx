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
    Settings2Icon,
    ExportFileIcon,
} from "@/lib/icons";
import { CalendarOff, RefreshCw } from "lucide-react";

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
    onOpenUnavailable: () => void;
    onResetView: () => void;
    onExport: () => void;
    isExporting: boolean;
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
    onOpenCreate,
    searchTerm,
    setSearchTerm,
    onOpenUnavailable,
    onResetView,
    onExport,
    isExporting,
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
                {/* --- DESKTOP CONTROLS --- */}
                {/* Left Side: Search input & Filter button */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                    <div className="w-80">
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

                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                        className="h-[42px] relative"
                    >
                        Filtros
                        {hasActiveFilters && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-brand-primary text-white rounded-full">
                                {filters.teamIds.length}
                            </span>
                        )}
                    </Button>
                    {hasActiveFilters && (
                        <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>
                    )}
                </div>

                {/* Middle: Active filters scrollable badges area */}
                <div className="hidden md:flex flex-1 min-w-0 relative h-[42px] items-center">
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

                {/* Right Side: Calendar & Date Nav slider */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                    <Dropdown
                        trigger={
                            <Button
                                variant="outline"
                                className="h-[42px]"
                                leftIcon={<CalendarIcon size={18} />}
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
                                Modo
                            </div>
                            <button
                                onClick={() => onViewModeChange("calendar")}
                                className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${viewMode === "calendar" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
                            >
                                <span>Calendário</span>
                                {viewMode === "calendar" && <span className="text-brand-green">✓</span>}
                            </button>
                            <button
                                onClick={() => onViewModeChange("list")}
                                className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
                            >
                                <span>Lista</span>
                                {viewMode === "list" && <span className="text-brand-green">✓</span>}
                            </button>
                            <div className="border-t border-brand-border dark:border-dark-border my-1.5"></div>
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
                                onClick={onResetView}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                            >
                                Redefinir visualização
                            </button>
                        </div>
                    </Dropdown>

                    {/* Date Navigation Slider */}
                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[42px] overflow-hidden min-w-[200px]">
                        <button
                            onClick={onPrev}
                            className="w-10 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronLeftIcon size={18} />
                        </button>
                        <div className="flex-1 px-4 text-sm font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap text-center truncate select-none">
                            {currentLabel}
                        </div>
                        <button
                            onClick={onNext}
                            className="w-10 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronRightIcon size={18} />
                        </button>
                    </div>
                </div>

                {/* --- TABLET/MOBILE CONTROLS --- */}
                {/* Row 1: Search input & Action Buttons */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            label=""
                            name="search"
                            placeholder="Pesquisar cliente ou serviço..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                            className="mb-0 h-[42px] w-full"
                            variant="full-rounded"
                        />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            className="w-[42px] h-[42px] relative p-0 flex items-center justify-center"
                            leftIcon={<FilterIcon size={18} />}
                        >
                            {hasActiveFilters && <div className="absolute top-2 right-2 w-2 h-2 bg-brand-primary rounded-full"></div>}
                        </Button>

                        {/* Actions Dropdown replacing Calendar Dropdown */}
                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0 flex items-center justify-center" leftIcon={<Settings2Icon size={18} />}>
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            fullWidth={false}
                        >
                            <div className="min-w-[200px] p-1.5 space-y-1">
                                <div className="text-[10px] font-bold text-brand-inactive-text px-3 py-1 uppercase tracking-wider">
                                    Ações
                                </div>
                                <button
                                    onClick={onOpenUnavailable}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-750 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    <CalendarOff size={16} /> Horário indisponível
                                </button>
                                <button
                                    onClick={onResetView}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-750 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    <RefreshCw size={16} /> Redefinir visualização
                                </button>
                                <button
                                    onClick={onExport}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold text-gray-750 hover:bg-gray-50 dark:text-dark-body dark:hover:bg-zinc-800 rounded-md"
                                >
                                    <ExportFileIcon size={16} /> {isExporting ? "Exportando..." : "Exportar"}
                                </button>
                            </div>
                        </Dropdown>

                        <Button onClick={onOpenCreate} className="w-[42px] h-[42px] p-0 flex items-center justify-center">
                            <PlusIcon size={18} />
                        </Button>
                    </div>
                </div>

                {/* Row 2: Date Navigation Slider */}
                <div className="md:hidden flex items-center justify-center w-full">
                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full bg-white dark:bg-dark-surface h-[42px] overflow-hidden w-full max-w-[320px]">
                        <button
                            onClick={onPrev}
                            className="w-12 h-full flex items-center justify-center border-r border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronLeftIcon size={18} />
                        </button>
                        <div className="flex-1 px-4 text-xs font-bold text-brand-dark dark:text-dark-heading capitalize whitespace-nowrap text-center truncate select-none">
                            {currentLabel}
                        </div>
                        <button
                            onClick={onNext}
                            className="w-12 h-full flex items-center justify-center border-l border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors shrink-0"
                        >
                            <ChevronRightIcon size={18} />
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
