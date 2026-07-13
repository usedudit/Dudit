"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { PaymentMethodSchema } from "@/lib/validation/schemas"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { recalculateSplitPaymentFromBaseAmounts, type SplitInputRow } from "@/lib/payments/split-breakdown"
import { toCanonicalPaymentType, toLegacyPaymentType } from "@/lib/payments/payment-method"
import { decryptCPF, encryptCPF } from "@/lib/crypto"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"

type InstallmentFeeInput = { installmentNumber: number; feePercent: number }

type UpsertPaymentMethodInput = {
    partnerId: string
    name: string
    paymentType: string
    isActive?: boolean
    feePercent?: number | null
    feeFixed?: number | null
    receivingDays?: number | null
    discountPercent?: number | null
    feeBearer?: "merchant" | "customer"
    supportsInstallments?: boolean
    maxInstallments?: number | null
    installmentFees?: InstallmentFeeInput[]
    pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
    pixKey?: string | null
    usePartnerPixData?: boolean
    cardBrand?: string | null
    defaultFinanceAccountId?: string | null
    priority?: number
    isDefault?: boolean
    isOnlineDefault?: boolean
}

async function resolvePixKeyFromPartner(
    partnerId: string,
    pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null | undefined,
) {
    if (!pixKeyType || pixKeyType === "random") return null
    const supabase = createAdminClient()
    const { data: partner } = await supabase
        .from("partners")
        .select("cnpj, phone, cpf, user_id")
        .eq("id", partnerId)
        .single()

    if (!partner) return null
    if (pixKeyType === "cpf") {
        if (partner.cpf) {
            try {
                return await decryptCPF(partner.cpf)
            } catch {
                return null
            }
        }
        return null
    }
    if (pixKeyType === "cnpj") return partner.cnpj || null
    if (pixKeyType === "email") {
        if (!partner.user_id) return null
        try {
            const { data: authData } = await supabase.auth.admin.getUserById(partner.user_id)
            return authData?.user?.email || null
        } catch (err) {
            console.error("Error fetching user email from auth.users:", err)
            return null
        }
    }
    return partner.phone || null
}

async function encryptPixKeyIfNeeded(
    pixKeyType: UpsertPaymentMethodInput["pixKeyType"],
    pixKey: string | null | undefined,
) {
    const normalized = String(pixKey || "").trim()
    if (!normalized) return null
    if (pixKeyType !== "cpf") return normalized
    try {
        return await encryptCPF(normalized)
    } catch {
        throw new Error("Erro ao criptografar CPF da chave PIX")
    }
}

async function decryptPixKeyIfNeeded(
    pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null | undefined,
    pixKey: string | null | undefined,
) {
    if (!pixKey) return null
    if (pixKeyType !== "cpf") return pixKey
    if (!String(pixKey).startsWith("v")) return pixKey
    try {
        return await decryptCPF(pixKey)
    } catch {
        return null
    }
}

function sanitizeInstallmentFees(input: InstallmentFeeInput[] | undefined, maxInstallments: number) {
    const rows = (input || []).map((row) => ({
        installmentNumber: Number(row.installmentNumber || 0),
        feePercent: Number(row.feePercent || 0),
    }))

    const dedupe = new Map<number, number>()
    for (const row of rows) {
        if (!Number.isInteger(row.installmentNumber) || row.installmentNumber < 1 || row.installmentNumber > maxInstallments) {
            throw new Error(`Parcela inválida: ${row.installmentNumber}`)
        }
        if (row.feePercent < 0 || row.feePercent > 100) {
            throw new Error(`Taxa inválida na parcela ${row.installmentNumber}`)
        }
        if (dedupe.has(row.installmentNumber)) {
            throw new Error(`Parcela ${row.installmentNumber} configurada em duplicidade`)
        }
        dedupe.set(row.installmentNumber, row.feePercent)
    }

    return Array.from(dedupe.entries()).map(([installment_number, fee_percent]) => ({ installment_number, fee_percent }))
}

