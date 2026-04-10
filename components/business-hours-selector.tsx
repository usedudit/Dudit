"use client"

import { MoonIcon } from "@/lib/icons"
import { Switch } from "@/components/ui/switch"

interface BusinessHoursSelectorProps {
    value: Record<string, { enabled: boolean; from: string; to: string }>
    onChange: (value: Record<string, { enabled: boolean; from: string; to: string }>) => void
}

const DAYS = [
    { key: "monday", label: "Segunda-feira" },
    { key: "tuesday", label: "Terça-feira" },
    { key: "wednesday", label: "Quarta-feira" },
    { key: "thursday", label: "Quinta-feira" },
    { key: "friday", label: "Sexta-feira" },
    { key: "saturday", label: "Sábado" },
    { key: "sunday", label: "Domingo" },
]

export function BusinessHoursSelector({ value, onChange }: BusinessHoursSelectorProps) {
    const handleToggle = (day: string, enabled: boolean) => {
        onChange({
            ...value,
            [day]: {
                ...value[day],
                enabled,
            },
        })
    }

    const handleTimeChange = (day: string, field: "from" | "to", time: string) => {
        onChange({
            ...value,
            [day]: {
                ...value[day],
                [field]: time,
            },
        })
    }

    return (
        <div className="w-full space-y-3">
            {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4">
                    <div className="flex items-center gap-3 w-40 shrink-0">
                        <Switch
                            checked={value[key]?.enabled || false}
                            onCheckedChange={(checked) => handleToggle(key, checked)}
                            className="data-[state=checked]:bg-brand-green"
                        />
                        <span className="text-sm font-medium text-gray-900">{label}</span>
                    </div>

                    {value[key]?.enabled ? (
                        <div className="flex items-center gap-3 flex-1">
                            <div className="flex items-center gap-2 px-3 py-2 border border-brand-border rounded-lg bg-white">
                                <span className="text-sm text-gray-600 font-medium">De</span>
                                <input
                                    type="time"
                                    value={value[key]?.from || "09:00"}
                                    onChange={(e) => handleTimeChange(key, "from", e.target.value)}
                                    className="h-6 px-2 rounded text-sm focus:outline-none border-0 focus:ring-0 bg-transparent"
                                />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 border border-brand-border rounded-lg bg-white">
                                <span className="text-sm text-gray-600 font-medium">Até</span>
                                <input
                                    type="time"
                                    value={value[key]?.to || "18:00"}
                                    onChange={(e) => handleTimeChange(key, "to", e.target.value)}
                                    className="h-6 px-2 rounded text-sm focus:outline-none border-0 focus:ring-0 bg-transparent"
                                />
                            </div>
                            {/* </CHANGE> */}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg flex-1">
                            <MoonIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-400">Fechado</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

export default BusinessHoursSelector
