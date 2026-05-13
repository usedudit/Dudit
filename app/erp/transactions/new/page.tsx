import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** Nova transação abre no wrapper da listagem; mantemos a rota como redirecionamento. */
export default function NewFinancialTransactionRedirect() {
  redirect("/erp/transactions")
}
