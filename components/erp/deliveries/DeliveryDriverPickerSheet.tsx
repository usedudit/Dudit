"use client"

import BottomSheet from "@/components/BottomSheet"
import { TruckIcon } from "@/lib/icons"

export type DeliveryDriverPickerItem = {
    id: string
    fullName: string
    vehicleType?: string | null
    city?: string | null
    neighborhood?: string | null
}

interface DeliveryDriverPickerSheetProps {
    isOpen: boolean
    onClose: () => void
    drivers: DeliveryDriverPickerItem[]
    onSelect: (driverId: string) => void
}

export default function DeliveryDriverPickerSheet({
    isOpen,
    onClose,
    drivers,
    onSelect,
}: DeliveryDriverPickerSheetProps) {
    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Entregadores Dudit">
            <div className="space-y-3 pb-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    Entregadores da plataforma disponíveis para este parceiro.
                </p>

                {drivers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-brand-border p-5 text-center text-sm text-brand-inactive-text dark:border-dark-border dark:text-dark-body">
                        Nenhum entregador Dudit disponível no momento.
                    </div>
                ) : (
                    drivers.map((driver) => (
                        <button
                            key={driver.id}
                            type="button"
                            onClick={() => {
                                onSelect(driver.id)
                                onClose()
                            }}
                            className="flex w-full items-center justify-between gap-4 rounded-xl border border-brand-border bg-white p-4 text-left transition hover:border-brand-green dark:border-dark-border dark:bg-dark-surface"
                        >
                            <span className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
                                    <TruckIcon size={19} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold text-brand-dark dark:text-dark-heading">
                                        {driver.fullName}
                                    </span>
                                    <span className="mt-1 block truncate text-xs text-brand-inactive-text dark:text-dark-body">
                                        Dudit · {driver.vehicleType || "Veículo não informado"}
                                        {driver.city ? ` · ${driver.city}` : ""}
                                    </span>
                                </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-brand-green">Selecionar</span>
                        </button>
                    ))
                )}
            </div>
        </BottomSheet>
    )
}
