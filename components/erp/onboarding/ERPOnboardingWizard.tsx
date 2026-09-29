"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import Portal from "@/components/Portal"
import {
  CalendarIcon,
  WhatsappIcon,
  ShoppingBagIcon,
  WrenchIcon,
  CashierIcon,
  MoneyIcon,
  CopyIcon,
  CameraIcon,
  PinIcon,
  PackageIcon,
  Package,
  MegaphoneIcon,
  Users,
  ChartIcon,
} from "@/lib/icons"
import { ListItem } from "@/components/reusable/ListItem"
import { RadioButton } from "@/components/reusable/RadioButton"
import { Button } from "@/components/reusable/Button"
import Input from "@/components/reusable/Input"
import { Spinner } from "@/components/reusable/Spinner"
import { ERPOnboardingVisuals } from "./ERPOnboardingVisuals"
import { completeERPOnboardingWizardAction } from "@/app/actions/erp/onboarding"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { MoneyInput } from "@/components/reusable"
import { useModalLayer } from "@/lib/modal-stack"

export interface ERPOnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  storeName: string
  partnerUrl: string
  businessMode?: "desapego" | "quick" | "showcase" | "erp"
  sellsProducts?: boolean
  sellsServices?: boolean
  onSuccess?: () => void
}

const variants = {
  enter: (d: number) => ({ x: d > 0 ? 20 : -20, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d < 0 ? 20 : -20, opacity: 0 }),
}

