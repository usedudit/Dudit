import React, { useState } from "react"
import { Button, FormDropdown, MoneyInput, Input, CpfCnpjInput, EmailInput, PhoneInput } from "@/components/reusable"
import { CopyIcon, QRCodeIcon } from "@/lib/icons"
import { CompactPaymentStatusAlert } from "./CompactPaymentStatusAlert"
import { PaymentAmountLabel } from "./PaymentAmountLabel"

type PixPaymentViewProps = {
    amount: number
    onAmountChange: (value: number) => void
    calculation?: any
    baseAllocated: number
    flatAmount?: boolean
    isLoading?: boolean
    showFeeBearer?: boolean
    feeBearer?: string
    onFeeBearerChange?: (value: "merchant" | "customer") => void
    totalPaid?: number
    totalNeed?: number
    /** When provided, uses real QR generation instead of placeholder */
    onGenerateQr?: (amount: number) => Promise<{ payload: string; qrDataUrl: string } | null>
    qrData?: { payload: string; qrDataUrl: string } | null
    isGenerating?: boolean

    // New props for dynamic key entry when method has no key saved
    showKeyInputs?: boolean
    tempPixKey?: string
    onTempPixKeyChange?: (val: string) => void
    tempPixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random"
    onTempPixKeyTypeChange?: (val: any) => void
    onConfirmGenerateWithKey?: () => void
    isFreePlan?: boolean
    /** When true, hides the amount label, MoneyInput, and QR generation controls (used for inline MP flow). */
    hideQrElements?: boolean
}

export function PixPaymentView({
    amount,
    onAmountChange,
    calculation,
    baseAllocated,
    flatAmount = false,
    isLoading = false,
    showFeeBearer = false,
    feeBearer = "merchant",
    onFeeBearerChange,
    totalPaid = 0,
    totalNeed = 0,
    onGenerateQr,
    qrData,
    isGenerating = false,

    showKeyInputs = false,
    tempPixKey = "",
    onTempPixKeyChange,
    tempPixKeyType = "cpf",
    onTempPixKeyTypeChange,
    onConfirmGenerateWithKey,
    isFreePlan = false,
    hideQrElements = false,
}: PixPaymentViewProps) {
    const [localGenerated, setLocalGenerated] = useState(false)
    const generated = qrData || (localGenerated && !onGenerateQr)

    const handleGenerate = async () => {
        if (onGenerateQr) {
            await onGenerateQr(amount)
            return
        }
        setLocalGenerated(true)
    }

    return (
        <div className="flex flex-col items-center justify-start pt-0 w-full">
            <div className="w-full max-w-sm space-y-4">
                {totalNeed > 0 ? <CompactPaymentStatusAlert totalPaid={totalPaid} totalNeed={totalNeed} /> : null}
                {!hideQrElements && (
                    <>
                        <PaymentAmountLabel label="Valor a receber" calculation={calculation} baseAllocated={baseAllocated} flatAmount={flatAmount} />
                        <MoneyInput value={amount} onChange={onAmountChange} className="font-bold text-lg" />
                        {showFeeBearer && onFeeBearerChange && !flatAmount && (
                            <FormDropdown
                                label="Quem paga a taxa?"
                                value={feeBearer}
                                setValue={(v: any) => onFeeBearerChange(v)}
                                options={[
                                    { value: "merchant", label: "Empresa (absorve)" },
                                    { value: "customer", label: "Cliente (acrescenta no valor)" },
                                ]}
                            />
                        )}
                    </>
                )}
                {isLoading && (
                    <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                        Calculando valor a cobrar...
                    </div>
                )}

                {!hideQrElements && showKeyInputs && !generated ? (
                    <div className="space-y-4 text-left">
                        <h5 className="text-sm font-semibold text-brand-dark dark:text-dark-heading pt-4 border-t border-brand-border dark:border-dark-border">
                            {isFreePlan ? "Informar Chave Pix para Cobrança" : "Cadastrar Chave Pix temporária/padrão"}
                        </h5>

                        <FormDropdown
                            label="Tipo de chave"
                            placeholder="Selecione o tipo"
                            value={tempPixKeyType}
                            setValue={(val) => onTempPixKeyTypeChange?.(val)}
                            options={[
                                { value: "cpf", label: "CPF" },
                                { value: "cnpj", label: "CNPJ" },
                                { value: "email", label: "E-mail" },
                                { value: "phone", label: "Celular" },
                                { value: "random", label: "Chave Aleatória" },
                            ]}
                        />

                        {tempPixKeyType === "cpf" && (
                            <CpfCnpjInput
                                label="Chave PIX (CPF)"
                                placeholder="000.000.000-00"
                                value={tempPixKey}
                                onChange={(e) => onTempPixKeyChange?.(e.target.value)}
                                name="pix_key"
                            />
                        )}
                        {tempPixKeyType === "cnpj" && (
                            <CpfCnpjInput
                                label="Chave PIX (CNPJ)"
                                placeholder="00.000.000/0000-00"
                                value={tempPixKey}
                                onChange={(e) => onTempPixKeyChange?.(e.target.value)}
                                name="pix_key_cnpj"
                            />
                        )}
                        {tempPixKeyType === "email" && (
                            <EmailInput
                                label="Chave PIX (E-mail)"
                                placeholder="exemplo@email.com"
                                value={tempPixKey}
                                onChange={(e) => onTempPixKeyChange?.(e.target.value)}
                            />
                        )}
                        {tempPixKeyType === "phone" && (
                            <PhoneInput
                                label="Chave PIX (Celular)"
                                placeholder="(00) 00000-0000"
                                value={tempPixKey}
                                onChange={(e) => onTempPixKeyChange?.(e.target.value)}
                            />
                        )}
                        {tempPixKeyType === "random" && (
                            <Input
                                label="Chave PIX (Aleatória)"
                                placeholder="123e4567-e89b-12d3-a456-426614174000"
                                value={tempPixKey}
                                onChange={(e) => onTempPixKeyChange?.(e.target.value)}
                            />
                        )}

                        <Button
                            variant="filled"
                            className="w-full h-12 mt-2"
                            onClick={onConfirmGenerateWithKey}
                            isLoading={isGenerating}
                            disabled={amount <= 0 || !tempPixKey}
                        >
                            Gerar QR Code
                        </Button>
                    </div>
                ) : !hideQrElements && !generated ? (
                    <Button variant="filled" className="w-full h-12" onClick={handleGenerate} isLoading={isGenerating} disabled={amount <= 0}>
                        Gerar QR Code
                    </Button>
                ) : qrData ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="bg-white p-4 rounded-xl border border-brand-border shadow-sm">
                            <img src={qrData.qrDataUrl} alt="QR Code Pix" className="w-48 h-48" />
                        </div>
                        <div className="w-full flex gap-2">
                            <input type="text" readOnly value={qrData.payload} className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-border/40 text-xs border border-brand-border truncate outline-none" />
                            <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(qrData.payload)} className="w-10 h-10 shrink-0">
                                <CopyIcon size={16} />
                            </Button>
                        </div>
                    </div>
                ) : hideQrElements ? null : (
                    <div className="flex flex-col items-center">
                        <div className="bg-white p-6 rounded-3xl border border-brand-border mb-4 shadow-sm">
                            <QRCodeIcon size={120} className="text-brand-dark" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
