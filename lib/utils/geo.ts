import { calculateDistance, formatDistance as formatLocationDistance } from "@/lib/services/location.service"

export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return calculateDistance({ lat: lat1, lng: lon1 }, { lat: lat2, lng: lon2 })
}

export function formatDistance(distance: number): string {
  return formatLocationDistance(distance) || "0.0 km"
}
