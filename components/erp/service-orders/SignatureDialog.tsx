"use client"

import React, { useRef, useState, useEffect } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable"
import { getPresignedUploadUrlAction, saveSignatureAction } from "@/app/actions/erp/service-orders"
import { useToast } from "@/hooks/use-toast"
import { R2_PREFIXES } from "@/lib/r2/config"

interface SignatureDialogProps {
  partnerId: string
  serviceOrderId: string
  onSaved: (key: string) => void
  onClose: () => void
}

export default function SignatureDialog({ partnerId, serviceOrderId, onSaved, onClose }: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.strokeStyle = "#1a1a2e"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ("touches" in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * (canvas.width / rect.width),
        y: (touch.clientY - rect.top) * (canvas.height / rect.height),
      }
    }

    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const pos = getPos(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return

    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
    setHasContent(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const pos = getPos(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return

    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
  }

  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setSaving(true)

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      )

      if (!blob) {
        throw new Error("Erro ao gerar imagem da assinatura")
      }

      const fileName = `signature-${Date.now()}.png`

      // Get presigned URL
      const urlRes = await getPresignedUploadUrlAction(
        partnerId,
        R2_PREFIXES.serviceOrderSignatures,
        fileName,
        "image/png",
        blob.size,
      )

      if (!urlRes.success) {
        throw new Error(urlRes.error || "Erro ao gerar URL de upload")
      }

      // Upload directly to R2
      const uploadRes = await fetch(urlRes.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      })

      if (!uploadRes.ok) {
        throw new Error("Erro ao fazer upload da assinatura")
      }

      // Save reference in DB (only the key, not publicUrl)
      const saveRes = await saveSignatureAction(partnerId, serviceOrderId, urlRes.key)
      if (!saveRes.success) {
        throw new Error(saveRes.error || "Erro ao salvar assinatura")
      }

      toast({ description: "Assinatura salva com sucesso!" })
      onSaved(urlRes.key)
    } catch (err: any) {
      toast({ description: err.message || "Erro ao salvar assinatura" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DefaultModal isOpen onClose={onClose} title="Assinatura do Cliente" maxWidth="md">
      <div className="space-y-4">
        <p className="text-sm text-brand-inactive-text">
          Solicite que o cliente assine abaixo utilizando o mouse ou touch.
        </p>

        <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={500}
            height={200}
            className="w-full touch-none cursor-crosshair"
            style={{ height: "200px" }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={clearCanvas}>
            Limpar
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} isLoading={saving} disabled={!hasContent}>
              Salvar Assinatura
            </Button>
          </div>
        </div>
      </div>
    </DefaultModal>
  )
}
