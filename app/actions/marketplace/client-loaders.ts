"use server"

import { getCachedMarketplaceProduct } from "./products"

export async function getMarketplaceProductAction(id: string) {
  try {
    const product = await getCachedMarketplaceProduct(id);
    return { data: product, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
