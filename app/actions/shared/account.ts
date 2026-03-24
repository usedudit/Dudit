"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client" // Cliente para pegar a sessão atual
// Removed createSupabaseAdmin
import { revalidatePath } from "next/cache"
import ExcelJS from "exceljs"
import { sendAccountDeletionEmail } from "@/lib/email"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

import { getAdminClient } from "@/lib/supabase/admin"

export async function deleteAccountAction(userId: string, isPartner: boolean, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.ACCOUNT_DELETE)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()
  const adminSupabase = getAdminClient()

  try {
    // 1. Verificar se o usuário solicitante é o dono da conta (Segurança)
    const user = await requireUser()
    if (user.id !== userId) {
      return { error: "Não autorizado." }
    }

    const userEmail = user.email

    // 2. Gerar Backup (Apenas se for Parceiro e tiver Email)
    if (isPartner && userEmail) {
      try {
        const { data: partner } = await adminSupabase
          .from("partners")
          .select("id")
          .eq("user_id", userId)
          .single()

        if (partner) {
          const workbook = new ExcelJS.Workbook()
          workbook.creator = "Dudit ERP"
          workbook.created = new Date()

          // Buscas em paralelo (Otimizado)
          const [products, orders, customers, suppliers, finPayable, finReceivable] = await Promise.all([
            adminSupabase.from("products").select("*").eq("partner_id", partner.id),
            adminSupabase.from("orders").select("*").eq("partner_id", partner.id),
            adminSupabase.from("customers").select("*").eq("partner_id", partner.id),
            adminSupabase.from("suppliers").select("*").eq("partner_id", partner.id),
            adminSupabase.from("accounts_payable").select("*").eq("partner_id", partner.id),
            adminSupabase.from("accounts_receivable").select("*").eq("partner_id", partner.id),
          ])

          // Helper para criar abas
          const addSheet = (name: string, data: any[]) => {
            if (data && data.length > 0) {
              const sheet = workbook.addWorksheet(name)
              sheet.columns = Object.keys(data[0]).map((key) => ({ header: key, key, width: 20 }))
              data.forEach((row) => sheet.addRow(row))
            }
          }

          addSheet("Produtos", products.data || [])
          addSheet("Pedidos", orders.data || [])
          addSheet("Clientes", customers.data || [])
          addSheet("Fornecedores", suppliers.data || [])
          addSheet("Contas a Pagar", finPayable.data || [])
          addSheet("Contas a Receber", finReceivable.data || [])

          // Gera buffer apenas se tiver dados
          if (products.data?.length || orders.data?.length) {
            const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer
            // Tenta enviar email (não bloqueante se falhar)
            await sendAccountDeletionEmail(userEmail, buffer).catch(err =>
              console.error("Erro ao enviar email de backup:", err)
            )
          }
        }
      } catch (backupError) {
        console.error("Falha ao gerar backup, prosseguindo com exclusão:", backupError)
        // Decisão de negócio: Se o backup falhar, deletamos mesmo assim ou avisamos?
        // Aqui optei por seguir com a deleção para não travar o usuário.
      }
    }

    // 3. Deletar Usuário (Usando Admin Client)
    // Isso remove da tabela auth.users. O Supabase deve estar configurado com 
    // "ON DELETE CASCADE" nas tabelas partners/profiles para limpar o resto.
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error("Erro fatal ao deletar usuário:", deleteError)
      return { error: "Erro ao excluir conta. Entre em contato com o suporte." }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erro geral na action deleteAccount:", error)
    return { error: "Ocorreu um erro inesperado." }
  }
}
