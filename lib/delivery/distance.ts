import { calculateAddressDistance, geocodeAddress } from "@/lib/services/location.service"

export { geocodeAddress }

export async function calculateRouteDistanceKm(originAddress: string, destinationAddress: string): Promise<number | null> {
  return calculateAddressDistance(originAddress, destinationAddress)
}