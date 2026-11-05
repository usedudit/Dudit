"use client"

import { Checkbox } from "@/components/reusable"
import type { FulfillmentMode } from "@/lib/commerce/capabilities"

const LABELS: Record<FulfillmentMode, string> = {
  delivery: "Entrega local",
  pickup: "Retirada no local",
  shipping: "Transportadora",
  on_site: "No estabelecimento",
  customer_location: "No endereço do cliente",
}

type FulfillmentModesEditorProps = {
  label: string
  allowedModes: FulfillmentMode[]
  value: FulfillmentMode[]
  onChange: (modes: FulfillmentMode[]) => void
  disabled?: boolean
}

export function FulfillmentModesEditor({
  label,
  allowedModes,
  value,
  onChange,
  disabled,
}: FulfillmentModesEditorProps) {
  const toggle = (mode: FulfillmentMode) => {
    if (disabled) return
    if (value.includes(mode)) {
      const next = value.filter((m) => m !== mode)
      if (next.length > 0) onChange(next)
    } else {
      onChange([...value, mode])
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">{label}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {allowedModes.map((mode) => (
          <Checkbox
            key={mode}
            label={LABELS[mode]}
            checked={value.includes(mode)}
            onChange={() => toggle(mode)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
