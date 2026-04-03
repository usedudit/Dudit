"use client"

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
}

const QuoteHeader = ({ isScrolled, onBack, onSave, isSaving, title, subtitle, saveLabel = "Salvar" }: QuoteHeaderProps) => {
    return (
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                {/* Back button — desktop only */}
                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                </div>

                {/* Title row */}
                <div className="hidden md:flex items-start justify-between">
                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                            <span className="hidden md:inline truncate">{title}</span>
                        </h1>

                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                            {subtitle}
                        </div>
                    </div>

                    {onSave && (
                        <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3 mb-4">
                            <Button variant="outline" onClick={onBack}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={onSave}
                                isLoading={isSaving}
                            >
                                {!isSaving && <SaveIcon className="w-[18px] h-[18px] mr-2" />}
                                {saveLabel}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                        <TabsTrigger value="Dados Gerais" className="px-0 pb-3">Dados Gerais</TabsTrigger>
                        <TabsTrigger value="Observações" className="px-0 pb-3">Observações</TabsTrigger>
                    </TabsList>
                </div>
            </div>
        </div>
    );
};

export default QuoteHeader;
