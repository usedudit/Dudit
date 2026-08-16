import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button, Checkbox } from '@/components/reusable';

interface DestructiveActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    title: string;
    description: string;
    entityName: string;
    consequences: string[];
    requireReason?: boolean;
    confirmText?: string;
    isPending?: boolean;
}

const DestructiveActionModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    entityName,
    consequences,
    requireReason = true,
    confirmText = 'Confirmar Ação',
    isPending = false,
}: DestructiveActionModalProps) => {
    const [reason, setReason] = useState('');
    const [isConfirmed, setIsConfirmed] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (requireReason && !reason.trim()) return;
        if (!isConfirmed) return;
        onConfirm(reason.trim());
        setReason('');
        setIsConfirmed(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-200 dark:border-red-900/30 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-red-50 dark:bg-red-900/20 p-6 flex items-start gap-4 border-b border-red-100 dark:border-red-900/30">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-red-700 dark:text-red-400 leading-tight">{title}</h2>
                        <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">{description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded-lg transition-colors"
                        aria-label="Fechar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    <div>
                        <h3 className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1.5">
                            Entidade Afetada
                        </h3>
                        <div className="p-3 bg-brand-gray dark:bg-dark-border/40 rounded-xl border border-brand-border dark:border-dark-border font-mono text-sm text-brand-dark dark:text-dark-heading break-all">
                            {entityName}
                        </div>
                    </div>

                    {consequences.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-2">
                                Consequências
                            </h3>
                            <ul className="space-y-1.5">
                                {consequences.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-brand-dark dark:text-dark-body">
                                        <span className="text-red-500 mt-0.5 shrink-0">•</span>
                                        <span>{c}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {requireReason && (
                        <div>
                            <label className="block text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
                                Justificativa da ação <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all resize-none h-24 text-sm"
                                placeholder="Informe o motivo desta ação (obrigatório para registro no Audit Log)..."
                            />
                        </div>
                    )}

                    <div
                        onClick={() => setIsConfirmed(!isConfirmed)}
                        className="flex items-start gap-3 p-3.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 cursor-pointer select-none"
                    >
                        <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={(e) => setIsConfirmed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-xs text-red-900 dark:text-red-300 font-medium leading-relaxed">
                            Estou ciente das consequências desta ação administrativa e confirmo que desejo prosseguir.
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!isConfirmed || (requireReason && !reason.trim()) || isPending}
                    >
                        {isPending ? 'Processando...' : confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DestructiveActionModal;
