import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from '@/components/reusable/Button';

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
    confirmText = 'Confirm'
}: DestructiveActionModalProps) => {
    const [reason, setReason] = useState('');
    const [isConfirmed, setIsConfirmed] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (requireReason && !reason.trim()) return;
        if (!isConfirmed) return;
        onConfirm(reason);
        setReason('');
        setIsConfirmed(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-red-200 dark:border-red-900/30">
                {/* Header */}
                <div className="bg-red-50 dark:bg-red-900/20 p-6 flex items-start gap-4 border-b border-red-100 dark:border-red-900/30">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-red-700 dark:text-red-400">{title}</h2>
                        <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">{description}</p>
                    </div>
                    <button onClick={onClose} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Affected Entity</h3>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-brand-border dark:border-dark-border font-mono text-sm text-brand-dark dark:text-dark-heading">
                            {entityName}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Consequences</h3>
                        <ul className="space-y-2">
                            {consequences.map((c, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-brand-inactive-text dark:text-dark-body">
                                    <span className="text-brand-red mt-0.5">•</span> {c}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {requireReason && (
                        <div>
                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                                Reason for Action <span className="text-brand-red">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full p-3 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none h-24"
                                placeholder="Enter the reason for this action... (Required for audit logs)"
                            />
                        </div>
                    )}

                    <label className="flex items-start gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={(e) => setIsConfirmed(e.target.checked)}
                            className="mt-1 w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500"
                        />
                        <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                            I understand the consequences of this action and confirm I want to proceed.
                        </span>
                    </label>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <button
                        onClick={handleConfirm}
                        disabled={!isConfirmed || (requireReason && !reason.trim())}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DestructiveActionModal;
