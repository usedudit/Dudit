"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { useStore } from "@/lib/store-context"
import {
  fetchStoreProducts,
  fetchCustomersWithStorePriority,
  fetchStoreOrders,
  fetchStoreServices,
  fetchStoreSuppliers,
  fetchStoreStockMovements,
  fetchStorePaymentMethods,
} from "@/lib/store-queries"

interface UseStoreDataOptions {
  includeProducts?: boolean
  includeCustomers?: boolean
  includeOrders?: boolean
  includeServices?: boolean
  includeSuppliers?: boolean
  includeStockMovements?: boolean
  includePaymentMethods?: boolean
}

// Optimized SWR config to reduce API calls
const SWR_CONFIG = {
  revalidateOnFocus: false, // Don't refetch on window focus
  revalidateOnReconnect: false, // Don't refetch on reconnect
  dedupingInterval: 60000, // Dedupe requests within 1 minute
  errorRetryCount: 2, // Reduce retry attempts
  keepPreviousData: true, // Keep showing old data while loading new
}

/**
 * Hook to fetch data for the currently selected store
 * Automatically refetches when store changes
 */
export function useStoreData(partnerId: string, options: UseStoreDataOptions = {}) {
  const { selectedStore } = useStore()

  // Memoize options to prevent unnecessary re-renders
  const optionsKey = useMemo(() => JSON.stringify(options), [
    options.includeProducts,
    options.includeCustomers,
    options.includeOrders,
    options.includeServices,
    options.includeSuppliers,
    options.includeStockMovements,
    options.includePaymentMethods,
  ])

  const storeId = selectedStore?.id
  const baseKey = storeId ? `store-${storeId}` : null

  const { data: products, isLoading: productsLoading } = useSWR(
    baseKey && options.includeProducts ? [baseKey, "products"] : null,
    () => fetchStoreProducts(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: customers, isLoading: customersLoading } = useSWR(
    baseKey && options.includeCustomers ? [baseKey, "customers"] : null,
    () => fetchCustomersWithStorePriority(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: orders, isLoading: ordersLoading } = useSWR(
    baseKey && options.includeOrders ? [baseKey, "orders"] : null,
    () => fetchStoreOrders(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: services, isLoading: servicesLoading } = useSWR(
    baseKey && options.includeServices ? [baseKey, "services"] : null,
    () => fetchStoreServices(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: suppliers, isLoading: suppliersLoading } = useSWR(
    baseKey && options.includeSuppliers ? [baseKey, "suppliers"] : null,
    () => fetchStoreSuppliers(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: stockMovements, isLoading: stockMovementsLoading } = useSWR(
    baseKey && options.includeStockMovements ? [baseKey, "stockMovements"] : null,
    () => fetchStoreStockMovements(partnerId, storeId || null),
    SWR_CONFIG
  )

  const { data: paymentMethods, isLoading: paymentMethodsLoading } = useSWR(
    baseKey && options.includePaymentMethods ? [baseKey, "paymentMethods"] : null,
    () => fetchStorePaymentMethods(partnerId, storeId || null),
    SWR_CONFIG
  )

  const isLoading =
    productsLoading ||
    customersLoading ||
    ordersLoading ||
    servicesLoading ||
    suppliersLoading ||
    stockMovementsLoading ||
    paymentMethodsLoading

  return {
    selectedStore,
    products,
    customers,
    orders,
    services,
    suppliers,
    stockMovements,
    paymentMethods,
    isLoading,
  }
}