const getCachedPaymentMethods = (partnerId: string) => unstable_cache(
    async () => {
        const supabase = createAdminClient()
        const { data: methods, error } = await supabase
            .from("payment_methods")
            .select(
                "id, name, payment_type, type, is_active, " +
                "is_default, is_online_default, " +
                "fee_percent, fee_fixed, fee_bearer, discount_percent, " +
                "max_installments, card_brand, priority, " +
                "percentage_rate, fixed_amount, created_at"
            )
            .eq("partner_id", partnerId)
            .order("is_default", { ascending: false })
            .order("priority", { ascending: false })
            .order("created_at", { ascending: true })

        if (error) {
            throw error
        }

        return (methods || []).map((method: any) => ({
            ...method,
            type: method.type || toCanonicalPaymentType(method.payment_type),
            fee_percent: method.fee_percent ?? method.percentage_rate ?? null,
            fee_fixed: method.fee_fixed ?? method.fixed_amount ?? null,
            fee_bearer: method.fee_bearer || "merchant",
        }))
    },
    [`payment-methods-${partnerId}`],
    {
        tags: [`payment-methods-${partnerId}`],
        revalidate: 3600 // 1 hour TTL
    }
)

export async function getPaymentMethodsAction(partnerId: string) {
    await requirePartnerAccessWithPermission(partnerId)

    try {
        const methods = await getCachedPaymentMethods(partnerId)()
        return { methods }
    } catch (err: any) {
        return { error: err?.message || "Erro ao carregar métodos de pagamento" }
    }
}

export async function getPaymentMethodDetailsAction(methodId: string) {
    await requireUser()
    const supabase = createAdminClient()
    const { data: method } = await supabase.from("payment_methods").select("id, partner_id").eq("id", methodId).single()
    if (!method) return { error: "Método de pagamento não encontrado" }

    await requirePartnerAccessWithPermission(method.partner_id, "payment_methods", "view")

    const [methodRes, feesRes] = await Promise.all([
        supabase.from("payment_methods").select("*").eq("id", methodId).single(),
        supabase
            .from("payment_method_installment_fees")
            .select("installment_number, fee_percent")
            .eq("payment_method_id", methodId)
            .order("installment_number", { ascending: true }),
    ])

    if (methodRes.error) return { error: methodRes.error.message }
    if (feesRes.error) return { error: feesRes.error.message }
    const decryptedPixKey = await decryptPixKeyIfNeeded(methodRes.data.pix_key_type, methodRes.data.pix_key)

    return {
        success: true,
        method: {
            ...methodRes.data,
            type: methodRes.data.type || toCanonicalPaymentType(methodRes.data.payment_type),
            pix_key: decryptedPixKey,
            installment_fees: feesRes.data || [],
        },
    }
}

