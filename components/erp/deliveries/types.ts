export interface DuditPlatformDriver {
    id: string
    fullName: string
    phone?: string | null
    avatarUrl?: string | null
    vehicleType?: string | null
    vehiclePlate?: string | null
    city?: string | null
    totalDeliveries?: number
    status?: string | null
    isPlatformDriver?: boolean
    isPendingAcceptance?: boolean
    acceptedAt?: string | null
    pickedUpAt?: string | null
}
