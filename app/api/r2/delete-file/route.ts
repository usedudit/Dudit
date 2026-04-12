/**
 * API Route: DELETE /api/r2/delete-file
 * Deletes a file from Cloudflare R2.
 *
 * SECURITY:
 * - Authentication via requireUser() (strict)
 * - Multi-tenant isolation: users can only delete their own files
 * - Key must start with users/{userId}/ - enforced via validateKeyOwnership()
 */

import { NextRequest, NextResponse } from "next/server"
import { deleteFileFromR2, extractKeyFromR2Url, validateKeyOwnership } from "@/lib/r2/server"
import { requireUser } from "@/lib/auth/authorization"

export async function DELETE(request: NextRequest) {
  try {
    // 1. STRICT AUTHENTICATION
    const user = await requireUser()

    // 2. PARSE REQUEST BODY
    const body = await request.json()
    let key = body.key
    const publicUrl = body.publicUrl

    // If no direct key, extract from public URL
    if (!key && publicUrl) {
      key = extractKeyFromR2Url(publicUrl)
    }

    if (!key) {
      return NextResponse.json(
        { error: "key ou publicUrl é obrigatório" },
        { status: 400 }
      )
    }

    // 3. MULTI-TENANT ISOLATION - user can only delete their own files
    if (!validateKeyOwnership(key, user.id)) {
      console.warn(
        `[SECURITY] User ${user.id} attempted to delete file outside their scope: ${key}`
      )
      return NextResponse.json(
        { error: "Acesso negado. Você só pode deletar seus próprios arquivos." },
        { status: 403 }
      )
    }

    // 4. DELETE FILE
    await deleteFileFromR2(key)

    return NextResponse.json({
      success: true,
      message: "Arquivo deletado com sucesso",
    })
  } catch (error) {
    console.error("[API] Erro em /api/r2/delete-file:", error)

    const message =
      error instanceof Error ? error.message : "Erro ao deletar arquivo"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
