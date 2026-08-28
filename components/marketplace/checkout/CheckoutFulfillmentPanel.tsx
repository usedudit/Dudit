"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Button, FormSection, InfoCard, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { MapPinIcon } from "@/lib/icons"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import type { MarketplaceCheckoutDisplayLine } from "@/lib/commerce/marketplace-checkout-lines"
import { IconPlaceholder } from "@/components/reusable"

const fadeVariants = {
  open: { opacity: 1, transition: { duration: 0.2 } },
  closed: { opacity: 0, transition: { duration: 0.2 } },
}

type AddressBlockProps = {
  loadingAddresses: boolean
  userAddresses: any[]
  selectedAddress: any
  onOpenModal: () => void
  onOpenForm: () => void
  title?: string
}

function AddressBlock({
  loadingAddresses,
  userAddresses,
  selectedAddress,
  onOpenModal,
  onOpenForm,
  title = "Endereço",
}: AddressBlockProps) {
  if (loadingAddresses && userAddresses.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">Carregando endereços...</div>
  }
  const currentAddress = selectedAddress || (userAddresses.length > 0 ? userAddresses[0] : null)
  if (userAddresses.length > 0 && currentAddress) {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-stretch gap-3">
          <img
            src="https://img.dudit.com.br/static/Map.png"
            alt="Endereço"
            className="w-12 h-12 object-cover rounded-xl shrink-0"
          />
          <div className="flex flex-col justify-center">
            <p className="text-md font-bold text-brand-dark dark:text-dark-heading">{title}</p>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              {currentAddress.street}, {currentAddress.number}
              {currentAddress.neighborhood ? ` - ${currentAddress.neighborhood}` : ""}
            </p>
          </div>
        </div>
        <Button variant="link" onClick={onOpenModal}>
          Trocar
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center">
      <IconPlaceholder
        icon={MapPinIcon}
        title="Nenhum endereço cadastrado"
        subtitle="Adicione um endereço para continuar."
        itemButton={{
          text: "Cadastrar Endereço",
          action: onOpenForm,
          variant: "outline",
        }}
      />
    </div>
  )
}

export type CheckoutFulfillmentPanelProps = {
  requirements: CheckoutRequirements
  deliveryType: "delivery" | "pickup"
  onDeliveryTypeChange: (type: "delivery" | "pickup") => void
  deliveryPlanEnabled: boolean
  deliveryEnabled: boolean
  pickupEnabled: boolean
  partnerAddressLabel: string
  preparationHint?: React.ReactNode
  deliveryError: string | null
  addressProps: AddressBlockProps
  schedulingLines: Array<{ name: string; summary: string | null }>
  lines?: MarketplaceCheckoutDisplayLine[]
  onFulfillmentModeChange?: (cartItemId: string, mode: "on_site" | "customer_location") => void
}