export function ERPOnboardingWizard({
  isOpen,
  onClose,
  partnerId,
  storeName,
  partnerUrl,
  businessMode = "quick",
  sellsProducts = true,
  sellsServices = false,
  onSuccess,
}: ERPOnboardingWizardProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDesapego = businessMode === "desapego"
  const isERP = businessMode === "erp"
  const isVitrine = !isDesapego && !isERP

  // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  // Objetivos principais derivados das props (para envio na ação)
  const goals = React.useMemo(() => {
    const g: string[] = []
    if (isDesapego) {
      if (sellsProducts) g.push("products")
      if (sellsServices) g.push("services")
      return g.length > 0 ? g : ["products"]
    }
    if (isERP) {
      g.push("pos")
      if (sellsProducts) g.push("stock_control")
      g.push("financial_control")
      if (sellsServices) g.push("appointments_team")
      g.push("performance_reports")
      return g
    }
    // Vitrine (quick / showcase)
    g.push("dudit_orders", "payment_methods", "coupons_promotions", "customers_management")
    if (sellsServices) g.push("appointments")
    return g
  }, [isDesapego, isERP, sellsProducts, sellsServices])

  // Step 2: Primeiro item (adaptado)
  const hasProducts = isDesapego ? sellsProducts : sellsProducts
  const hasServices = isDesapego ? sellsServices : sellsServices
  const isHybrid = hasProducts && hasServices

  const [itemType, setItemType] = useState<"service" | "product">(() => {
    if (isDesapego) {
      if (sellsServices && !sellsProducts) return "service"
      return "product"
    }
    return sellsServices ? "service" : "product"
  })
  const [itemName, setItemName] = useState("")
  const [itemPrice, setItemPrice] = useState(0)
  const [serviceDuration, setServiceDuration] = useState<number>(45)

  // Link copiado
  const [copied, setCopied] = useState(false)

  // Travar o scroll da página enquanto o wrapper estiver aberto
  React.useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br"
  const publicStoreUrl = partnerUrl.startsWith("http") ? partnerUrl : `${origin}${partnerUrl}`
  const totalSteps = 3

  const prevStep = () => {
    setDirection(-1)
    if (step > 1) {
      setStep((s) => s - 1)
    } else {
      onClose()
    }
  }

  const handleNextFromGoals = () => {
    setDirection(1)
    setStep(2)
  }

  const handleFinish = async (skipItem = false) => {
    setIsSubmitting(true)
    try {
      const hasValidItem = !skipItem && itemName.trim().length > 0 && itemPrice > 0

      const res = await completeERPOnboardingWizardAction({
        partnerId,
        goals,
        firstItem: hasValidItem
          ? {
            name: itemName.trim(),
            price: itemPrice,
            itemType,
            durationMinutes: itemType === "service" ? (Number(serviceDuration) || 45) : undefined,
          }
          : null,
      })

      if (!res.success) {
        toast({
          title: "Erro ao salvar",
          description: res.error || "Não foi possível concluir as configurações.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      setDirection(1)
      setStep(3)
    } catch (err: any) {
      toast({
        title: "Erro inesperado",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl)
      setCopied(true)
      toast({
        title: "Link copiado! 📋",
        description: "O link da sua vitrine foi copiado para a área de transferência.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" })
    }
  }

  const handleShareWhatsApp = () => {
    const text = isDesapego
      ? `Olá! Dá uma olhada nos meus desapegos e itens à venda: ${publicStoreUrl}`
      : `Olá! Conheça nossa vitrine online e faça seu pedido/agendamento: ${publicStoreUrl}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  }

  const handleCloseAndGoToDashboard = () => {
    onClose()
    if (onSuccess) {
      onSuccess()
    } else {
      router.refresh()
    }
  }

  const getStepTitle = () => {
    if (step === 1) {
      if (isDesapego) return "O que você deseja anunciar?"
      if (isERP) return "O que você mais precisa gerenciar hoje?"
      return "O que você quer resolver hoje?"
    }
    if (step === 2) {
      if (isDesapego) {
        return itemType === "service" ? "Cadastre seu primeiro serviço" : "Cadastre seu primeiro produto ou desapego"
      }
      if (itemType === "service") return "Cadastre seu principal serviço"
      return "Cadastre seu primeiro produto"
    }
    if (isDesapego) return `Tudo pronto, ${storeName || "seu perfil"}!`
    return `Tudo pronto, ${storeName || "sua loja"}!`
  }

  const getStepSubtitle = () => {
    if (step === 1) {
      if (isDesapego) return "Escolha o que deseja divulgar no seu perfil para começar a vender."
      if (isERP) return "Selecione as ferramentas essenciais para deixarmos seu painel organizado."
      return "Selecione os objetivos principais para deixarmos seu catálogo pronto."
    }
    if (step === 2) {
      if (isDesapego) {
        return itemType === "service"
          ? "Apenas o nome, valor e duração estimada para começar a divulgar."
          : "Informe o nome e o valor de desapego para começar a divulgar."
      }
      if (itemType === "service") return "Apenas o nome, valor e duração estimada para deixar sua agenda pronta."
      return "Informe o nome e o valor de venda para começar a divulgar."
    }
    if (isDesapego) return "Sua página de desapegos já está pronta para receber compradores."
    return "Sua vitrine já está pronta para receber pedidos e clientes."
  }

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[130] flex h-screen w-screen bg-[#022C2B] p-3 md:p-6 items-stretch overflow-hidden font-sans"
            style={{ zIndex }}
          >
            <div className="absolute inset-0 opacity-5 pointer-events-none" />

            {/* Esquerda: Formulário / Wizard (Exatamente igual ao padrão do cadastro de parceiro) */}
            <div className="w-full lg:w-[45%] xl:w-[40%] bg-white dark:bg-dark-surface rounded-2xl flex flex-col p-6 overflow-hidden z-20 shadow-2xl relative h-full">
              <div className="flex justify-between items-center mb-4 px-2 shrink-0">
                <Link href="/erp/inicio" onClick={(e) => { e.preventDefault(); onClose() }}>
                  <img
                    src="https://img.dudit.com.br/static/Logo.png"
                    alt="Dudit"
                    width={90}
                    height={28}
                    className="h-7 w-auto"
                  />
                </Link>
                <button
                  onClick={onClose}
                  className="text-xs font-semibold text-gray-900 dark:text-gray-100 hover:text-brand-green transition-colors cursor-pointer"
                >
                  Fazer mais tarde
                </button>
              </div>

              <div className="flex-1 flex flex-col justify-between overflow-y-auto custom-scrollbar px-2">
                <div className="w-full max-w-md mx-auto my-auto py-2">
                  {/* Barra de Progresso Fina */}
                  <div className="flex gap-2 mb-6">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                      <motion.div
                        key={i}
                        layout
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors duration-500",
                          i + 1 <= step ? "bg-brand-green" : "bg-gray-100 dark:bg-dark-border"
                        )}
                      />
                    ))}
                  </div>

                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                      key={step}
                      custom={direction}
                      variants={variants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ type: "tween", duration: 0.2 }}
                      className="w-full"
                    >
                      <div className="mb-6">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                          {getStepTitle()}
                        </h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
                          {getStepSubtitle()}
                        </p>
                      </div>

                      {/* STEP 1: OBJETIVOS PRINCIPAIS INFORMATIVOS (sem interação) */}
                      {step === 1 && (
                        <div className="space-y-3">
                          {/* MODO DESAPEGO */}
                          {isDesapego && (
                            <>
                              <ListItem
                                icon={Package}
                                title="Anunciar produtos ou desapegos"
                                description="Venda itens novos, usados, eletrônicos, roupas ou produtos da sua loja"
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              <ListItem
                                icon={WrenchIcon}
                                title="Anunciar serviço ou atendimento"
                                description="Divulgue seus serviços, agendamentos, consultoria, manutenções ou procedimentos"
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />
                            </>
                          )}

                          {/* MODO VITRINE (QUICK / SHOWCASE) */}
                          {!isDesapego && !isERP && (
                            <>
                              <ListItem
                                icon={ShoppingBagIcon}
                                title="Receber pedidos pela Dudit"
                                description="Ativar fluxo de pedidos direto pela plataforma, sem precisar repassar no WhatsApp."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              <ListItem
                                icon={MoneyIcon}
                                title="Configurar formas de pagamento"
                                description="Mostrar aos clientes seus meios de pagamento aceitos (Pix, cartão, dinheiro)."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              <ListItem
                                icon={MegaphoneIcon}
                                title="Gerenciar cupons e promoções"
                                description="Criar cupons de desconto e campanhas para atrair mais clientes."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              <ListItem
                                icon={Users}
                                title="Gerenciar clientes"
                                description="Acompanhar cadastros, histórico de compras e fidelizar seu público."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              {sellsServices && (
                                <ListItem
                                  icon={CalendarIcon}
                                  title="Organizar agendamentos e horários"
                                  description="Clientes escolhem data e hora pelo link, evitando desencontros no WhatsApp."
                                  className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                                />
                              )}
                            </>
                          )}

                          {/* MODO ERP (GESTÃO COMPLETA) */}
                          {isERP && (
                            <>
                              <ListItem
                                icon={CashierIcon}
                                title="Frente de Caixa (PDV) e vendas no balcão"
                                description="Registrar vendas rápidas no computador e imprimir recibos na hora."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              {sellsProducts && (
                                <ListItem
                                  icon={PackageIcon}
                                  title="Controle de estoque e reposição"
                                  description="Acompanhar entradas, saídas e estoque mínimo para evitar falta de mercadorias."
                                  className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                                />
                              )}

                              <ListItem
                                icon={MoneyIcon}
                                title="Fluxo de caixa e gestão financeira"
                                description="Controlar entradas, despesas, faturamento do mês e demonstrativo (DRE)."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />

                              {sellsServices && (
                                <ListItem
                                  icon={CalendarIcon}
                                  title="Agenda da equipe e profissionais"
                                  description="Gerenciar horários dos profissionais, comissões e fila de atendimento."
                                  className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                                />
                              )}

                              <ListItem
                                icon={ChartIcon}
                                title="Desempenho e relatórios"
                                description="Acompanhar visão geral, metas, comissões e estatísticas da equipe."
                                className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border rounded-2xl"
                              />
                            </>
                          )}

                          <div className="pt-4 flex gap-3">
                            <Button
                              type="button"
                              onClick={handleNextFromGoals}
                              className="w-full"
                            >
                              Continuar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* STEP 2: PRIMEIRO CADASTRO */}
                      {step === 2 && (
                        <div className="space-y-4">
                          {isHybrid && (
                            <div className="space-y-2 mb-2">
                              <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                O que você quer cadastrar primeiro?
                              </span>
                              <div className="grid grid-cols-2 gap-2">
                                <ListItem
                                  icon={Package}
                                  title={isDesapego ? "Produto / Desapego" : "Produto"}
                                  className="px-3 py-2.5 gap-3 border rounded-xl cursor-pointer"
                                  onClick={() => setItemType("product")}
                                  left={
                                    <RadioButton
                                      name="firstItemType"
                                      value="product"
                                      checked={itemType === "product"}
                                      onChange={() => setItemType("product")}
                                    />
                                  }
                                />
                                <ListItem
                                  icon={WrenchIcon}
                                  title={isDesapego ? "Serviço / Atendimento" : "Serviço"}
                                  className="px-3 py-2.5 gap-3 border rounded-xl cursor-pointer"
                                  onClick={() => setItemType("service")}
                                  left={
                                    <RadioButton
                                      name="firstItemType"
                                      value="service"
                                      checked={itemType === "service"}
                                      onChange={() => setItemType("service")}
                                    />
                                  }
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-4">
                            <Input
                              label={
                                isDesapego
                                  ? (itemType === "service" ? "Nome do Serviço ou Atendimento" : "Nome do item ou desapego")
                                  : itemType === "service"
                                    ? "Nome do Serviço"
                                    : "Nome do Produto"
                              }
                              placeholder={
                                isDesapego
                                  ? (itemType === "service" ? "Ex: Consultoria, Manutenção, Procedimento..." : "Ex: Tênis Nike Tam 40, Sofá 3 Lugares, iPhone 12...")
                                  : itemType === "service"
                                    ? "Ex: Corte Masculino, Manicure Completa, Consulta..."
                                    : "Ex: Bolo de Pote, Camiseta Básica, Trufa de Chocolate..."
                              }
                              value={itemName}
                              onChange={(e) => setItemName(e.target.value)}
                              autoFocus
                            />

                            <MoneyInput
                              label={
                                isDesapego
                                  ? (itemType === "service" ? "Valor cobrado (R$)" : "Valor de desapego (R$)")
                                  : itemType === "service"
                                    ? "Valor cobrado (R$)"
                                    : "Preço de venda (R$)"
                              }
                              value={itemPrice}
                              onChange={(value) => setItemPrice(value)}
                            />

                            {itemType === "service" && (
                              <div className="space-y-1.5">
                                <Input
                                  label="Tempo do serviço (minutos)"
                                  type="number"
                                  min={1}
                                  max={1440}
                                  value={serviceDuration || ""}
                                  onChange={(e) => setServiceDuration(Math.max(1, parseInt(e.target.value) || 0))}
                                  placeholder="Ex: 45"
                                />
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {[15, 30, 45, 60, 90, 120].map((mins) => (
                                    <button
                                      key={mins}
                                      type="button"
                                      onClick={() => setServiceDuration(mins)}
                                      className={cn(
                                        "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer border",
                                        serviceDuration === mins
                                          ? "bg-brand-green text-white border-brand-green"
                                          : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-body border-brand-border dark:border-dark-border hover:border-brand-green/50"
                                      )}
                                    >
                                      {mins >= 60 && mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-3 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={prevStep}
                              disabled={isSubmitting}
                              className="flex-1 bg-transparent"
                            >
                              Voltar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => handleFinish(false)}
                              disabled={isSubmitting}
                              className="flex-1"
                            >
                              {isSubmitting ? <Spinner size={20} /> : "Concluir Cadastro"}
                            </Button>
                          </div>

                          <div className="text-center pt-2">
                            <button
                              type="button"
                              onClick={() => handleFinish(true)}
                              disabled={isSubmitting}
                              className="text-xs font-semibold text-brand-inactive-text hover:text-brand-dark dark:hover:text-white transition-colors cursor-pointer"
                            >
                              Pular cadastro por enquanto
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 3: CELEBRAÇÃO & SUCESSO */}
                      {step === 3 && (
                        <div className="space-y-5">
                          <div className="p-4 bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-2xl space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                Link da sua vitrine:
                              </span>
                              <button
                                onClick={handleCopyLink}
                                className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <CopyIcon size={13} />
                                {copied ? "Copiado!" : "Copiar"}
                              </button>
                            </div>

                            <div className="p-2.5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-xs font-mono text-brand-dark dark:text-dark-heading truncate">
                              {publicStoreUrl}
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleShareWhatsApp}
                              className="w-full gap-2 border-brand-green/30 text-brand-green hover:bg-brand-green/10"
                            >
                              <WhatsappIcon size={16} />
                              Testar no WhatsApp
                            </Button>
                          </div>

                          <div className="pt-2">
                            <Button
                              type="button"
                              onClick={handleCloseAndGoToDashboard}
                              className="w-full"
                            >
                              Ir para meu Painel
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer Mobile */}
              <div className="lg:hidden mt-4 text-center text-xs text-gray-400">
                © {new Date().getFullYear()} Dudit Inc.
              </div>
            </div>

            {/* Direita: Visuais Decorativos (Idêntico ao cadastro de parceiro) */}
            <ERPOnboardingVisuals currentStep={step} totalSteps={totalSteps} businessMode={businessMode} />
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

export { ERPOnboardingWizard as ERPOnboardingWrapper }
