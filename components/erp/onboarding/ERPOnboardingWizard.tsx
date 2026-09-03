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
  StoreIcon,
  CheckCircleIcon,
  Check,
} from "@/lib/icons"
import { ListItem } from "@/components/reusable/ListItem"
import { Checkbox } from "@/components/reusable/Checkbox"
import { RadioButton } from "@/components/reusable/RadioButton"
import { Button } from "@/components/reusable/Button"
import Input from "@/components/reusable/Input"
import { FormCurrencyInput } from "@/components/reusable/FormCurrencyInput"
import { Spinner } from "@/components/reusable/Spinner"
import { ERPOnboardingVisuals } from "./ERPOnboardingVisuals"
import { completeERPOnboardingWizardAction } from "@/app/actions/erp/onboarding"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

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

  // Step 1: Objetivos principais (Multi-seleção)
  const [selectedGoals, setSelectedGoals] = useState<string[]>(() => {
    if (sellsServices) return ["appointments"]
    return ["whatsapp_catalog"]
  })

  // Step 2: Primeiro item (adaptado)
  const isHybrid = sellsProducts && sellsServices
  const [itemType, setItemType] = useState<"service" | "product">(
    sellsServices ? "service" : "product"
  )
  const [itemName, setItemName] = useState("")
  const [itemPrice, setItemPrice] = useState(0)

  // Link copiado
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br"
  const publicStoreUrl = partnerUrl.startsWith("http") ? partnerUrl : `${origin}${partnerUrl}`
  const totalSteps = 3

  const toggleGoal = (id: string) => {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

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
        goals: selectedGoals,
        firstItem: hasValidItem
          ? {
              name: itemName.trim(),
              price: itemPrice,
              itemType,
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
    const text = `Olá! Conheça nossa vitrine online e faça seu pedido/agendamento: ${publicStoreUrl}`
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
    if (step === 1) return "O que você quer resolver hoje?"
    if (step === 2) {
      if (itemType === "service") return "Cadastre seu principal serviço"
      return "Cadastre seu primeiro produto"
    }
    return `Tudo pronto, ${storeName || "sua loja"}!`
  }

  const getStepSubtitle = () => {
    if (step === 1) return "Selecione os objetivos principais para deixarmos seu painel organizado."
    if (step === 2) {
      if (itemType === "service") return "Apenas o nome e o valor para deixar sua página pronta para atender."
      return "Informe o nome e o valor de venda para começar a divulgar."
    }
    return "Sua vitrine já está pronta para receber pedidos e clientes."
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex h-screen w-full bg-[#022C2B] p-4 md:p-6 items-stretch overflow-hidden font-sans relative animate-fadeIn">
        <div className="absolute inset-0 opacity-5 pointer-events-none" />

        {/* Esquerda: Formulário / Wizard (Exatamente igual ao padrão do cadastro de parceiro) */}
        <div className="w-full lg:w-[45%] xl:w-[40%] bg-white dark:bg-dark-surface rounded-2xl flex flex-col p-6 overflow-hidden z-20 shadow-2xl relative">
          <div className="flex justify-between items-center mb-4 px-2 shrink-0">
            <Link href="/erp/inicio" onClick={(e) => { e.preventDefault(); onClose() }}>
              <img
                src="https://img.dudit.com.br/static/Logo.png"
                alt="Dudit"
                width={90}
                height={28}
                className="h-7 w-auto hover:opacity-80 transition-opacity"
              />
            </Link>
            <button
              onClick={onClose}
              className="text-xs font-semibold text-gray-900 dark:text-gray-100 hover:text-brand-green transition-colors cursor-pointer"
            >
              Fazer mais tarde
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center overflow-y-auto scrollbar-hide px-2">
            <div className="w-full max-w-md mx-auto">
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

                  {/* STEP 1: OBJETIVOS PRINCIPAIS COM CHECKBOX */}
                  {step === 1 && (
                    <div className="space-y-3">
                      {sellsServices && (
                        <>
                          <ListItem
                            icon={CalendarIcon}
                            title="Organizar meus agendamentos e clientes"
                            description="Controlar horários e evitar confusão de atendimento no WhatsApp."
                            className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                            onClick={() => toggleGoal("appointments")}
                            right={
                              <Checkbox
                                checked={selectedGoals.includes("appointments")}
                                onChange={() => toggleGoal("appointments")}
                              />
                            }
                          />

                          <ListItem
                            icon={WhatsappIcon}
                            title="Divulgar serviços com link no WhatsApp"
                            description="Mandar catálogo com fotos e preços onde o cliente escolhe o serviço."
                            className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                            onClick={() => toggleGoal("whatsapp_services")}
                            right={
                              <Checkbox
                                checked={selectedGoals.includes("whatsapp_services")}
                                onChange={() => toggleGoal("whatsapp_services")}
                              />
                            }
                          />
                        </>
                      )}

                      {sellsProducts && (
                        <>
                          <ListItem
                            icon={ShoppingBagIcon}
                            title="Montar catálogo online para pedidos"
                            description="Enviar meu link com produtos e receber pedidos organizados no WhatsApp."
                            className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                            onClick={() => toggleGoal("whatsapp_catalog")}
                            right={
                              <Checkbox
                                checked={selectedGoals.includes("whatsapp_catalog")}
                                onChange={() => toggleGoal("whatsapp_catalog")}
                              />
                            }
                          />

                          {businessMode === "erp" && (
                            <ListItem
                              icon={CashierIcon}
                              title="Usar Frente de Caixa (PDV) no balcão"
                              description="Registrar vendas rápidas no computador para clientes presenciais."
                              className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                              onClick={() => toggleGoal("pos")}
                              right={
                                <Checkbox
                                  checked={selectedGoals.includes("pos")}
                                  onChange={() => toggleGoal("pos")}
                                />
                              }
                            />
                          )}
                        </>
                      )}

                      {/* Opção Comum a Todos */}
                      <ListItem
                        icon={MoneyIcon}
                        title="Controlar entradas e faturamento do caixa"
                        description="Saber quanto faturei no mês sem precisar de caderninho de anotação."
                        className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                        onClick={() => toggleGoal("financial")}
                        right={
                          <Checkbox
                            checked={selectedGoals.includes("financial")}
                            onChange={() => toggleGoal("financial")}
                          />
                        }
                      />

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
                              icon={WrenchIcon}
                              title="Serviço"
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
                            <ListItem
                              icon={ShoppingBagIcon}
                              title="Produto"
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
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <Input
                          label={itemType === "service" ? "Nome do Serviço" : "Nome do Produto"}
                          placeholder={
                            itemType === "service"
                              ? "Ex: Corte Masculino, Manicure Completa, Consulta..."
                              : "Ex: Bolo de Pote, Camiseta Básica, Trufa de Chocolate..."
                          }
                          value={itemName}
                          onChange={(e) => setItemName(e.target.value)}
                          autoFocus
                        />

                        <FormCurrencyInput
                          label={itemType === "service" ? "Valor cobrado (R$)" : "Preço de venda (R$)"}
                          value={itemPrice}
                          onChange={(val) => setItemPrice(val)}
                          placeholder="0,00"
                        />
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
        <ERPOnboardingVisuals currentStep={step} totalSteps={totalSteps} />
      </div>
    </Portal>
  )
}