export function CheckoutFulfillmentPanel({
  requirements,
  deliveryType,
  onDeliveryTypeChange,
  deliveryPlanEnabled,
  deliveryEnabled,
  pickupEnabled,
  partnerAddressLabel,
  preparationHint,
  deliveryError,
  addressProps,
  schedulingLines,
  lines = [],
  onFulfillmentModeChange,
}: CheckoutFulfillmentPanelProps) {
  const isPickup = deliveryType === "pickup"
  const canShowProductDelivery =
    requirements.showProductFulfillmentOptions &&
    requirements.showDeliverySection &&
    deliveryPlanEnabled &&
    deliveryEnabled
  const canShowProductPickup =
    requirements.showProductFulfillmentOptions && requirements.showPickupOption && pickupEnabled

  const productLines = lines.filter((l) => l.lineKind === "product")
  const serviceLines = lines.filter((l) => l.lineKind === "service_booking")

  const hasProducts = productLines.length > 0 || requirements.showProductFulfillmentOptions
  const hasServices = serviceLines.length > 0 || requirements.showSchedulingSummary

  const hasAnyFulfillmentOption = canShowProductDelivery || canShowProductPickup
  const showProductsSection = hasProducts && hasAnyFulfillmentOption
  const showServicesSection = hasServices

  const needsAddressForProductDelivery =
    requirements.showProductFulfillmentOptions && !isPickup && requirements.showDeliverySection

  const anyServiceRequiresCustomerAddress = serviceLines.some(
    (l) => l.fulfillmentMode === "customer_location"
  )
  const anyServiceRequiresOnSite = serviceLines.some(
    (l) => l.fulfillmentMode === "on_site" || !l.fulfillmentMode
  )

  const renderProductsFulfillment = () => {
    if (!hasProducts) return null
    if (!showProductsSection) {
      return (
        <FormSection title={hasServices ? "Produtos" : "Entrega"}>
          <div className="flex items-center gap-3 py-2">
            <img
              src="https://img.dudit.com.br/static/Map.png"
              alt="Entrega"
              className="w-12 h-12 object-cover rounded-xl shrink-0"
            />
            <div>
              <p className="text-md font-bold text-brand-dark dark:text-dark-heading">A combinar</p>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">O vendedor entrará em contato para combinar a entrega.</p>
            </div>
          </div>
        </FormSection>
      )
    }
    return (
      <FormSection title={hasServices ? "Produtos" : "Entrega"}>
        <div className="space-y-6">
          <Tabs
            value={deliveryType}
            onValueChange={(val) => onDeliveryTypeChange(val as "delivery" | "pickup")}
            className="w-full"
          >
            <TabsList className="mb-6">
              {canShowProductDelivery && <TabsTrigger value="delivery">Entrega</TabsTrigger>}
              {canShowProductPickup && <TabsTrigger value="pickup">Retirada no local</TabsTrigger>}
            </TabsList>
          </Tabs>

          <AnimatePresence mode="wait">
            {isPickup && canShowProductPickup && (
              <motion.div key="pickup" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                <div className="flex items-stretch gap-3">
                  <img
                    src="https://img.dudit.com.br/static/Map.png"
                    alt="Retirada"
                    className="w-12 h-12 object-cover rounded-xl shrink-0"
                  />
                  <div>
                    <p className="text-md font-bold text-brand-dark dark:text-dark-heading">
                      Local de retirada
                    </p>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">{partnerAddressLabel}</p>
                    {preparationHint}
                  </div>
                </div>
              </motion.div>
            )}

            {!isPickup && canShowProductDelivery && (
              <motion.div key="delivery" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                <AddressBlock {...addressProps} title="Endereço de entrega" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </FormSection>
    )
  }

  const renderServicesFulfillment = () => {
    if (!showServicesSection) return null
    return (
      <FormSection title="Serviços">
        <div className="space-y-6">
          {serviceLines.map((line) => {
            const allowed = line.allowedFulfillmentModes || ["on_site"]
            const supportsBoth = allowed.includes("on_site") && allowed.includes("customer_location")
            const currentMode = line.fulfillmentMode || "on_site"

            return (
              <div
                key={line.lineId}
                className="rounded-2xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface space-y-4"
              >
                <div>
                  <p className="font-bold text-brand-dark dark:text-dark-heading text-base">{line.displayName}</p>
                  {line.bookingSummary && (
                    <p className="text-sm text-brand-inactive-text mt-1">{line.bookingSummary}</p>
                  )}
                </div>

                {supportsBoth ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wider">Forma de Atendimento</p>
                    <Tabs
                      value={currentMode}
                      onValueChange={(val) => onFulfillmentModeChange?.(line.lineId, val as "on_site" | "customer_location")}
                      className="w-full"
                    >
                      <TabsList className="mb-0">
                        <TabsTrigger value="customer_location">No meu endereço</TabsTrigger>
                        <TabsTrigger value="on_site">No estabelecimento</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-brand-inactive-text bg-gray-50 dark:bg-dark-border/30 px-3 py-2 rounded-xl w-fit">
                    {allowed.includes("customer_location")
                      ? "Realizado no endereço do cliente"
                      : "Realizado no estabelecimento do parceiro"}
                  </div>
                )}
              </div>
            )
          })}

          {anyServiceRequiresCustomerAddress && (
            <div className="pt-2">
              <AddressBlock {...addressProps} title="Seu endereço para o atendimento" />
            </div>
          )}

          {anyServiceRequiresOnSite && (
            <div className="flex items-stretch gap-3 border-t border-brand-border dark:border-dark-border pt-4">
              <img
                src="https://img.dudit.com.br/static/Map.png"
                alt="Local"
                className="w-12 h-12 object-cover rounded-xl shrink-0"
              />
              <div>
                <p className="text-md font-bold text-brand-dark dark:text-dark-heading">
                  Local do atendimento no estabelecimento
                </p>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">{partnerAddressLabel}</p>
              </div>
            </div>
          )}
        </div>
      </FormSection>
    )
  }

  return (
    <div className="space-y-6">
      {renderProductsFulfillment()}
      {renderServicesFulfillment()}
      {deliveryError && <InfoCard message={deliveryError} color="red" />}
    </div>
  )
}
