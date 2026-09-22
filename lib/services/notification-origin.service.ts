import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"

interface CacheEntry {
	value: string | null
	ts: number
}

const TTL_MS = 5 * 60 * 1000
const partnerNameCache = new Map<string, CacheEntry>()
const defaultStoreCache = new Map<string, CacheEntry>()
const storeNameCache = new Map<string, CacheEntry>()

function read(cache: Map<string, CacheEntry>, key: string): string | null | undefined {
	const entry = cache.get(key)
	if (!entry) return undefined
	if (Date.now() - entry.ts > TTL_MS) {
		cache.delete(key)
		return undefined
	}
	return entry.value
}

function write(cache: Map<string, CacheEntry>, key: string, value: string | null) {
	cache.set(key, { value, ts: Date.now() })
}

export async function getPartnerName(partnerId: string): Promise<string | null> {
	const cached = read(partnerNameCache, partnerId)
	if (cached !== undefined) return cached
	try {
		const admin = getAdminClient()
		const { data } = await admin
			.from("partners")
			.select("business_info")
			.eq("id", partnerId)
			.maybeSingle()
		const biz = (data?.business_info as any) || {}
		const name = biz?.nome_fantasia || biz?.razao_social || null
		write(partnerNameCache, partnerId, name)
		return name
	} catch {
		write(partnerNameCache, partnerId, null)
		return null
	}
}

export async function getPartnerDefaultStoreName(partnerId: string): Promise<string | null> {
	const cached = read(defaultStoreCache, partnerId)
	if (cached !== undefined) return cached
	try {
		const admin = getAdminClient()
		const { data } = await admin
			.from("stores")
			.select("name")
			.eq("partner_id", partnerId)
			.eq("is_headquarters", true)
			.eq("is_active", true)
			.is("suspended_at", null)
			.order("created_at", { ascending: true })
			.limit(1)
			.maybeSingle()
		write(defaultStoreCache, partnerId, data?.name || null)
		return data?.name || null
	} catch {
		write(defaultStoreCache, partnerId, null)
		return null
	}
}

export async function getStoreName(storeId: string): Promise<string | null> {
	const cached = read(storeNameCache, storeId)
	if (cached !== undefined) return cached
	try {
		const admin = getAdminClient()
		const { data } = await admin.from("stores").select("name").eq("id", storeId).maybeSingle()
		write(storeNameCache, storeId, data?.name || null)
		return data?.name || null
	} catch {
		write(storeNameCache, storeId, null)
		return null
	}
}

export interface NotificationOrigin {
	partnerId: string | null
	partnerName: string | null
	storeId: string | null
	storeName: string | null
}

export async function resolveNotificationOrigin(
	data?: Record<string, unknown> | null,
): Promise<NotificationOrigin> {
	const source = data || {}
	const partnerId =
		(source.partner_id as string | undefined) || (source.partnerId as string | undefined) || null
	const storeId =
		(source.store_id as string | undefined) || (source.storeId as string | undefined) || null
	const providedStoreName =
		(source.store_name as string | undefined) || (source.storeName as string | undefined) || null
	const providedPartnerName =
		(source.partner_name as string | undefined) || (source.partnerName as string | undefined) || null

	let storeName = providedStoreName
	let partnerName = providedPartnerName

	if (!partnerId && !storeId) {
		return { partnerId: null, partnerName: null, storeId: null, storeName: null }
	}

	if (partnerId) {
		if (!partnerName) {
			partnerName = await getPartnerName(partnerId)
		}
		if (!storeName) {
			storeName = await getPartnerDefaultStoreName(partnerId)
		}
	}

	if (storeId && !storeName) {
		storeName = await getStoreName(storeId)
	}

	return {
		partnerId,
		partnerName,
		storeId,
		storeName,
	}
}
