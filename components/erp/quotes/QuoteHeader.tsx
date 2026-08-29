"use client"

import React, { useCallback } from 'react';
import { ChevronLeftIcon, SaveIcon } from '@/lib/icons';
import { Button, TabsList, TabsTrigger } from '@/components/reusable';

interface QuoteHeaderProps {
    isScrolled: boolean;
    onBack: () => void;
    onSave?: () => void;
    isSaving?: boolean;
    title: string;
    subtitle: string;
    saveLabel?: string;
    activeTab?: string;
    hideOnMobile?: boolean;
}

const QuoteHeader = ({
    isScrolled,
    onBack,
    onSave,
    isSaving,
    title,
    subtitle,
    saveLabel = "Salvar",
    activeTab = "Dados Gerais",
    hideOnMobile = false
}: QuoteHeaderProps) => {
    const handleBack = useCallback(() => onBack(), [onBack]);

    // Hide title on mobile/tablet when preview tab is active
    const showTitle = activeTab !== 'Visualização';

    return (
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                {/* Header Content - Control visibility on mobile */}
                <div className={`flex items-start justify-between transition-all duration-300 ${hideOnMobile ? "hidden md:flex" : "flex"} ${isScrolled ? "py-2" : "py-4 md:py-6"}`}>
                    <div className="flex items-center gap-4 min-w-0">
                        {/* Back button - desktop only */}
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        <div className={`flex flex-col gap-0.5 overflow-hidden min-w-0 transition-opacity duration-300 md:opacity-100 ${!showTitle ? "opacity-0 h-0 md:h-auto overflow-hidden md:overflow-visible" : "opacity-100"}`}>
                            <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 truncate ${isScrolled ? "text-lg" : "text-xl md:text-2xl"}`}>
                                {title}
                            </h1>

                            {!isScrolled && (
                                <div className="hidden md:block text-brand-inactive-text dark:text-dark-body text-[13px] font-medium transition-all duration-300 truncate">
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>

                    {onSave && (
                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                            <Button variant="outline" onClick={handleBack} className={isScrolled ? "h-9 px-3 text-xs" : ""}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={onSave}
                                isLoading={isSaving}
                                className={isScrolled ? "h-9 px-4 text-xs" : ""}
                            >
                                {!isSaving && <SaveIcon className={`${isScrolled ? "w-3.5 h-3.5" : "w-[18px] h-[18px]"} mr-2`} />}
                                {saveLabel}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Tabs - ALWAYS visible on mobile */}
                <div className="w-full">
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 h-auto">
                        <TabsTrigger value="Dados Gerais" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-xs" : "pb-3 text-sm"}`}>Dados Gerais</TabsTrigger>
                        <TabsTrigger value="Observações" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-xs" : "pb-3 text-sm"}`}>Observações</TabsTrigger>
                        <TabsTrigger value="Visualização" className={`px-0 transition-all duration-300 lg:hidden ${isScrolled ? "pb-2 text-xs" : "pb-3 text-sm"}`}>Visualização</TabsTrigger>
                    </TabsList>
                </div>
            </div>
        </div>
    );
};

export default QuoteHeader;
