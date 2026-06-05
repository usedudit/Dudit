"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Button, FormSection, IconPlaceholder, InfoCard } from "@/components/reusable"
import { MapPinIcon, Tabs, TabsList, TabsTrigger } from "@/lib/icons"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"

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
  if (loadingAddresses) {
    return <div className="py-8 text-center text-sm text-gray-400">Carregando endereços...</div>
  }
  if (userAddresses.length > 0 && selectedAddress) {
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
            <p className="text-sm text-brand-inactive-text">
              {selectedAddress.street}, {selectedAddress.number}
              {selectedAddress.neighborhood ? ` — ${selectedAddress.neighborhood}` : ""}
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
    <div className="flex flex-col items-center border-t border-brand-border dark:border-dark-border pt-6">
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
}: CheckoutFulfillmentPanelProps) {
  const isPickup = deliveryType === "pickup"
  const canShowProductDelivery =
    requirements.showProductFulfillmentOptions &&
    requirements.showDeliverySection &&
    deliveryPlanEnabled &&
    deliveryEnabled
  const canShowProductPickup =
    requirements.showProductFulfillmentOptions && requirements.showPickupOption && pickupEnabled

  const showAny =
    requirements.showProductFulfillmentOptions ||
    requirements.showPartnerLocation ||
    requirements.showCustomerAddressSection ||
    requirements.showSchedulingSummary

  if (!showAny) return null

  const sectionTitle = requirements.showProductFulfillmentOptions
    ? "Entrega"
    : requirements.showSchedulingSummary
      ? "Agendamento"
      : "Atendimento"

  const needsAddressForService =
    requirements.showCustomerAddressSection &&
    !requirements.showProductFulfillmentOptions
  const needsAddressForProductDelivery =
    requirements.showProductFulfillmentOptions && !isPickup && requirements.showDeliverySection

  return (
    <FormSection title={sectionTitle}>
      <div className="space-y-6">
        {requirements.showSchedulingSummary && schedulingLines.length > 0 && (
          <div className="space-y-3">
            {schedulingLines.map((line) => (
              <div
                key={line.name}
                className="rounded-xl border border-brand-border dark:border-dark-border p-4"
              >
                <p className="font-semibold text-brand-dark dark:text-dark-heading">{line.name}</p>
                {line.summary && (
                  <p className="text-sm text-brand-inactive-text mt-1">{line.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {requirements.showPartnerLocation && (
          <div className="flex items-stretch gap-3">
            <img
              src="https://img.dudit.com.br/static/Map.png"
              alt="Local"
              className="w-12 h-12 object-cover rounded-xl shrink-0"
            />
            <div>
              <p className="text-md font-bold text-brand-dark dark:text-dark-heading">
                Local do atendimento
              </p>
              <p className="text-sm text-brand-inactive-text">{partnerAddressLabel}</p>
            </div>
          </div>
        )}

        {requirements.showProductFulfillmentOptions && (canShowProductDelivery || canShowProductPickup) && (
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
        )}

        <AnimatePresence mode="wait">
          {requirements.showProductFulfillmentOptions && isPickup && canShowProductPickup && (
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
                  <p className="text-sm text-brand-inactive-text">{partnerAddressLabel}</p>
                  {preparationHint}
                </div>
              </div>
            </motion.div>
          )}

          {needsAddressForProductDelivery && (
            <motion.div key="delivery" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
              <AddressBlock {...addressProps} title="Endereço de entrega" />
            </motion.div>
          )}
        </AnimatePresence>

        {needsAddressForService && (
          <AddressBlock {...addressProps} title="Seu endereço para o atendimento" />
        )}

        {deliveryError && <InfoCard message={deliveryError} color="red" />}
      </div>
    </FormSection>
  )
}
