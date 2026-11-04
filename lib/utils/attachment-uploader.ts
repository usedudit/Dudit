import { getOrderPresignedUploadUrlAction, saveOrderAttachmentAction } from "@/app/actions/erp/orders"
import { getPresignedUploadUrlAction, saveAttachmentAction } from "@/app/actions/erp/service-orders"
import { R2_PREFIXES } from "@/lib/r2/config"
import { getStockMovementPresignedUploadUrlAction, saveStockMovementAttachmentAction } from "@/app/actions/erp/stock-movements"
import { getTransactionPresignedUploadUrlAction, saveTransactionAttachmentAction } from "@/app/actions/erp/transactions"
import { getReturnEvidencePresignedUploadUrlAction, saveReturnEvidenceAction } from "@/app/actions/erp/returns"
import { getQuotePresignedUploadUrlAction, saveQuoteAttachmentAction } from "@/app/actions/erp/quotes"

export type AttachmentEntityType = "order" | "service_order" | "stock_movement" | "transaction" | "return" | "quote"

interface PresignedUploadResult {
    success: boolean
    uploadUrl?: string
    key?: string
    error?: string
}

async function calculateFileHash(file: File): Promise<string> {
    try {
        const buffer = await file.arrayBuffer()
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    } catch (err) {
        console.error("Erro ao calcular hash do arquivo:", err)
        return ""
    }
}

async function getPresignedUrl(
    entityType: AttachmentEntityType,
    partnerId: string,
    entityId: string,
    fileName: string,
    fileType: string,
    fileSize: number
): Promise<PresignedUploadResult> {
    switch (entityType) {
        case "order":
            return getOrderPresignedUploadUrlAction(partnerId, entityId, fileName, fileType, fileSize)
        case "service_order":
            return getPresignedUploadUrlAction(partnerId, R2_PREFIXES.serviceOrderAttachments, fileName, fileType, fileSize)
        case "stock_movement":
            return getStockMovementPresignedUploadUrlAction(partnerId, entityId, fileName, fileType, fileSize)
        case "transaction":
            return getTransactionPresignedUploadUrlAction(partnerId, entityId, fileName, fileType, fileSize)
        case "return":
            return getReturnEvidencePresignedUploadUrlAction(partnerId, fileName, fileType, fileSize)
        case "quote":
            return getQuotePresignedUploadUrlAction(partnerId, "quotes/attachments", fileName, fileType, fileSize)
        default:
            return { success: false, error: "Tipo de entidade inválido" }
    }
}

async function saveAttachmentRecord(
    entityType: AttachmentEntityType,
    partnerId: string,
    entityId: string,
    fileKey: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    fileHash: string
) {
    switch (entityType) {
        case "order":
            return saveOrderAttachmentAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, fileHash)
        case "service_order":
            return saveAttachmentAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, "normal", fileHash)
        case "stock_movement":
            return saveStockMovementAttachmentAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, fileHash)
        case "transaction":
            return saveTransactionAttachmentAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, fileHash)
        case "return":
            return saveReturnEvidenceAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, fileHash)
        case "quote":
            return saveQuoteAttachmentAction(partnerId, entityId, fileKey, fileName, fileType, fileSize, "normal", fileHash)
        default:
            return { success: false, error: "Tipo de entidade inválido" }
    }
}

import { isGifFile } from "@/lib/security/file-validator"

export async function uploadSingleFile({
    partnerId,
    entityId,
    entityType,
    file,
}: {
    partnerId: string
    entityId: string
    entityType: AttachmentEntityType
    file: File
}): Promise<{ success: boolean; error?: string }> {
    try {
        if (isGifFile(file)) {
            return { success: false, error: "Arquivos GIF não são permitidos no sistema." }
        }

        const [presigned, fileHash] = await Promise.all([
            getPresignedUrl(
                entityType,
                partnerId,
                entityId,
                file.name,
                file.type || "application/octet-stream",
                file.size
            ),
            calculateFileHash(file)
        ])

        if (!presigned.success || !presigned.uploadUrl || !presigned.key) {
            return { success: false, error: presigned.error || "Falha ao gerar URL de upload" }
        }

        const uploadRes = await fetch(presigned.uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
        })

        if (!uploadRes.ok) {
            return { success: false, error: `Falha no upload para R2: ${uploadRes.statusText}` }
        }

        const saveRes = await saveAttachmentRecord(
            entityType,
            partnerId,
            entityId,
            presigned.key,
            file.name,
            file.type || "application/octet-stream",
            file.size,
            fileHash
        )

        return saveRes
    } catch (err: any) {
        console.error("Erro em uploadSingleFile:", err)
        return { success: false, error: err.message || "Erro inesperado ao salvar anexo" }
    }
}

export async function uploadAndSavePendingAttachments({
    partnerId,
    entityId,
    entityType,
    files = [],
    images = [],
}: {
    partnerId: string
    entityId: string
    entityType: AttachmentEntityType
    files?: File[]
    images?: (string | File)[]
}): Promise<{ success: boolean; errors?: string[] }> {
    if (!entityId || !partnerId) {
        return { success: false, errors: ["ID da entidade ou do parceiro ausente"] }
    }

    const allFileTasks: File[] = []

    for (const f of files) {
        if (f instanceof File) allFileTasks.push(f)
    }

    for (const img of images) {
        if (img instanceof File) allFileTasks.push(img)
    }

    if (allFileTasks.length === 0) {
        return { success: true }
    }

    const results = await Promise.all(
        allFileTasks.map((file) => uploadSingleFile({ partnerId, entityId, entityType, file }))
    )

    const errors: string[] = []
    results.forEach((res, idx) => {
        if (!res.success) {
            errors.push(`Arquivo "${allFileTasks[idx].name}": ${res.error || "Erro no upload"}`)
        }
    })

    if (errors.length > 0) {
        return { success: false, errors }
    }

    return { success: true }
}
