"use client"

import React from "react"
import { DefaultModal, Button } from "@/components/reusable"
import { CopyIcon, XIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

interface PixQrDisplayModalProps {
  isOpen: boolean
  onClose: () => void
  qrCode: string
  payload: string
  amount: number
  onConfirmPayment?: () => void
  isConfirming?: boolean
  onVerifyPayment?: () => void
  isVerifying?: boolean
  onSendWhatsApp?: () => void
}

export function PixQrDisplayModal({
  isOpen,
  onClose,
  qrCode,
  payload,
  amount,
  onConfirmPayment,
  isConfirming = false,
  onVerifyPayment,
  isVerifying = false,
  onSendWhatsApp,
}: PixQrDisplayModalProps) {
  const { toast } = useToast()

  const handleCopy = () => {
    navigator.clipboard.writeText(payload)
    toast({
      title: "Código Copiado",
      description: "O código Pix Copia e Cola foi copiado para a área de transferência.",
    })
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      hideHeader
      maxWidth="md"
    >
      <div className="relative flex flex-col items-center justify-start pt-6 pb-2 w-full text-center">
        {/* Custom Close Button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 p-2 hover:bg-gray-100 dark:hover:bg-dark-border/40 rounded-full text-brand-inactive-text dark:text-dark-body hover:text-brand-dark transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>

        {/* Pix Logo Icon */}
        <div className="w-14 h-14 bg-gray-50 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-full flex justify-center items-center mb-5 shrink-0 shadow-sm">
          <img
            src="https://img.dudit.com.br/static/icons/payments/Pix.png"
            alt="Pix"
            className="w-7 h-7 object-contain"
            onError={(e) => {
              // Fallback to text/blank if image fails to load
              e.currentTarget.style.display = "none"
            }}
          />
        </div>

        {/* Header Text */}
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-1.5 px-4">
          Agora é só pagar com Pix
        </h3>
        <p className="text-xs text-brand-inactive-text dark:text-dark-body max-w-xs mb-6 leading-relaxed">
          É rapidinho: escaneie o QR Code ou copie o código Pix e pague pelo app do seu banco.
        </p>

        {/* QR Code Container */}
        <div className="w-56 h-56 p-3 bg-white rounded-2xl border border-brand-border shadow-sm flex items-center justify-center mb-4 overflow-hidden">
          <img
            src={qrCode}
            alt="PIX QR Code"
            className="w-full h-full object-contain mix-blend-multiply"
          />
        </div>

        {/* Amount Display */}
        <div className="text-2xl font-black text-brand-green mb-6">
          {formatCurrency(amount)}
        </div>

        {/* Separator */}
        <div className="w-full flex items-center gap-3 mb-4">
          <div className="flex-1 h-[1px] bg-brand-border dark:bg-dark-border/40"></div>
          <span className="text-[10px] text-brand-inactive-text uppercase font-bold tracking-wider shrink-0">
            ou copie manualmente
          </span>
          <div className="flex-1 h-[1px] bg-brand-border dark:bg-dark-border/40"></div>
        </div>

        {/* Copy Field */}
        <div className="flex gap-2 w-full mb-6">
          <input
            type="text"
            readOnly
            value={payload}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-border/40 text-xs border border-brand-border font-mono truncate outline-none text-brand-inactive-text"
          />
          <Button
            variant="outline"
            onClick={handleCopy}
            className="shrink-0 h-[38px] w-[38px] flex items-center justify-center p-0 border-brand-border"
          >
            <CopyIcon size={16} />
          </Button>
        </div>

        {onVerifyPayment && (
          <Button
            variant="filled"
            onClick={onVerifyPayment}
            isLoading={isVerifying}
            className="w-full h-12 flex items-center justify-center font-bold text-sm bg-brand-green hover:bg-brand-green/90 text-white rounded-xl shadow-sm"
          >
            Verificar pagamento
          </Button>
        )}

        {onConfirmPayment && (
          <Button
            variant="filled"
            onClick={onConfirmPayment}
            isLoading={isConfirming}
            className="w-full h-12 flex items-center justify-center font-bold text-sm bg-brand-green hover:bg-brand-green/90 text-white rounded-xl shadow-sm"
          >
            Pagamento Recebido
          </Button>
        )}

        {onSendWhatsApp && (
          <Button
            variant="outline"
            onClick={onSendWhatsApp}
            className="w-full h-12 mt-3 flex items-center justify-center font-bold text-sm border-brand-border text-brand-dark rounded-xl shadow-sm"
          >
            Enviar via WhatsApp
          </Button>
        )}
      </div>
    </DefaultModal>
  )
}
