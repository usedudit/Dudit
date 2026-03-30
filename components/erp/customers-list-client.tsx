"use client"

import { useState, useMemo } from "react"
import { useStoreData } from "@/lib/use-store-data"
import { useStore } from "@/lib/store-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

interface CustomersListClientProps {
  partnerId: string
}

export function CustomersListClient({ partnerId }: CustomersListClientProps) {
  const { selectedStore, isLoading: storeLoading } = useStore()
  const { customers, isLoading: customersLoading } = useStoreData(partnerId, { includeCustomers: true })
  const [searchTerm, setSearchTerm] = useState("")

  const isLoading = storeLoading || customersLoading

  const filteredCustomers = useMemo(() => {
    if (!customers) return []

    const filtered = customers.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm),
    )

    // Prioritize current store customers
    if (selectedStore) {
      return filtered.sort((a: any, b: any) => {
        if (a.store_id === selectedStore.id && b.store_id !== selectedStore.id) return -1
        if (a.store_id !== selectedStore.id && b.store_id === selectedStore.id) return 1
        return 0
      })
    }

    return filtered
  }, [customers, searchTerm, selectedStore])

  if (!selectedStore) {
    return (
      <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
        <CardContent className="pt-6">
          <p className="text-yellow-800 dark:text-yellow-200">
            Por favor, selecione um local para visualizar os clientes.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (filteredCustomers.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground mb-4">Nenhum cliente neste local</p>
          <Button asChild>
            <Link href="/erp/customers/new" prefetch={false}>Adicionar cliente</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes - {selectedStore.name}</CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {filteredCustomers.filter((c: any) => c.store_id === selectedStore.id).length} cliente
          {filteredCustomers.filter((c: any) => c.store_id === selectedStore.id).length !== 1 ? "s" : ""} deste local
        </p>
      </CardHeader>
      <CardContent>
        <input
          type="text"
          placeholder="Pesquisar clientes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-4 w-full px-3 py-2 border rounded-lg"
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer: any) => (
              <TableRow key={customer.id} className={customer.store_id !== selectedStore.id ? "opacity-60" : ""}>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell>{customer.email || "-"}</TableCell>
                <TableCell>{customer.phone || "-"}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {customer.store_id === selectedStore.id ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">Atual</span>
                  ) : (
                    <span className="text-gray-400">Outro local</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/erp/customers/${customer.id}`} prefetch={false}>Editar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