export async function calculatePaymentMethodAmountsAction(input: {
    originalAmount: number
    paymentMethodId: string
    installmentNumber?: number
    feeBearer?: "merchant" | "customer"
    includeInstallmentOptions?: boolean
}) {
    await requireUser()
    const supabase = createAdminClient()

    const { data: method } = await supabase
        .from("payment_methods")
        .select("id, partner_id, fee_percent, fee_fixed, fee_bearer, discount_percent, max_installments, type, payment_type")
        .eq("id", input.paymentMethodId)
        .single()

    if (!method) return { error: "Método de pagamento não encontrado" }
    await requirePartnerAccessWithPermission(method.partner_id, "payment_methods", "view")

    const { data: fees } = await supabase
        .from("payment_method_installment_fees")
        .select("installment_number, fee_percent")
        .eq("payment_method_id", input.paymentMethodId)

    const pmConfig = {
        feePercent: Number(method.fee_percent || 0),
        feeFixed: Number(method.fee_fixed || 0),
        feeBearer: (input.feeBearer || method.fee_bearer || "merchant") as "merchant" | "customer",
        discountPercent: Number(method.discount_percent || 0),
        maxInstallments: Number(method.max_installments || 1),
        installmentFees: (fees || []).map((row: any) => ({
            installmentNumber: row.installment_number,
            feePercent: Number(row.fee_percent || 0),
        })),
    }

    const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

    const chosenType = toCanonicalPaymentType(method.type || method.payment_type)
    const maxInst = Math.max(1, Number(method.max_installments || 1))
    const installmentOptions = []

    if (input.includeInstallmentOptions !== false && chosenType === "credit_card" && maxInst > 1) {
        for (let i = 1; i <= maxInst; i++) {
            const calc = calculatePaymentAmounts({
                originalAmount: Math.max(0, Number(input.originalAmount || 0)),
                paymentMethod: pmConfig,
                installmentNumber: i,
            })
            installmentOptions.push({
                installments: i,
                installmentValue: calc.installmentAmounts[0] || round2(calc.finalAmount / i),
                hasInterest: calc.interestAmount > 0.009 && pmConfig.feeBearer === "customer",
                totalInterest: calc.interestAmount,
                totalFee: calc.feeAmount,
                fixedFee: calc.fixedFeeAmount,
                feeBearer: pmConfig.feeBearer,
                finalAmount: calc.finalAmount
            })
        }
    }

    const calc = calculatePaymentAmounts({
        originalAmount: Math.max(0, Number(input.originalAmount || 0)),
        paymentMethod: pmConfig,
        installmentNumber: input.installmentNumber,
    })
    const adjustmentAmount = round2(Number(calc.paymentMethodDiscountAmount || 0) + Number(calc.interestAmount || 0) + Number(calc.feeAmount || 0) + Number(calc.fixedFeeAmount || 0))
    const adjustmentType = calc.paymentMethodDiscountAmount > 0.009
        ? "discount"
        : (calc.interestAmount > 0.009 ? "interest" : (calc.feeAmount > 0.009 || calc.fixedFeeAmount > 0.009 ? "fee" : "none"))
    const adjustmentPercent = adjustmentType === "discount"
        ? calc.appliedDiscountPercent
        : (adjustmentType === "interest" ? calc.appliedInterestPercent : calc.appliedFeePercent)
    const absorbedAmount = pmConfig.feeBearer === "merchant"
        ? round2(Number(calc.interestAmount || 0) + Number(calc.feeAmount || 0) + Number(calc.fixedFeeAmount || 0))
        : 0

    return {
        success: true,
        installmentOptions,
        finalAmount: calc.finalAmount,
        paymentMethodDiscountAmount: calc.paymentMethodDiscountAmount,
        feeAmount: calc.feeAmount,
        fixedFeeAmount: calc.fixedFeeAmount,
        interestAmount: calc.interestAmount,
        amountBeforeInterest: calc.amountBeforeInterest,
        amountBeforeFee: calc.amountBeforeFee,
        installmentNumber: calc.installmentNumber,
        installmentAmounts: calc.installmentAmounts,
        appliedDiscountPercent: calc.appliedDiscountPercent,
        appliedFeePercent: calc.appliedFeePercent,
        appliedInterestPercent: calc.appliedInterestPercent,
        amountReceived: calc.finalAmount,
        adjustmentType,
        adjustmentPercent,
        adjustmentAmount,
        effectiveAmount: calc.finalAmount,
        netAmount: round2(calc.finalAmount - absorbedAmount),
        feeBearer: pmConfig.feeBearer,
    }
}

/**
 * Server-side split preview: user-defined base amounts per leg, same rules as order/POS finalization.
 */
