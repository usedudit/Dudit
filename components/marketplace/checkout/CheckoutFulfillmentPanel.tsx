"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, FormSection, InfoCard, Tabs, TabsList, TabsTrigger, RadioButton, ListItem, DefaultModal, Spinner } from "@/components/reusable"
import { MapPinIcon, ServiceIcon } from "@/lib/icons"
import { formatCurrency, formatDeliveryDaysRange } from "@/lib/utils"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import type { CarrierFreightOption } from "@/lib/services/shipping/carrier-checkout"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import type { MarketplaceCheckoutDisplayLine } from "@/lib/commerce/marketplace-checkout-lines"
import { IconPlaceholder } from "@/components/reusable"
import { checkServiceAttendanceAction } from "@/app/actions/shared/delivery"

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
        <div className="flex items-stretch gap-4">
          <img
            src="https://img.dudit.com.br/static/Map.png"
            alt="Endereço"
            className="w-12 h-12 object-cover rounded-full shrink-0"
          />
          <div className="flex flex-col justify-center">
            <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">{title}</p>
            <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">
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
  /** Loja possui envio nacional (transportadora/SuperFrete) conectado. */
  shippingEnabled?: boolean
  partnerAddressLabel: string
  preparationHint?: React.ReactNode
  deliveryError: string | null
  carrierOptions?: CarrierFreightOption[]
  selectedCarrierServiceId?: number | null
  carrierQuoteLoading?: boolean
  carrierError?: string | null
  onSelectCarrier?: (opt: CarrierFreightOption) => void
  deliveryFree?: boolean
  addressProps: AddressBlockProps
  schedulingLines: Array<{ name: string; summary: string | null }>
  lines?: MarketplaceCheckoutDisplayLine[]
  onFulfillmentModesSave?: (changes: Array<{ cartItemId: string; mode: "on_site" | "customer_location" }>) => Promise<void>
  /** Parceiro responsável pelo carrinho (para validar raio de atendimento). */
  partnerId?: string
  /** Endereço selecionado pelo cliente (validado contra o raio de atendimento do serviço). */
  deliveryAddress?: string
  /** Coordenadas do endereço selecionado (evita geocodificar de novo). */
  destinationCoords?: { lat: number; lng: number } | null
}

