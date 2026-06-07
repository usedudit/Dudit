import { z } from "zod"
import { isValidCitySlug } from "@/lib/validation/city"
import { BRAZILIAN_UFS, DEFAULT_COUNTRY } from "@/lib/ads/constants"
import type { AdStatus, AdTargetMode } from "@/lib/ads/types"

const urlSchema = z
    .string()
    .trim()
    .url({ message: "URL inválida" })
    .refine((url) => url.startsWith("https://"), {
        message: "Apenas URLs HTTPS são permitidas",
    })

const imageUrlSchema = urlSchema.refine(
    (url) => {
        try {
            const parsed = new URL(url)
            return ["http:", "https:"].includes(parsed.protocol)
        } catch {
            return false
        }
    },
    { message: "URL de imagem inválida" },
)

const targetModeSchema = z.enum(["radius", "cities", "state", "country"])

const statusSchema = z.enum(["draft", "active", "paused", "expired"])

export const advertisementFormSchema = z
    .object({
        title: z.string().trim().min(3, "Título deve ter ao menos 3 caracteres").max(120),
        description: z.string().trim().max(500).optional().nullable(),
        image_url: imageUrlSchema,
        destination_url: urlSchema,
        advertiser_name: z.string().trim().min(2, "Nome do anunciante obrigatório").max(80),
        advertiser_logo: imageUrlSchema.optional().nullable(),
        target_mode: targetModeSchema,
        center_lat: z.number().min(-90).max(90).optional().nullable(),
        center_lng: z.number().min(-180).max(180).optional().nullable(),
        radius_km: z.number().positive("Raio deve ser maior que zero").max(500).optional().nullable(),
        cities: z.array(z.string()).optional(),
        state: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        priority: z.number().int().min(0).max(1000).default(0),
        status: statusSchema,
        starts_at: z.string().min(1, "Data de início obrigatória"),
        ends_at: z.string().min(1, "Data de término obrigatória"),
    })
    .superRefine((data, ctx) => {
        const starts = new Date(data.starts_at)
        const ends = new Date(data.ends_at)
        if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
            ctx.addIssue({ code: "custom", message: "Datas inválidas", path: ["starts_at"] })
            return
        }
        if (ends <= starts) {
            ctx.addIssue({
                code: "custom",
                message: "Data de término deve ser posterior ao início",
                path: ["ends_at"],
            })
        }

        switch (data.target_mode as AdTargetMode) {
            case "radius":
                if (data.center_lat == null || data.center_lng == null || !data.radius_km) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Coordenadas e raio são obrigatórios para targeting por raio",
                        path: ["radius_km"],
                    })
                }
                break
            case "cities": {
                const cities = (data.cities || []).filter(Boolean)
                if (cities.length === 0) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Selecione ao menos uma cidade",
                        path: ["cities"],
                    })
                }
                for (const slug of cities) {
                    if (!isValidCitySlug(slug)) {
                        ctx.addIssue({
                            code: "custom",
                            message: `Cidade inválida: ${slug}`,
                            path: ["cities"],
                        })
                    }
                }
                break
            }
            case "state": {
                const uf = (data.state || "").trim().toUpperCase()
                if (!BRAZILIAN_UFS.includes(uf as (typeof BRAZILIAN_UFS)[number])) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Estado (UF) inválido",
                        path: ["state"],
                    })
                }
                break
            }
            case "country": {
                const country = (data.country || DEFAULT_COUNTRY).trim().toUpperCase()
                if (country.length !== 2) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Código de país inválido (use ISO-3166, ex: BR)",
                        path: ["country"],
                    })
                }
                break
            }
        }
    })

export type AdvertisementFormValues = z.infer<typeof advertisementFormSchema>

export function normalizeAdvertisementInput(
    input: AdvertisementFormValues,
): AdvertisementFormValues & { state: string | null; country: string | null; cities: string[] } {
    return {
        ...input,
        description: input.description?.trim() || null,
        advertiser_logo: input.advertiser_logo?.trim() || null,
        cities: (input.cities || []).map((c) => c.toLowerCase().trim()).filter(Boolean),
        state: input.state ? input.state.trim().toUpperCase() : null,
        country: (input.country || DEFAULT_COUNTRY).trim().toUpperCase(),
        priority: input.priority ?? 0,
    }
}

export function isActiveStatus(status: AdStatus): boolean {
    return status === "active"
}
