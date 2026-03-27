"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getMarketplaceCategoriesClient } from "@/lib/data/marketplace-categories-client"
import { Input } from "@/components/reusable"
import { Spinner } from "@/components/reusable/Spinner"
import { ChevronRight, ChevronLeft, Search, Package } from "lucide-react"

interface Category {
  id: string
  name: string
  parent_id: string | null
  icon_url?: string | null
}

interface MarketplaceCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (category: { id: string; name: string; path: string }) => void
}

export default function MarketplaceCategoryModal({
  isOpen,
  onClose,
  onSelect,
}: MarketplaceCategoryModalProps) {
  const [history, setHistory] = useState<Category[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (isOpen) {
      setHistory([])
      setSearch("")
      loadCategories(null)
    }
  }, [isOpen])

  const loadCategories = async (parentId: string | null) => {
    setLoading(true)
    try {
      const data = await getMarketplaceCategoriesClient(parentId)
      if (data && data.length > 0) {
        setCategories(data)
      } else if (parentId) {
        setCategories([])
      }
    } catch (error) {
      console.error("Erro ao carregar categorias", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryClick = async (category: Category) => {
    setLoading(true)
    const children = await getMarketplaceCategoriesClient(category.id)
    setLoading(false)

    if (children && children.length > 0) {
      setHistory((prev) => [...prev, category])
      setCategories(children)
      setSearch("")
    } else {
      const breadcrumbs = [...history, category]
      const fullPath = breadcrumbs.map(c => c.name).join(" > ")

      onSelect({
        id: category.id,
        name: category.name,
        path: fullPath
      })
      onClose()
    }
  }

  const handleBack = () => {
    if (history.length === 0) return
    const newHistory = [...history]
    newHistory.pop()
    setHistory(newHistory)
    const parentId = newHistory.length > 0 ? newHistory[newHistory.length - 1].id : null
    loadCategories(parentId)
  }

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Categorizar Produto"
      description="Selecione onde seu produto se encaixa."
    >
      <div className="h-[500px] flex flex-col">
        {/* Header: Breadcrumbs */}
        <div className="flex items-center gap-3 p-1 mb-4 border-b border-gray-100 pb-4">
          {history.length > 0 ? (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-9 h-9 flex items-center justify-center bg-green-50 rounded-full text-brand-green">
              <Package className="w-5 h-5" />
            </div>
          )}

          <div className="flex-1 overflow-hidden flex items-center text-sm">
            {history.length === 0 ? (
              <span className="text-gray-500 font-medium">Todas as Categorias</span>
            ) : (
              history.map((cat, idx) => (
                <React.Fragment key={cat.id}>
                  <span className="text-gray-500 truncate max-w-[100px]">{cat.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 mx-1 flex-shrink-0" />
                </React.Fragment>
              ))
            )}
            {history.length > 0 && <span className="font-bold text-gray-800 ml-1">Selecione...</span>}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-brand-gray border-gray-200"
          />
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Spinner size={18} />
            </div>
          ) : filteredCategories.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={history.length}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-2"
              >
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className="w-full flex items-center justify-between p-3 hover:bg-brand-gray rounded-lg border border-transparent hover:border-gray-200 transition-all group text-left"
                  >
                    <div className="flex items-center gap-3">
                      {/* ÁREA DO ÍCONE (URL) */}
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-100 group-hover:border-gray-300 transition-colors">
                        {cat.icon_url && cat.icon_url.length > 3 ? (
                          <img
                            src={cat.icon_url}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Se a imagem falhar, esconde ela e mostra o fallback
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.classList.add('fallback-active');
                            }}
                          />
                        ) : (
                          <Package className="w-5 h-5 text-gray-400" />
                        )}
                        {/* Fallback oculto que aparece via CSS se precisar, ou apenas mantemos o Package no else acima */}
                      </div>

                      <span className="text-sm font-medium text-gray-700 group-hover:text-brand-dark">
                        {cat.name}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-green transition-colors" />
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Package className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">Nenhuma categoria encontrada.</p>
            </div>
          )}
        </div>
      </div>
    </DefaultModal>
  )
}