"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerCommunityVideos, deleteCommunityVideo, type CommunityVideoItem } from "@/app/actions/marketplace/community-videos"
import { TrashIcon, EyeIcon, PlayIcon } from "@/lib/icons"
import { formatDate } from "@/lib/utils"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_moderation: "secondary",
  approved: "default",
  rejected: "destructive",
  flagged: "destructive",
}

const STATUS_LABELS: Record<string, string> = {
  pending_moderation: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  flagged: "Sinalizado",
}

export function VideosManagementPage() {
  const { toast } = useToast()
  const { businessInfo, planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()

  const [videos, setVideos] = useState<CommunityVideoItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const partnerId = (businessInfo as any)?.id

  const loadVideos = useCallback(async () => {
    if (!partnerId) return
    setIsLoading(true)
    try {
      const { items } = await getPartnerCommunityVideos(partnerId)
      setVideos(items)
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [partnerId])

  useEffect(() => { loadVideos() }, [loadVideos])

  const handleDelete = async (id: string) => {
    const result = await deleteCommunityVideo(id)
    if (result.success) {
      toast({ title: "Vídeo excluído" })
      loadVideos()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
  }

  if (!hasMinimumPlan(planSlug, "crescer")) {
    return (
      <div className="p-6">
        <ERPPageHeader title="Vídeos da Comunidade" />
        <Card className="p-12 text-center space-y-4">
          <PlayIcon className="w-12 h-12 text-brand-inactive-text mx-auto" />
          <p className="text-brand-inactive-text">Vídeos da comunidade não disponíveis no seu plano atual.</p>
          <Button
            className="bg-brand-green text-white hover:bg-[#047857]"
            onClick={() => openPlanUpgrade("crescer")}
          >
            Fazer upgrade para Crescer
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <ERPPageHeader title="Vídeos da Comunidade" />

      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Vídeos da Comunidade</h1>
        <p className="text-sm text-brand-inactive-text">
          {planSlug === "crescer" ? "Limite: 1 vídeo por mês" : planSlug === "escalar" ? "Limite: 1 vídeo por semana" : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <PlayIcon className="w-12 h-12 text-brand-inactive-text mx-auto" />
          <p className="text-brand-inactive-text">Nenhum vídeo publicado ainda.</p>
          <p className="text-sm text-brand-inactive-text">
            Vídeos são vinculados a produtos ou serviços no cadastro do anúncio.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {videos.map((video) => (
            <Card key={video.id} className="p-4 flex items-center gap-4">
              <div className="w-24 aspect-[9/16] rounded-lg overflow-hidden bg-brand-gray shrink-0 relative">
                <img
                  src={video.video_thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-brand-dark truncate">
                    {video.title || "Sem título"}
                  </h3>
                  <Badge variant={STATUS_VARIANTS[video.moderation_status] || "secondary"}>
                    {STATUS_LABELS[video.moderation_status] || video.moderation_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-brand-inactive-text">
                  <span>{video.views_count} visualizações</span>
                  <span>{video.clicks_count} cliques</span>
                  <span>{video.orders_origin_count} pedidos</span>
                </div>
                <p className="text-xs text-brand-inactive-text mt-1">
                  Publicado em {video.published_at ? formatDate(video.published_at) : formatDate(video.created_at)}
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={() => handleDelete(video.id)}>
                <TrashIcon className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
