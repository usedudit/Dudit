"use client"

import React, { useState } from "react"
import { DefaultModal, Button, Separator, Input } from "@/components/reusable"
import { CheckCircleIcon, CopyIcon, XIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

interface PixQrDisplayModalProps {
    isOpen: boolean
    onClose: () => void
    qrCode: string
    payload: string
    amount: number
    subtitle?: string
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
    subtitle,
    onConfirmPayment,
    isConfirming = false,
    onVerifyPayment,
    isVerifying = false,
    onSendWhatsApp,
}: PixQrDisplayModalProps) {
    const { toast } = useToast()
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(payload)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
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
            maxWidth="lg"
        >
            <div className="relative flex flex-col items-center justify-start pt-6 pb-2 w-full text-center">
                {/* Pix Logo Icon */}
                <div className="w-16 h-16 bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-full flex justify-center items-center mb-6">
                    <img
                        src="https://img.dudit.com.br/static/icons/payments/Pix.png"
                        alt="Pix"
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                            // Fallback to text/blank if image fails to load
                            e.currentTarget.style.display = "none"
                        }}
                    />
                </div>

                <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading text-center mb-2">
                    Agora é só pagar com Pix
                </h1>
                <p className="text-md text-brand-inactive-text dark:text-dark-body text-center max-w-md mb-4">
                    É rapidinho: escaneie o QR Code ou copie o código Pix e pague pelo app do seu banco.
                </p>

                {/* QR Code Container */}
                <div className="w-64 h-64 p-2 bg-transparent flex items-center justify-center isolate">
                    <img
                        src={qrCode}
                        alt="PIX QR Code"
                        className="w-full h-full object-contain mix-blend-multiply"
                    />
                </div>

                {/* Amount Display */}
                <div className="mt-4 flex flex-col items-center">
                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                    {subtitle && (
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">{subtitle}</span>
                    )}
                </div>

                {/* Separator */}
                <div className="w-full max-w-md">
                    <div className="flex items-center gap-4 mb-6">
                        <Separator className="flex-1" />
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">ou copie manualmente</span>
                        <Separator className="flex-1" />
                    </div>
                </div>

                {/* Copy Field */}
                <div className="flex gap-2 w-full mb-6">
                    <Input
                        readOnly
                        value={payload}
                        variant="full-rounded"
                    />
                    <Button
                        variant="outline"
                        onClick={handleCopy}
                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                    >
                        {copied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                    </Button>
                </div>

                {onVerifyPayment && (
                    <Button
                        variant="link"
                        onClick={onVerifyPayment}
                        isLoading={isVerifying}
                        className="w-full h-12 flex mb-6"
                    >
                        Verificar pagamento
                    </Button>
                )}

                {onConfirmPayment && (
                    <Button
                        onClick={onConfirmPayment}
                        isLoading={isConfirming}
                        className="w-full h-12 flex"
                    >
                        Pagamento Recebido
                    </Button>
                )}

                {onSendWhatsApp && (
                    <Button
                        variant="outline"
                        onClick={onSendWhatsApp}
                        className="w-full h-12 flex"
                    >
                        Enviar via WhatsApp
                    </Button>
                )}
            </div>
        </DefaultModal>
    )
}