export function CheckoutFulfillmentPanel({
  requirements,
  deliveryType,
  onDeliveryTypeChange,
  deliveryPlanEnabled,
  deliveryEnabled,
  pickupEnabled,
  shippingEnabled = false,
  partnerAddressLabel,
  preparationHint,
  deliveryError,
  carrierOptions = [],
  selectedCarrierServiceId = null,
  carrierQuoteLoading = false,
  carrierError = null,
  onSelectCarrier,
  deliveryFree = false,
  addressProps,
  schedulingLines,
  lines = [],
  onFulfillmentModesSave,
  partnerId = "",
  deliveryAddress = "",
  destinationCoords = null,
}: CheckoutFulfillmentPanelProps) {
  const isPickup = deliveryType === "pickup"
  const canShowLocalDelivery =
    requirements.showProductFulfillmentOptions &&
    requirements.showDeliverySection &&
    requirements.showLocalDeliveryOption &&
    deliveryPlanEnabled &&
    deliveryEnabled
  const canShowShipping =
    requirements.showProductFulfillmentOptions &&
    requirements.showDeliverySection &&
    requirements.showShippingOption &&
    shippingEnabled
  // Aba "Entrega" cobre entrega local (frete próprio) e/ou envio nacional
  // (transportadora). Endereço é necessário nos dois casos.
  const canShowProductDelivery = canShowLocalDelivery || canShowShipping
  const canShowProductPickup =
    requirements.showProductFulfillmentOptions && requirements.showPickupOption && pickupEnabled

  const productLines = lines.filter((l) => l.lineKind === "product")
  const serviceLines = lines.filter((l) => l.lineKind === "service_booking")

  const hasProducts = productLines.length > 0 || requirements.showProductFulfillmentOptions
  const hasServices = serviceLines.length > 0 || requirements.showSchedulingSummary

  const hasAnyFulfillmentOption = canShowProductDelivery || canShowProductPickup
  const showProductsSection = hasProducts && hasAnyFulfillmentOption
  const showServicesSection = hasServices

  const [modalOpen, setModalOpen] = useState(false)
  const [modalDrafts, setModalDrafts] = useState<Record<string, "on_site" | "customer_location">>({})
  const [saving, setSaving] = useState(false)

  // Validação de raio de atendimento por serviço quando "No meu endereço" é
  // escolhido. Bloqueia a opção caso o endereço esteja fora do raio configurado.
  const [serviceAttendance, setServiceAttendance] = useState<Record<string, {
    checked: boolean
    covered: boolean
    error: string | null
    distanceKm: number | null
  }>>({})
  const lastValidatedAddressKey = useRef<string | null>(null)

  const validateServiceAddress = useCallback(async (line: MarketplaceCheckoutDisplayLine) => {
    const lineId = line.lineId
    setServiceAttendance((prev) => ({
      ...prev,
      [lineId]: { checked: false, covered: false, error: null, distanceKm: null },
    }))
    if (!deliveryAddress) {
      setServiceAttendance((prev) => ({
        ...prev,
        [lineId]: { checked: true, covered: false, error: "Selecione um endereço de atendimento.", distanceKm: null },
      }))
      return false
    }
    setServiceAttendance((prev) => ({
      ...prev,
      [lineId]: { checked: true, covered: false, error: null, distanceKm: null },
    }))
    try {
      const res = await checkServiceAttendanceAction({
        partnerId: partnerId || "",
        storeId: line.storeId || null,
        serviceId: line.serviceId || null,
        deliveryAddress,
        destinationCoords: destinationCoords ?? null,
      })
      if (res.success && !res.outOfRadius) {
        setServiceAttendance((prev) => ({
          ...prev,
          [lineId]: { checked: true, covered: true, error: null, distanceKm: res.distanceKm },
        }))
        return true
      }
      setServiceAttendance((prev) => ({
        ...prev,
        [lineId]: {
          checked: true,
          covered: false,
          error: res.success
            ? "Endereço fora do raio de atendimento deste serviço."
            : (res.error || "Endereço fora do raio de atendimento deste serviço."),
          distanceKm: res.success ? res.distanceKm : null,
        },
      }))
      return false
    } catch {
      setServiceAttendance((prev) => ({
        ...prev,
        [lineId]: { checked: true, covered: false, error: "Não foi possível validar o atendimento neste endereço.", distanceKm: null },
      }))
      return false
    }
  }, [partnerId, deliveryAddress, destinationCoords])

  // Re-valida serviços marcados como "No meu endereço" quando o endereço muda.
  useEffect(() => {
    const addressKey = deliveryAddress ? `${deliveryAddress}` : "__none__"
    if (addressKey === lastValidatedAddressKey.current) return
    lastValidatedAddressKey.current = addressKey
    if (!modalOpen) return
    void (async () => {
      for (const line of serviceLines) {
        const draft = modalDrafts[line.lineId]
        if (draft === "customer_location") {
          await validateServiceAddress(line)
        }
      }
    })()
    // validateServiceAddress is intentionally omitted: it is stable via useCallback deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryAddress, modalOpen, modalDrafts, serviceLines])

  const openModal = useCallback(() => {
    const drafts: Record<string, "on_site" | "customer_location"> = {}
    for (const line of serviceLines) {
      drafts[line.lineId] = (line.fulfillmentMode as "on_site" | "customer_location") || "on_site"
    }
    setModalDrafts(drafts)
    setModalOpen(true)
  }, [serviceLines])

  const handleDraftChange = useCallback(async (lineId: string, mode: "on_site" | "customer_location") => {
    setModalDrafts((prev) => ({ ...prev, [lineId]: mode }))
    if (mode === "customer_location") {
      const line = serviceLines.find((l) => l.lineId === lineId)
      if (line) {
        const covered = await validateServiceAddress(line)
        if (!covered) {
          // Fora do raio / sem endereço: força de volta para o estabelecimento
          // e limpa o aviso - a opção "No meu endereço" não fica mais marcada.
          setModalDrafts((prev) => ({ ...prev, [lineId]: "on_site" }))
          setServiceAttendance((prev) => ({
            ...prev,
            [lineId]: { checked: true, covered: false, error: null, distanceKm: null },
          }))
        }
      }
    } else {
      setServiceAttendance((prev) => ({ ...prev, [lineId]: { checked: true, covered: false, error: null, distanceKm: null } }))
    }
  }, [serviceLines, validateServiceAddress])

  const servicesWithChoice = useMemo(
    () => serviceLines.filter((l) => {
      const allowed = l.allowedFulfillmentModes || ["on_site"]
      return allowed.includes("on_site") && allowed.includes("customer_location")
    }),
    [serviceLines]
  )

  const servicesOnSiteOnly = useMemo(
    () => serviceLines.filter((l) => {
      const allowed = l.allowedFulfillmentModes || ["on_site"]
      return !(allowed.includes("on_site") && allowed.includes("customer_location"))
    }),
    [serviceLines]
  )

  const hasPendingChanges = useMemo(() => {
    return servicesWithChoice.some((line) => {
      const current = (line.fulfillmentMode as "on_site" | "customer_location") || "on_site"
      return modalDrafts[line.lineId] !== current
    })
  }, [modalDrafts, servicesWithChoice])

  const handleModalSave = useCallback(async () => {
    if (!onFulfillmentModesSave) return
    const changes: Array<{ cartItemId: string; mode: "on_site" | "customer_location" }> = []
    for (const line of servicesWithChoice) {
      const current = (line.fulfillmentMode as "on_site" | "customer_location") || "on_site"
      const pending = modalDrafts[line.lineId]
      if (pending && pending !== current) {
        changes.push({ cartItemId: line.lineId, mode: pending })
      }
    }
    if (changes.length === 0) {
      setModalOpen(false)
      return
    }
    // Validação final: nenhum "No meu endereço" pode ser salvo fora do raio.
    setSaving(true)
    try {
      for (const change of changes) {
        if (change.mode === "customer_location") {
          const line = serviceLines.find((l) => l.lineId === change.cartItemId)
          if (line) {
            const covered = await validateServiceAddress(line)
            if (!covered) {
              setModalDrafts((prev) => ({ ...prev, [change.cartItemId]: "on_site" }))
              setServiceAttendance((prev) => ({
                ...prev,
                [change.cartItemId]: { checked: true, covered: false, error: null, distanceKm: null },
              }))
              return
            }
          }
        }
      }
      await onFulfillmentModesSave(changes)
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }, [onFulfillmentModesSave, modalDrafts, servicesWithChoice, serviceLines, validateServiceAddress])

  const anyServiceRequiresCustomerAddress = serviceLines.some(
    (l) => l.fulfillmentMode === "customer_location"
  )
  const anyServiceRequiresOnSite = serviceLines.some(
    (l) => l.fulfillmentMode === "on_site" || !l.fulfillmentMode
  )

  const getModeLabel = (mode: string) => {
    if (mode === "customer_location") return "No meu endereço"
    return "No estabelecimento"
  }

  const renderProductsFulfillment = () => {
    if (!hasProducts) return null
    if (requirements.hasIncompatibleFulfillmentMix) {
      return (
        <FormSection title={hasServices ? "Produtos" : "Entrega"}>
          <InfoCard
            title="Itens com formas de entrega incompatíveis"
            message="Este pedido mistura itens que só podem ser retirados com itens que só podem ser enviados. Remova ou ajuste os itens para continuar."
            color="red"
          />
        </FormSection>
      )
    }
    if (!showProductsSection) {
      return (
        <FormSection title={hasServices ? "Produtos" : "Entrega"}>
          <div className="flex items-center gap-4 py-2">
            <img
              src="https://img.dudit.com.br/static/Map.png"
              alt="Entrega"
              className="w-12 h-12 object-cover rounded-full shrink-0"
            />
            <div>
              <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">A combinar</p>
              <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">O vendedor entrará em contato para combinar a entrega.</p>
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
            <TabsList className="mb-6 px-0">
              {canShowProductDelivery && <TabsTrigger value="delivery">Entrega</TabsTrigger>}
              {canShowProductPickup && <TabsTrigger value="pickup">Retirada no local</TabsTrigger>}
            </TabsList>
          </Tabs>

          <AnimatePresence mode="wait">
            {isPickup && canShowProductPickup && (
              <motion.div key="pickup" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                <div className="flex items-stretch gap-4">
                  <img
                    src="https://img.dudit.com.br/static/Map.png"
                    alt="Retirada"
                    className="w-12 h-12 object-cover rounded-full shrink-0"
                  />
                  <div>
                    <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                      Local de retirada
                    </p>
                    <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">{partnerAddressLabel}</p>
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

          {!isPickup && canShowShipping && (carrierQuoteLoading || carrierOptions.length > 0 || Boolean(carrierError)) && (
            <div className="space-y-4">
              <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                Método de entrega
              </p>
              {carrierQuoteLoading && (
                <div className="flex items-center gap-2 text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body">
                  <Spinner size={16} />
                  <span>Calculando opções de entrega...</span>
                </div>
              )}
              {carrierOptions.map((opt) => (
                <ListItem
                  key={opt.serviceId}
                  icon={
                    <img
                      src={getCarrierBrandIcon(opt.companyName, opt.serviceName)}
                      alt={opt.companyName || "Transportadora"}
                      className="w-6 h-6 object-contain"
                    />
                  }
                  title={opt.companyName ? `${opt.companyName} - ${opt.serviceName}` : opt.serviceName}
                  description={formatDeliveryDaysRange(opt.deliveryMinDays, opt.deliveryMaxDays)}
                  onClick={() => onSelectCarrier?.(opt)}
                  className="px-4 py-3"
                  right={
                    <div className="flex items-center gap-3 shrink-0">
                      {deliveryFree ? (
                        <span className="flex items-center gap-1.5 justify-end">
                          <span className="text-sm line-through text-brand-inactive-text dark:text-dark-body font-normal">
                            {formatCurrency(Number(opt.price))} |
                          </span>
                          <span className="text-sm font-bold text-brand-green">Grátis</span>
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                          {formatCurrency(Number(opt.price))}
                        </span>
                      )}
                      <RadioButton
                        name="carrierFreightOption"
                        value={String(opt.serviceId)}
                        checked={selectedCarrierServiceId === opt.serviceId}
                        onChange={() => onSelectCarrier?.(opt)}
                      />
                    </div>
                  }
                />
              ))}
              {carrierError && !carrierQuoteLoading && (
                <p className="text-xs text-brand-red">{carrierError}</p>
              )}
            </div>
          )}
        </div>
      </FormSection>
    )
  }

  const renderServicesFulfillment = () => {
    if (!showServicesSection) return null
    return (
      <FormSection title="Serviços" hasSeparator>
        <div className="space-y-3">
          {servicesWithChoice.length > 0 && (
            <>
              {anyServiceRequiresOnSite && (
                <div className="flex items-stretch gap-4 py-2">
                  <img
                    src="https://img.dudit.com.br/static/Map.png"
                    alt="Local"
                    className="w-12 h-12 object-cover rounded-full shrink-0"
                  />
                  <div>
                    <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                      Local do atendimento no estabelecimento
                    </p>
                    <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">{partnerAddressLabel}</p>
                  </div>
                </div>
              )}

              {anyServiceRequiresCustomerAddress && (
                <div className="pt-2">
                  <AddressBlock {...addressProps} title="Seu endereço para o atendimento" />
                </div>
              )}

              <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                Forma de atendimento
              </p>

              <ListItem
                icon={ServiceIcon}
                title="Forma de atendimento"
                description="Defina onde cada serviço será realizado"
                className="px-4 py-3"
                onClick={openModal}
                showChevron
              />
            </>
          )}
        </div>
      </FormSection>
    )
  }

  return (
    <div className="space-y-3">
      {renderProductsFulfillment()}
      {renderServicesFulfillment()}
      {deliveryError && <InfoCard message={deliveryError} color="red" />}

      <DefaultModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Forma de atendimento"
        footer={
          servicesWithChoice.length > 0 ? (
            <Button variant="default" onClick={handleModalSave} disabled={saving} isLoading={saving} className="flex-1">
              Salvar
            </Button>
          ) : undefined
        }
      >
        <div className="w-full">
          <div className="flex items-center gap-4 pb-3 border-b border-brand-border dark:border-dark-border mb-1">
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body w-28 text-left">Serviços</span>
            <div className="flex-1" />
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body w-28 text-center">No estabelecimento</span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body w-28 text-center">No meu endereço</span>
          </div>

          {servicesWithChoice.map((line) => {
            const currentDraft = modalDrafts[line.lineId] || "on_site"
            return (
              <div
                key={line.lineId}
                className="flex items-center gap-4 py-3 border-b border-brand-border/50 dark:border-dark-border/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{line.displayName}</p>
                  {line.bookingSummary && (
                    <p className="text-xs text-brand-inactive-text mt-0.5">{line.bookingSummary}</p>
                  )}
                </div>
                <div className="w-28 flex justify-center">
                  <RadioButton
                    name={`modal-${line.lineId}`}
                    value="on_site"
                    checked={currentDraft === "on_site"}
                    onChange={() => handleDraftChange(line.lineId, "on_site")}
                  />
                </div>
                <div className="w-28 flex flex-col items-center justify-center">
                  <RadioButton
                    name={`modal-${line.lineId}`}
                    value="customer_location"
                    checked={currentDraft === "customer_location"}
                    onChange={() => handleDraftChange(line.lineId, "customer_location")}
                  />
                  {serviceAttendance[line.lineId]?.error && (
                    <p className="text-[10px] text-brand-red text-center mt-1 leading-tight">
                      {serviceAttendance[line.lineId].error}
                    </p>
                  )}
                  {serviceAttendance[line.lineId]?.distanceKm != null && serviceAttendance[line.lineId]?.covered && (
                    <p className="text-[10px] text-brand-inactive-text text-center mt-1">
                      {Number(serviceAttendance[line.lineId].distanceKm).toFixed(2)} km
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {servicesOnSiteOnly.map((line) => (
            <div
              key={line.lineId}
              className="flex items-center gap-4 py-3 border-b border-brand-border/50 dark:border-dark-border/50 last:border-b-0 opacity-60"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{line.displayName}</p>
                {line.bookingSummary && (
                  <p className="text-xs text-brand-inactive-text mt-0.5">{line.bookingSummary}</p>
                )}
              </div>
              <div className="w-28 flex justify-center">
                <RadioButton
                  name={`modal-${line.lineId}`}
                  value="on_site"
                  checked
                  onChange={() => { }}
                />
              </div>
              <div className="w-28 flex justify-center">
                <RadioButton
                  name={`modal-${line.lineId}`}
                  value="customer_location"
                  checked={false}
                  onChange={() => { }}
                />
              </div>
            </div>
          ))}
        </div>
      </DefaultModal>
    </div>
  )
}