export async function previewSplitPaymentBreakdownAction(input: {
    partnerId: string
    baseTotal: number
    legs: Array<{
        method: string
        baseAmount: number
        paymentMethodId: string | null
        installmentNumber: number
    }>
}) {
    await requireUser()
    await requirePartnerAccessWithPermission(input.partnerId, "payment_methods", "view")
    const supabase = createAdminClient()
    const methodIds = Array.from(new Set(input.legs.map((l) => l.paymentMethodId).filter(Boolean))) as string[]

    const splitRows: SplitInputRow[] = input.legs.map((l) => ({
        method: l.method,
        amount: l.baseAmount,
        amountReceived: l.baseAmount,
        paymentMethodId: l.paymentMethodId,
        installmentNumber: Math.max(1, Math.floor(Number(l.installmentNumber || 1))),
    }))

    const [{ data: methods }, { data: fees }] = await Promise.all([
        methodIds.length > 0
            ? supabase
                .from("payment_methods")
                .select("id, fee_percent, fee_fixed, fee_bearer, discount_percent, max_installments")
                .eq("partner_id", input.partnerId)
                .eq("is_active", true)
                .in("id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
        methodIds.length > 0
            ? supabase
                .from("payment_method_installment_fees")
                .select("payment_method_id, installment_number, fee_percent")
                .in("payment_method_id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
    ])

    const methodById = new Map<string, any>((methods || []).map((m: any) => [String(m.id), m]))
    const feesByMethod = new Map<string, Array<{ installmentNumber: number; feePercent: number }>>()
    for (const row of fees || []) {
        const key = String((row as any).payment_method_id || "")
        if (!key) continue
        const arr = feesByMethod.get(key) || []
        arr.push({
            installmentNumber: Number((row as any).installment_number || 1),
            feePercent: Number((row as any).fee_percent || 0),
        })
        feesByMethod.set(key, arr)
    }

    const result = recalculateSplitPaymentFromBaseAmounts(
        input.baseTotal,
        splitRows,
        methodById,
        feesByMethod,
    )

    if (!result.ok) {
        return { success: false as const, error: result.error }
    }

    return {
        success: true as const,
        finalTotal: result.finalTotal,
        feeAmount: result.feeAmount,
        interestAmount: result.interestAmount,
        paymentMethodDiscountAmount: result.paymentMethodDiscountAmount,
        rows: result.adjustedRows,
    }
}

export async function createPaymentMethodAction(data: UpsertPaymentMethodInput) {
    await requireRateLimit(RateLimitCategory.PAYMENT)

    await requirePartnerAccessWithPermission(data.partnerId, "payment_methods", "create")

    const canonicalType = toCanonicalPaymentType(data.paymentType)
    if (canonicalType === "cash") {
        return { error: "O tipo Dinheiro já é criado automaticamente e não pode ser cadastrado manualmente." }
    }
    // defaultFinanceAccountId is now optional
    const maxInstallments = Math.max(1, Math.min(24, Number(data.maxInstallments || 1)))
    const supportsInstallments = canonicalType === "credit_card" && Boolean(data.supportsInstallments)
    const validatedInstallmentFees = sanitizeInstallmentFees(data.installmentFees, maxInstallments)
    const isPix = canonicalType === "pix"
    const resolvedPixKey = data.usePartnerPixData ? await resolvePixKeyFromPartner(data.partnerId, data.pixKeyType) : data.pixKey
    const persistedPixKey = isPix ? await encryptPixKeyIfNeeded(data.pixKeyType, resolvedPixKey || null) : null

    const validation = PaymentMethodSchema.safeParse({
        partnerId: data.partnerId,
        name: data.name,
        paymentType: canonicalType,
        pixKeyType: isPix ? data.pixKeyType : null,
        pixKey: isPix ? persistedPixKey : null,
        usePartnerPixData: isPix ? Boolean(data.usePartnerPixData) : false,
        isActive: true,
        feePercent: data.feePercent ?? 0,
        feeFixed: data.feeFixed ?? 0,
        receivingDays: data.receivingDays ?? 0,
        feeBearer: data.feeBearer || "merchant",
        supportsInstallments,
        maxInstallments,
        discountPercent: data.discountPercent,
        cardBrand: data.cardBrand,
        defaultFinanceAccountId: data.defaultFinanceAccountId,
        priority: Math.max(0, Number(data.priority || 0)),
        isDefault: Boolean(data.isDefault),
        isOnlineDefault: Boolean(data.isOnlineDefault),
        installmentFees: supportsInstallments ? (data.installmentFees || []) : [],
    })

    if (!validation.success) {
        const errorDetails = validation.error.issues.map(i => i.message).join(", ")
        return { error: errorDetails }
    }

    const supabase = createAdminClient()

    if (data.defaultFinanceAccountId) {
        const { data: financeAccount } = await supabase
            .from("finance_accounts")
            .select("id")
            .eq("id", data.defaultFinanceAccountId)
            .eq("partner_id", data.partnerId)
            .eq("is_active", true)
            .maybeSingle()

        if (!financeAccount?.id) {
            return { error: "Conta financeira inválida ou inativa para este parceiro." }
        }
    }

    if (data.isOnlineDefault) {
        await supabase
            .from("payment_methods")
            .update({ is_online_default: false })
            .eq("partner_id", data.partnerId)
            .eq("type", canonicalType)
    }

    const { data: method, error: methodError } = await supabase
        .from("payment_methods")
        .insert({
            partner_id: data.partnerId,
            name: data.name,
            payment_type: toLegacyPaymentType(canonicalType),
            type: canonicalType,
            is_active: true,
            max_installments: supportsInstallments ? maxInstallments : 1,
            fee_percent: data.feePercent ?? null,
            fee_fixed: data.feeFixed ?? null,
            percentage_rate: data.feePercent ?? 0,
            fixed_amount: data.feeFixed ?? 0,
            receiving_days: data.receivingDays ?? 0,
            discount_percent: data.discountPercent ?? 0,
            fee_bearer: data.feeBearer || "merchant",
            supports_installments: supportsInstallments,
            card_brand: data.cardBrand,
            pix_key_type: isPix ? (data.pixKeyType || null) : null,
            pix_key: isPix ? persistedPixKey : null,
            use_partner_pix_data: isPix ? Boolean(data.usePartnerPixData) : false,
            default_finance_account_id: data.defaultFinanceAccountId || null,
            priority: Math.max(0, Number(data.priority || 0)),
            is_default: Boolean(data.isDefault),
            is_online_default: Boolean(data.isOnlineDefault),
        })
        .select()
        .single()

    if (methodError) {
        return { error: methodError.message }
    }

    if (supportsInstallments && validatedInstallmentFees.length > 0) {
        const { error: feesError } = await supabase.from("payment_method_installment_fees").insert(
            validatedInstallmentFees.map((row) => ({ ...row, payment_method_id: method.id })),
        )
        if (feesError) return { error: feesError.message }
    }

    revalidateTag(`payment-methods-${data.partnerId}`, "max")
    revalidatePath("/erp/settings")

    return { success: true, method }
}

export async function updatePaymentMethodAction(
    methodId: string,
    data: {
        name?: string
        isActive?: boolean
        paymentType?: string
        maxInstallments?: number | null
        feePercent?: number | null
        feeFixed?: number | null
        receivingDays?: number
        discountPercent?: number
        feeBearer?: "merchant" | "customer"
        supportsInstallments?: boolean
        installmentFees?: InstallmentFeeInput[]
        pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
        pixKey?: string | null
        usePartnerPixData?: boolean
        cardBrand?: string | null
        defaultFinanceAccountId?: string | null
        priority?: number
        isDefault?: boolean
        isOnlineDefault?: boolean
    },
) {
    await requireRateLimit(RateLimitCategory.PAYMENT)

    const supabase = createAdminClient()
    const { data: method } = await supabase
        .from("payment_methods")
        .select("partner_id, type, payment_type, default_finance_account_id")
        .eq("id", methodId)
        .single()

    if (!method) {
        return { error: "Método de pagamento não encontrado" }
    }

    await requirePartnerAccessWithPermission(method.partner_id, "payment_methods", "edit")

    if (data.feePercent !== undefined && (Number(data.feePercent) < 0 || Number(data.feePercent) > 100)) {
        return { error: "Taxa percentual deve estar entre 0 e 100." }
    }
    if (data.discountPercent !== undefined && (Number(data.discountPercent) < 0 || Number(data.discountPercent) > 100)) {
        return { error: "Desconto deve estar entre 0 e 100." }
    }

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.isActive !== undefined) updateData.is_active = data.isActive
    if (data.paymentType !== undefined) {
        const canonicalType = toCanonicalPaymentType(data.paymentType)
        updateData.type = canonicalType
        updateData.payment_type = toLegacyPaymentType(canonicalType)
        if (canonicalType !== "pix") {
            updateData.pix_key_type = null
            updateData.pix_key = null
            updateData.use_partner_pix_data = false
        }
        if (canonicalType !== "credit_card") {
            updateData.supports_installments = false
            updateData.max_installments = 1
        }
    }
    if (data.maxInstallments !== undefined) updateData.max_installments = Math.max(1, Math.min(24, Number(data.maxInstallments || 1)))
    if (data.feePercent !== undefined) {
        updateData.fee_percent = data.feePercent
        updateData.percentage_rate = data.feePercent ?? 0
    }
    if (data.feeFixed !== undefined) {
        updateData.fee_fixed = data.feeFixed
        updateData.fixed_amount = data.feeFixed ?? 0
    }
    if (data.receivingDays !== undefined) updateData.receiving_days = data.receivingDays
    if (data.discountPercent !== undefined) updateData.discount_percent = data.discountPercent
    if (data.feeBearer !== undefined) updateData.fee_bearer = data.feeBearer
    if (data.supportsInstallments !== undefined) updateData.supports_installments = data.supportsInstallments
    if (data.pixKeyType !== undefined) updateData.pix_key_type = data.pixKeyType
    if (data.usePartnerPixData !== undefined) updateData.use_partner_pix_data = data.usePartnerPixData
    const effectiveType = toCanonicalPaymentType(data.paymentType || method.type || method.payment_type)
    if (effectiveType === "pix" && data.usePartnerPixData) {
        const keyFromPartner = await resolvePixKeyFromPartner(method.partner_id, data.pixKeyType || null)
        updateData.pix_key = await encryptPixKeyIfNeeded(data.pixKeyType || null, keyFromPartner)
    } else if (data.pixKey !== undefined) {
        updateData.pix_key = await encryptPixKeyIfNeeded(data.pixKeyType || null, data.pixKey)
    }

    if (data.cardBrand !== undefined) {
        updateData.card_brand = data.cardBrand
    }
    // Finance account is now optional
    if (data.defaultFinanceAccountId) {
        const { data: financeAccount } = await supabase
            .from("finance_accounts")
            .select("id")
            .eq("id", data.defaultFinanceAccountId)
            .eq("partner_id", method.partner_id)
            .eq("is_active", true)
            .maybeSingle()
        if (!financeAccount?.id) {
            return { error: "Conta financeira inválida ou inativa para este parceiro." }
        }
        updateData.default_finance_account_id = data.defaultFinanceAccountId
    } else if (data.defaultFinanceAccountId === null) {
        updateData.default_finance_account_id = null
    }
    if (data.priority !== undefined) updateData.priority = Math.max(0, Number(data.priority || 0))
    if (data.isDefault !== undefined) updateData.is_default = Boolean(data.isDefault)
    if (data.isOnlineDefault !== undefined) {
        updateData.is_online_default = Boolean(data.isOnlineDefault)
        if (data.isOnlineDefault) {
            await supabase
                .from("payment_methods")
                .update({ is_online_default: false })
                .eq("partner_id", method.partner_id)
                .eq("type", effectiveType)
        }
    }
    const { error: methodError } = await supabase
        .from("payment_methods")
        .update(updateData)
        .eq("id", methodId)
        .eq("partner_id", method.partner_id)

    if (methodError) {
        return { error: methodError.message }
    }

    if (data.supportsInstallments === false) {
        const { error: clearFeesError } = await supabase
            .from("payment_method_installment_fees")
            .delete()
            .eq("payment_method_id", methodId)
        if (clearFeesError) return { error: clearFeesError.message }
    } else if (Array.isArray(data.installmentFees)) {
        const currentMax = Number(updateData.max_installments || data.maxInstallments || 24)
        const validatedInstallmentFees = sanitizeInstallmentFees(data.installmentFees, currentMax)
        const { error: deleteError } = await supabase
            .from("payment_method_installment_fees")
            .delete()
            .eq("payment_method_id", methodId)
        if (deleteError) return { error: deleteError.message }

        if (validatedInstallmentFees.length > 0) {
            const { error: insertError } = await supabase.from("payment_method_installment_fees").insert(
                validatedInstallmentFees.map((row) => ({ ...row, payment_method_id: methodId })),
            )
            if (insertError) return { error: insertError.message }
        }
    }

    revalidateTag(`payment-methods-${method.partner_id}`, "max")
    revalidatePath("/erp/settings")

    return { success: true }
}

export async function deletePaymentMethodAction(methodId: string) {
    await requireRateLimit(RateLimitCategory.PAYMENT)

    const supabase = createAdminClient()
    const { data: method } = await supabase
        .from("payment_methods")
        .select("partner_id, name, type, payment_type")
        .eq("id", methodId)
        .single()

    if (!method) {
        return { error: "Método de pagamento não encontrado" }
    }

    await requirePartnerAccessWithPermission(method.partner_id, "payment_methods", "delete")

    const normalizedType = toCanonicalPaymentType(String(method.type || method.payment_type || ""))
    const normalizedName = String(method.name || "").trim().toLowerCase()
    if (normalizedType === "cash" || normalizedName === "dinheiro") {
        return { error: "O método Dinheiro é padrão do sistema e não pode ser excluído." }
    }

    const { error } = await supabase.from("payment_methods").delete().eq("id", methodId)

    if (error) {
        return { error: error.message }
    }

    revalidateTag(`payment-methods-${method.partner_id}`, "max")
    revalidatePath("/erp/settings")

    return { success: true }
}

export async function pickBestPaymentMethodAction(input: {
    partnerId: string
    type: string
    context?: { preferDefault?: boolean }
}) {
    await requirePartnerAccessWithPermission(input.partnerId, "payment_methods", "view")
    const supabase = createAdminClient()
    const method = await pickBestPaymentMethod(supabase as any, input.type, input.partnerId, input.context || {})
    if (!method) return { error: "Nenhum método ativo encontrado para este tipo." }
    return { success: true, method }
}

export async function getPartnerFinanceAccountsForPaymentMethodsAction(partnerId: string) {
    await requirePartnerAccessWithPermission(partnerId, "payment_methods", "view")
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from("finance_accounts")
        .select("id, name, type, is_active")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .order("name", { ascending: true })

    if (error) return { error: error.message }
    return { success: true, accounts: data || [] }
}
