"use client"

import { useState } from "react"
import { FlagIcon, XIcon } from "@/lib/icons"
import { Button, FormDropdown, FormTextarea, DefaultModal } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { createReport, type ReportTargetType } from "@/app/actions/admin/reports"
import { REPORT_REASON_CODES, REPORT_REASON_LABELS, type ReportReasonCode } from "@/lib/admin/report-reasons"
import { getCSRFToken } from "@/lib/utils/fetch-with-csrf"
import { ArrowLeftRightIcon } from "@/lib/icons"

interface ReportModalProps {
    isOpen: boolean
    onClose: () => void
    targetType: ReportTargetType
    targetId: string
    targetName: string
}

export function ReportModal({
    isOpen,
    onClose,
    targetType,
    targetId,
    targetName
}: ReportModalProps) {
    const [reasonCode, setReasonCode] = useState<ReportReasonCode | "">("")
    const [description, setDescription] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { success, error } = useNotification()

    const handleSubmit = async () => {
        if (!reasonCode) {
            error("Erro", "Por favor, selecione um motivo para a denúncia.")
            return
        }

        setIsSubmitting(true)
        try {
            const csrf_token = await getCSRFToken()
            const res = await createReport({
                targetType,
                targetId,
                reasonCode,
                description: description.trim() || undefined,
                csrf_token
            })

            if (res.success) {
                success("Denúncia enviada", "Sua denúncia foi registrada e será analisada pela nossa equipe de moderação. Obrigado por ajudar a manter a Dudit segura!")
                setReasonCode("")
                setDescription("")
                onClose()
            } else {
                error("Não foi possível enviar", res.error || "Ocorreu um erro ao processar sua denúncia.")
            }
        } catch (err) {
            error("Erro", "Ocorreu um erro inesperado. Tente novamente mais tarde.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const targetLabel = targetType === "product" ? "este produto" : targetType === "partner" ? "este vendedor" : "este item"

    // Filtra as opções baseadas no targetType
    const getRelevantReasons = (): ReportReasonCode[] => {
        if (targetType === "partner") {
            return [
                "scam_or_fraud",
                "inappropriate_content",
                "spam_or_misleading",
                "harassment_or_hate",
                "fake_listing",
                "other"
            ];
        }
        if (targetType === "review") {
            return [
                "inappropriate_content",
                "spam_or_misleading",
                "harassment_or_hate",
                "scam_or_fraud",
                "other"
            ];
        }
        // Para products, services, rental_items, etc
        return [
            "counterfeit",
            "illegal_or_dangerous",
            "copyright_violation",
            "scam_or_fraud",
            "fake_listing",
            "inappropriate_content",
            "other"
        ];
    };

    const relevantReasons = getRelevantReasons();

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            maxWidth="md"
        >
            <div className="flex flex-col relative">
                {/* Close X Button - Desktop Only */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                    title="Fechar"
                >
                    <XIcon size={18} />
                </button>

                {/* Header with Dual Squares */}
                <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                    <img
                        src="https://img.dudit.com.br/static/illustrations/DenunciarItem.png"
                        alt="Comunicar algo errado"
                        className="w-64 h-auto object-contain transform translate-y-7"
                    />
                </div>

                <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
                    Comunicar algo errado sobre {targetType === "partner" ? "este vendedor" : targetType === "review" ? "esta avaliação" : "este produto"}
                </h4>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] mb-8 text-center leading-relaxed">
                    Percebeu algo que não parece correto em <strong>{targetName}</strong>? Conte para nós. Seu relato é anônimo e será analisado pela nossa equipe.
                </p>

                <div className="space-y-6">
                    <FormDropdown
                        label="Motivo da denúncia"
                        placeholder="Selecione o motivo..."
                        options={relevantReasons.map(code => ({
                            value: code,
                            label: REPORT_REASON_LABELS[code]
                        }))}
                        value={reasonCode}
                        setValue={(val) => setReasonCode(val as ReportReasonCode)}
                        width="w-full"
                    />

                    <FormTextarea
                        label="Detalhes adicionais (opcional)"
                        placeholder="Descreva brevemente o motivo da sua denúncia..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        maxLength={500} name={""} showCharacterCount />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex-1 h-[46px]"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="flex-1 h-[46px] bg-[#d32f2f] hover:bg-[#b71c1c] border-none"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Enviando..." : "Enviar Denúncia"}
                    </Button>
                </div>
            </div>
        </DefaultModal>
    )
}
