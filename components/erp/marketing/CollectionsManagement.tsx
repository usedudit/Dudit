"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { PlusIcon, TrashIcon, EditIcon, EyeIcon, LinkIcon } from "@/lib/icons"
import {
  createCollection,
  updateCollection,
  deleteCollection,
  getUserCollections,
  getCommunityCollections,
} from "@/app/actions/marketplace/collections"
import Link from "next/link"

interface CollectionRow {
  id: string
  name: string
  description: string | null
  items_count: number
  views_count: number
  created_at: string
}

export function CollectionsManagementPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { businessInfo } = usePermissions()

  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const loadCollections = useCallback(async () => {
    setIsLoading(true)
    try {
      const { items } = await getCommunityCollections()
      setCollections(items as any)
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadCollections() }, [loadCollections])

  const resetForm = () => {
    setFormName("")
    setFormDescription("")
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    setIsSaving(true)
    const result = await createCollection(formName, formDescription || undefined)
    setIsSaving(false)

    if (result.success) {
      toast({ title: "Coleção criada" })
      setIsCreateOpen(false)
      resetForm()
      loadCollections()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
  }

  const handleEdit = async () => {
    if (!editingId || !formName.trim()) return
    setIsSaving(true)
    const result = await updateCollection(editingId, formName, formDescription || undefined)
    setIsSaving(false)

    if (result.success) {
      toast({ title: "Coleção atualizada" })
      setIsEditOpen(false)
      setEditingId(null)
      resetForm()
      loadCollections()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteCollection(id)
    if (result.success) {
      toast({ title: "Coleção excluída" })
      loadCollections()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
  }

  const openEdit = (col: CollectionRow) => {
    setEditingId(col.id)
    setFormName(col.name)
    setFormDescription(col.description || "")
    setIsEditOpen(true)
  }

  return (
    <div className="p-6 space-y-6">
      <ERPPageHeader title="Coleções" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Coleções</h1>
          <p className="text-sm text-brand-inactive-text">Gerencie as coleções da comunidade</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-green text-white hover:bg-[#047857]">
              <PlusIcon className="w-4 h-4 mr-2" />
              Nova Coleção
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Coleção</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-brand-dark">Nome</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Melhores achados da semana"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-brand-dark">Descrição (opcional)</label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descreva sua coleção..."
                  maxLength={500}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={isSaving || !formName.trim()}
                className="w-full bg-brand-green text-white hover:bg-[#047857]"
              >
                {isSaving ? "Salvando..." : "Criar Coleção"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-brand-inactive-text">Nenhuma coleção ainda</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {collections.map((col) => (
            <Card key={col.id} className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-brand-dark truncate">{col.name}</h3>
                  <span className="text-xs text-brand-inactive-text bg-brand-gray px-2 py-0.5 rounded-full">
                    {col.items_count} itens
                  </span>
                </div>
                {col.description && (
                  <p className="text-sm text-gray-500 truncate mt-1">{col.description}</p>
                )}
                <p className="text-xs text-brand-inactive-text mt-1">
                  {col.views_count} visualizações
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Link href={`/colecoes/${col.id}`} target="_blank">
                  <Button variant="outline" size="icon">
                    <LinkIcon className="w-4 h-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="icon" onClick={() => openEdit(col)}>
                  <EditIcon className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleDelete(col.id)}>
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Coleção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-brand-dark">Nome</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-brand-dark">Descrição (opcional)</label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <Button
              onClick={handleEdit}
              disabled={isSaving || !formName.trim()}
              className="w-full bg-brand-green text-white hover:bg-[#047857]"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
