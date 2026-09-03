"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Scissors,
  ShoppingBag,
  Store,
  Calendar,
  MessageCircle,
  Wallet,
  QrCode,
  CreditCard,
  CheckCircle2,
  Copy,
  ExternalLink,
  X,
  ChevronRight,
  ArrowRight,
  Check,
  Clock,
  DollarSign,
  Sparkles,
} from "lucide-react"
import Portal from "@/components/Portal"
import { Button, Spinner, Input } from "@/components/reusable"
import { FormCurrencyInput } from "@/components/reusable/FormCurrencyInput"
import { ERPOnboardingVisuals } from "./ERPOnboardingVisuals"
import { completeERPOnboardingWizardAction } from "@/app/actions/erp/onboarding"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

export interface ERPOnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  storeName: string
  partnerUrl: string
  onSuccess?: () => void
}

type BusinessType = "services" | "products" | "hybrid"
type GoalType = "appointments" | "whatsapp_catalog" | "cash_control"
type PaymentPref = "pix" | "card_machine" | "online"

const DURATION_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hora", value: 60 },
  { label: "1h 30m", value: 90 },
]

export function ERPOnboardingWizard({
  isOpen,
  onClose,
  partnerId,
  storeName,
  partnerUrl,
  onSuccess,
}: ERPOnboardingWizardProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 1: Tipo de negócio
  const [businessType, setBusinessType] = useState<BusinessType>("services")

  // Step 2: Objetivo principal
  const [goal, setGoal] = useState<GoalType>("appointments")

  // Step 3: Primeiro item
  const [itemType, setItemType] = useState<"service" | "product">("service")
  const [itemName, setItemName] = useState("")
  const [itemPrice, setItemPrice] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(45)

  // Step 4: Recebimento
  const [paymentPreference, setPaymentPreference] = useState<PaymentPref>("pix")
  const [pixKey, setPixKey] = useState("")

  // Link copiado
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br"
  const publicStoreUrl = partnerUrl.startsWith("http") ? partnerUrl : `${origin}${partnerUrl}`

  const nextStep = () => {
    setDirection(1)
    setStep((s) => Math.min(s + 1, 5))
  }

  const prevStep = () => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleFinishSetup = async () => {
    setIsSubmitting(true)
    try {
      const hasValidItem = itemName.trim().length > 0 && itemPrice > 0

      const res = await completeERPOnboardingWizardAction({
        partnerId,
        businessType,
        goal,
        firstItem: hasValidItem
          ? {
              name: itemName.trim(),
              price: itemPrice,
              durationMinutes: businessType === "products" ? undefined : durationMinutes,
            }
          : null,
        paymentPreference,
        pixKey: paymentPreference === "pix" && pixKey.trim() ? pixKey.trim() : null,
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

      toast({
        title: "Tudo pronto! 🚀",
        description: "Sua Dudit foi configurada com sucesso.",
      })

      setDirection(1)
      setStep(5)
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
        description: "Pronto para colar e enviar aos seus clientes.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Erro ao copiar link", variant: "destructive" })
    }
  }

  const handleShareWhatsApp = () => {
    const text = `Olá! Conheça nossa vitrine e faça seu agendamento/pedido online por aqui: ${publicStoreUrl}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  }

  const handleCloseAndRefresh = () => {
    onClose()
    if (onSuccess) {
      onSuccess()
    } else {
      router.refresh()
    }
  }

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 30 : -30, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -30 : 30, opacity: 0 }),
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-4xl bg-[#022C2B] rounded-3xl shadow-2xl flex flex-col lg:flex-row overflow-hidden border border-white/10 max-h-[94vh]">
          
          {/* Coluna Esquerda: Conteúdo do Passo */}
          <div className="w-full lg:w-[58%] bg-white dark:bg-dark-surface p-6 sm:p-8 flex flex-col justify-between overflow-y-auto scrollbar-hide rounded-3xl z-10">
            <div>
              {/* Header do Passo (Progresso e Fechar) */}
              {step < 5 && (
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex-1 flex gap-1.5">
                    {[1, 2, 3, 4].map((s) => (
                      <div
                        key={s}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          s <= step ? "bg-brand-green" : "bg-gray-100 dark:bg-dark-border"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body shrink-0">
                    Etapa {step} de 4
                  </span>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Fazer mais tarde"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait" custom={direction}>
                {/* STEP 1: TIPO DE NEGÓCIO */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        Qual é o seu tipo de negócio?
                      </h2>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Personalizamos a Dudit para exibir só as funções que você realmente vai usar.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* Serviços */}
                      <div
                        onClick={() => {
                          setBusinessType("services")
                          setItemType("service")
                          setGoal("appointments")
                        }}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          businessType === "services"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <Scissors size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Presto Serviços & Atendimentos
                            </span>
                            {businessType === "services" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Barbearia, manicure, estética, mecânica, personal, consultoria, reformas...
                          </p>
                          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                            Agenda + Catálogo
                          </span>
                        </div>
                      </div>

                      {/* Produtos */}
                      <div
                        onClick={() => {
                          setBusinessType("products")
                          setItemType("product")
                          setGoal("whatsapp_catalog")
                        }}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          businessType === "products"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <ShoppingBag size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Vendo Produtos Físicos
                            </span>
                            {businessType === "products" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Roupas, doces, eletrônicos, artesanato, mercadinho, cosméticos...
                          </p>
                          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                            Estoque + Pedidos
                          </span>
                        </div>
                      </div>

                      {/* Ambos */}
                      <div
                        onClick={() => {
                          setBusinessType("hybrid")
                          setItemType("service")
                          setGoal("appointments")
                        }}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          businessType === "hybrid"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <Store size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Os dois (Produtos e Serviços)
                            </span>
                            {businessType === "hybrid" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Vendo produtos para levar e também atendo clientes no meu espaço.
                          </p>
                          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                            Completo
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: OBJETIVO PRINCIPAL */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        O que você mais quer resolver hoje?
                      </h2>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Escolha o que mais tira sua paz no dia a dia para focarmos nisso primeiro.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div
                        onClick={() => setGoal("appointments")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          goal === "appointments"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <Calendar size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Organizar agendamentos e horários
                            </span>
                            {goal === "appointments" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Acabar com confusão de horário e mensagens perdidas no WhatsApp.
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => setGoal("whatsapp_catalog")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          goal === "whatsapp_catalog"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <MessageCircle size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Catálogo profissional para WhatsApp
                            </span>
                            {goal === "whatsapp_catalog" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Mandar um link com fotos e preços onde o cliente escolhe e já me chama com o pedido pronto.
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => setGoal("cash_control")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          goal === "cash_control"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <Wallet size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Controlar entradas, saídas e faturamento
                            </span>
                            {goal === "cash_control" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 leading-relaxed">
                            Saber exatamente quanto faturei no mês sem precisar de caderninho ou planilhas difíceis.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: PRIMEIRO ITEM */}
                {step === 3 && (
                  <motion.div
                    key="step-3"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        {businessType === "products"
                          ? "Cadastre seu 1º produto"
                          : "Cadastre seu 1º serviço"}
                      </h2>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Em 30 segundos sua vitrine já vai ter um item para seus clientes verem.
                      </p>
                    </div>

                    {/* Se híbrido, permite escolher entre cadastrar produto ou serviço */}
                    {businessType === "hybrid" && (
                      <div className="flex gap-2 p-1 bg-brand-gray dark:bg-dark-border/40 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setItemType("service")}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            itemType === "service"
                              ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-white shadow-sm"
                              : "text-brand-inactive-text dark:text-dark-body"
                          }`}
                        >
                          Cadastrar Serviço
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemType("product")}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            itemType === "product"
                              ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-white shadow-sm"
                              : "text-brand-inactive-text dark:text-dark-body"
                          }`}
                        >
                          Cadastrar Produto
                        </button>
                      </div>
                    )}

                    <div className="space-y-4 pt-1">
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FormCurrencyInput
                            label="Valor cobrado (R$)"
                            value={itemPrice}
                            onChange={(val) => setItemPrice(val)}
                            placeholder="0,00"
                          />
                        </div>

                        {itemType === "service" && (
                          <div>
                            <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                              Duração estimada
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {DURATION_OPTIONS.slice(0, 3).map((dur) => (
                                <button
                                  key={dur.value}
                                  type="button"
                                  onClick={() => setDurationMinutes(dur.value)}
                                  className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all ${
                                    durationMinutes === dur.value
                                      ? "border-brand-green bg-brand-green/10 text-brand-green"
                                      : "border-brand-border dark:border-dark-border text-brand-inactive-text hover:border-gray-400"
                                  }`}
                                >
                                  {dur.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 4: FORMA DE RECEBIMENTO */}
                {step === 4 && (
                  <motion.div
                    key="step-4"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        Como você prefere receber?
                      </h2>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Seus clientes pagam você na hora. Sem taxas da plataforma.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* Pix na hora */}
                      <div
                        onClick={() => setPaymentPreference("pix")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                          paymentPreference === "pix"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                            <QrCode size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                Chave Pix na hora
                              </span>
                              {paymentPreference === "pix" && (
                                <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                              Dinheiro cai direto na sua conta bancária sem intermediários.
                            </p>
                          </div>
                        </div>

                        {paymentPreference === "pix" && (
                          <div className="mt-3 pt-3 border-t border-brand-green/20 space-y-2">
                            <Input
                              label="Sua Chave Pix (opcional)"
                              placeholder="CPF, Celular, E-mail ou Chave Aleatória"
                              value={pixKey}
                              onChange={(e) => setPixKey(e.target.value)}
                              autoFocus
                            />
                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                              💡 Seus clientes poderão copiar sua chave Pix direto pela sua vitrine.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Maquininha / Dinheiro */}
                      <div
                        onClick={() => setPaymentPreference("card_machine")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          paymentPreference === "card_machine"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <CreditCard size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Máquina de Cartão ou Dinheiro
                            </span>
                            {paymentPreference === "card_machine" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                            Cobro na maquininha ou recebo em espécie no atendimento/entrega.
                          </p>
                        </div>
                      </div>

                      {/* Online Mercado Pago */}
                      <div
                        onClick={() => setPaymentPreference("online")}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                          paymentPreference === "online"
                            ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10"
                            : "border-brand-border dark:border-dark-border hover:border-brand-green/50 bg-white dark:bg-dark-background"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                          <DollarSign size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              Receber pelo site (Mercado Pago)
                            </span>
                            {paymentPreference === "online" && (
                              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                            Conecte sua conta nas configurações para receber no Pix automático e cartão parcelado.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 5: TELA DE CELEBRAÇÃO & SUCESSO */}
                {step === 5 && (
                  <motion.div
                    key="step-5"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                    className="space-y-6 py-2"
                  >
                    <div className="text-center sm:text-left">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-brand-green/20 text-brand-green rounded-full text-xs font-bold mb-3">
                        <Sparkles size={14} />
                        Configuração Concluída
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        Parabéns! Sua Dudit está pronta! 🎉
                      </h2>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2 leading-relaxed">
                        Seu negócio já tem um catálogo online exclusivo para você divulgar para seus clientes e fechar agendamentos.
                      </p>
                    </div>

                    {/* Box do Link Público */}
                    <div className="p-4 bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-2xl space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                          Seu link para compartilhar:
                        </span>
                        <button
                          onClick={handleCopyLink}
                          className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy size={13} />
                          {copied ? "Copiado!" : "Copiar Link"}
                        </button>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-xs font-mono text-brand-dark dark:text-dark-heading truncate">
                        {publicStoreUrl}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleShareWhatsApp}
                          className="flex-1 gap-2 border-green-600/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
                        >
                          <MessageCircle size={15} />
                          Testar no WhatsApp
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(publicStoreUrl, "_blank")}
                          className="gap-1.5 text-xs text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border"
                        >
                          <ExternalLink size={14} />
                          Abrir Vitrine
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Rodapé com botões de navegação */}
            <div className="pt-6 border-t border-brand-border dark:border-dark-border mt-6">
              {step < 5 ? (
                <div className="flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      disabled={isSubmitting}
                      className="px-5 bg-transparent"
                    >
                      Voltar
                    </Button>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-xs font-semibold text-brand-inactive-text hover:text-brand-dark dark:hover:text-white transition-colors"
                    >
                      Fazer mais tarde
                    </button>
                  )}

                  {step === 3 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={nextStep}
                        className="text-xs font-semibold text-brand-inactive-text hover:text-brand-dark dark:hover:text-white px-2 py-2 transition-colors"
                      >
                        Pular por enquanto
                      </button>
                      <Button
                        onClick={nextStep}
                        className="px-6 gap-2"
                      >
                        Continuar
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  ) : step === 4 ? (
                    <Button
                      onClick={handleFinishSetup}
                      disabled={isSubmitting}
                      className="px-6 gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner size={16} />
                          Configurando...
                        </>
                      ) : (
                        <>
                          Concluir e Ver Minha Página
                          <Check size={16} />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={nextStep}
                      className="px-6 gap-2"
                    >
                      Continuar
                      <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  onClick={handleCloseAndRefresh}
                  className="w-full py-3 text-base font-bold gap-2"
                >
                  Ir para meu Painel
                  <ArrowRight size={18} />
                </Button>
              )}
            </div>
          </div>

          {/* Coluna Direita: Visual com Mascote e Blobs (Desktop) */}
          <div className="w-full lg:w-[42%] bg-[#022C2B] hidden lg:flex">
            <ERPOnboardingVisuals currentStep={step} />
          </div>
        </div>
      </div>
    </Portal>
  )
}
