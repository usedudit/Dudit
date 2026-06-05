import type { ResolvedCartLine } from "@/lib/services/marketplace-cart-resolver"
import type { CheckoutLineContext, CheckoutLineKind } from "@/lib/commerce/checkout-requirements"
import type { ServiceBookingMetadata } from "@/lib/types/marketplace-cart"
import { formatDateToBR } from "@/lib/utils/formatters"

export function buildCheckoutLineContextsFromResolved(
  lines: ResolvedCartLine[],
): CheckoutLineContext[] {
  return lines.map((line) => {
    const lineKind = line.itemType as CheckoutLineKind
    const meta = line.bookingMetadata as ServiceBookingMetadata | null | undefined
    const schedulingMetadataComplete =
      lineKind === "service_booking"
        ? Boolean(
            meta &&
              !meta.instantPurchase &&
              meta.staffId &&
              meta.date &&
              meta.time,
          )
        : undefined

    return {
      lineId: line.cartItemId,
      lineKind,
      catalog: line.capabilities,
      fulfillmentMode: line.fulfillmentMode,
      schedulingMetadataComplete,
    }
  })
}

export type MarketplaceCheckoutDisplayLine = {
  lineId: string
  lineKind: CheckoutLineKind
  displayName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  fulfillmentMode: string | null
  paymentRequirement: string
  bookingSummary?: string | null
  allowedFulfillmentModes?: string[]
}

export function mapDisplayLinesFromResolved(lines: ResolvedCartLine[]): MarketplaceCheckoutDisplayLine[] {
  return lines.map((line) => {
    const meta = line.bookingMetadata
    let bookingSummary: string | null = null
    if (meta && !meta.instantPurchase && meta.date && meta.time) {
      bookingSummary = `${meta.staffName} · ${formatDateToBR(meta.date)} às ${meta.time}`
    }

    return {
      lineId: line.cartItemId,
      lineKind: line.itemType as CheckoutLineKind,
      displayName: line.lineName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.unitPrice * line.quantity,
      fulfillmentMode: line.fulfillmentMode,
      paymentRequirement: line.capabilities.paymentRequirement,
      bookingSummary,
      allowedFulfillmentModes: line.capabilities.fulfillmentModes || [],
    }
  })
}
