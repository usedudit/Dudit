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

                {/* Header Content */}
                <div className={`flex items-start justify-between transition-all duration-300 ${isScrolled ? "py-2" : "py-4 md:py-6"}`}>
                    <div className="flex items-center gap-4 min-w-0">
                        {/* Back button — Mobile & Desktop */}
                        <Button 
                            variant="outline" 
                            onClick={onBack} 
                            className={`flex-shrink-0 flex items-center justify-center transition-all duration-300 ${isScrolled ? "w-8 h-8" : "w-10 h-10"}`}
                        >
                            <ChevronLeftIcon className={`${isScrolled ? "w-4 h-4" : "w-5 h-5"} text-brand-inactive-text dark:text-dark-body`} />
                        </Button>

                        <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
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
                        <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                            <Button variant="outline" onClick={onBack} className={isScrolled ? "h-9 px-3 text-xs" : ""}>
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

                {/* Tabs */}
                <div className="w-full">
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 h-auto">
                        <TabsTrigger value="Dados Gerais" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-xs" : "pb-3 text-sm"}`}>Dados Gerais</TabsTrigger>
                        <TabsTrigger value="Observações" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-xs" : "pb-3 text-sm"}`}>Observações</TabsTrigger>
                    </TabsList>
                </div>
            </div>
        </div>
    );
};

export default QuoteHeader;
