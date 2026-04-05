"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteSupplierAction } from "@/app/actions/erp/suppliers"
import { toast } from "sonner"
import AlertModal from "../reusable/AlertModal"
import { TrashIcon } from "@/lib/icons"
import Link from "next/link"

interface Supplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  cnpj: string | null
}

export function SuppliersList({ suppliers: initialSuppliers, partnerId }: { suppliers: Supplier[], partnerId: string }) {
  const router = useRouter()
  const { useERPData } = require("./hooks")
  const { fetchERPSuppliersClient } = require("@/app/actions/erp/client-loaders")
  const { useQueryClient } = require("@tanstack/react-query")
  const queryClient = useQueryClient()

  const { data: rawSuppliers, isLoading: isQueryLoading } = useERPData(
      ['erp', 'suppliers', partnerId],
      () => fetchERPSuppliersClient()
  )

  const suppliers: Supplier[] = rawSuppliers ?? initialSuppliers

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = (id: string) => {
    setSupplierToDelete(id)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteSupplierAction(supplierToDelete)
      if (result.error) {
        toast.error(result.error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['erp', 'suppliers', partnerId] })
        toast.success("Fornecedor deletado com sucesso!")
        // No router.refresh() needed - React Query handles it
      }
    } catch (error) {
      toast.error("Erro ao deletar fornecedor")
      console.error(error)
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
      setSupplierToDelete(null)
    }
  }

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground mb-4">Nenhum fornecedor cadastrado ainda</p>
          <Button asChild>
            <Link href="/erp/suppliers/new" prefetch={false}>Adicionar primeiro fornecedor</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier: Supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.email || "-"}</TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell>{supplier.cnpj || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/erp/suppliers/${supplier.id}`} prefetch={false}>Editar</Link>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(supplier.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "..." : "Deletar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showDeleteModal && (
        <AlertModal
          onClose={() => {
            setShowDeleteModal(false)
            setSupplierToDelete(null)
          }}
          onConfirm={handleConfirmDelete}
          title="Excluir fornecedor?"
          message="Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita."
          confirmText={isDeleting ? "Excluindo..." : "Excluir"}
          icon={<TrashIcon />}
          isDestructive
          disabled={isDeleting}
        />
      )}
    </>
  )
}
