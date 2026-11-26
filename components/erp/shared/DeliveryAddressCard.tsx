"use client"

import { formatAddressParts, parseDeliveryAddressString, type AddressParts } from "@/lib/utils/format-address"

type DeliveryAddressCardProps = {
  name?: string | null
  address?: AddressParts | null
  rawAddress?: string | null
  className?: string
}

export default function DeliveryAddressCard({
  name,
  address,
  rawAddress,
  className = "",
}: DeliveryAddressCardProps) {
  const parsed = address ? null : parseDeliveryAddressString(rawAddress)
  const resolvedAddress: AddressParts | null = address
    || (parsed
      ? {
        street: parsed.street,
        number: parsed.number,
        complement: parsed.complement,
        neighborhood: parsed.neighborhood,
        city: parsed.city,
        state: parsed.state,
        zip_code: parsed.zipCode,
      }
      : null)

  const formatted = (resolvedAddress ? formatAddressParts(resolvedAddress) : null) || rawAddress?.trim() || null
  const city = resolvedAddress?.city?.trim() || ""
  const state = (resolvedAddress?.state || resolvedAddress?.uf || "").trim()
  const zipCode = (resolvedAddress?.zip_code || resolvedAddress?.zipCode || "").trim()
  const cityLine = [city, state].filter(Boolean).join("/")
  const mapsQuery = [formatted, cityLine, zipCode].filter(Boolean).join(", ")
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null

  if (!formatted && !cityLine && !zipCode) {
    return (
      <div className={`rounded-2xl border border-brand-border bg-brand-gray/30 p-4 text-center dark:border-dark-border dark:bg-dark-border/30 ${className}`}>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
          Nenhum endereço de entrega informado.
        </p>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface ${className}`}>
      <div className="relative h-[120px] w-full bg-brand-gray dark:bg-dark-border">
        <img
          src="https://img.dudit.com.br/static/MapLarge.png"
          className="h-full w-full object-cover opacity-80"
          alt="Mapa"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-green text-white">
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>
        </div>
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
            {name || "Destinatário"}
          </h4>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-bold text-brand-dark underline decoration-brand-dark dark:text-dark-heading dark:decoration-dark-heading"
            >
              Ver Mapa
            </a>
          )}
        </div>

        {formatted && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-brand-inactive-text dark:text-dark-body">
            {formatted}

            {(zipCode) && (
              <span>{zipCode}</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
