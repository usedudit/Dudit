"use client"

import { AlertModal } from "@/components/reusable"
import { CouponRow, getCouponUsageCount } from "@/lib/types/coupon"

interface CouponDeactivationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    coupon: CouponRow
}

export default function CouponDeactivationModal({
    isOpen,
    onClose,
    onConfirm,
    coupon,
}: CouponDeactivationModalProps) {
    const usedCount = getCouponUsageCount(coupon)

    const hasBeenUsed = usedCount > 0

    return (
        <AlertModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title={hasBeenUsed ? "Desativar cupom" : "Desativar cupom"}
            description={
                hasBeenUsed
                    ? `Este cupom foi usado ${usedCount} ${usedCount === 1 ? "vez" : "vezes"}. Deseja realmente desativá-lo? Cupons já utilizados não podem ser reativados.`
                    : "Deseja realmente desativar este cupom? Ele não poderá mais ser utilizado até ser reativado."
            }
            confirmText="Desativar"
            cancelText="Cancelar"
            variant="warning"
        />
    )
}
