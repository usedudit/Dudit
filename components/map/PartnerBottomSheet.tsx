"use client"

import { StarIcon, MapPin, X } from "lucide-react"
import { getOpeningStatus } from "@/lib/utils/opening-hours"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"

interface PartnerCardProps {
  partner: any
  onClose: () => void
}

export function PartnerBottomSheet({ partner, onClose }: PartnerCardProps) {
  if (!partner) return null

  const statusText = getOpeningStatus(partner.opening_hours)
  const isOpen = statusText.startsWith("Aberto")

  const imageUrl = partner.store_image_url ? getR2ImageUrl(partner.store_image_url) : "https://img.dudit.com.br/static/Placeholder.png"

  return (
    <>
      <div
        className="fixed lg:hidden inset-0 z-40 bg-black/20 backdrop-blur-sm animate-in fade-in transition-opacity"
        onClick={onClose}
      />
      <div className="fixed lg:absolute bottom-0 lg:bottom-auto lg:top-4 left-0 lg:left-4 right-0 lg:right-auto lg:w-[340px] z-50 bg-white rounded-t-3xl lg:rounded-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.1)] lg:shadow-xl p-5 transform-gpu transition-all duration-300 animate-in slide-in-from-bottom-5 lg:slide-in-from-left-4">

        {/* Mobile drag bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 lg:hidden" />

        <button
          onClick={onClose}
          className="hidden lg:flex absolute top-3 right-3 w-8 h-8 items-center justify-center bg-gray-100 rounded-full text-gray-500 hover:text-brand-dark transition-colors"
        >
          <X size={18} />
        </button>

        <Link href={`/${partner.id}`} prefetch={false} className="group flex gap-4">
          {/* Imagem do Parceiro */}
          <div className="w-[84px] h-[84px] rounded-xl overflow-hidden shrink-0 border border-brand-border bg-gray-50 flex items-center justify-center">
            <img
              src={imageUrl}
              alt={partner.store_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>

          <div className="flex flex-col flex-1 pb-1">
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-semibold text-[16px] text-brand-dark leading-tight line-clamp-2 pr-4">{partner.store_name}</h3>
            </div>

            {partner.rating > 0 && (
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <StarIcon size={14} fill="#059669" className="text-brand-green shrink-0" />
                <span className="text-[13px] font-bold text-brand-dark">{partner.rating.toFixed(1)}</span>
              </div>
            )}

            <div className="flex items-start gap-1.5 mb-2 mt-auto">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <span className="text-[13px] text-gray-500 line-clamp-2 leading-tight">
                {partner.address_display || "Endereço não disponível"}
              </span>
            </div>

            <div className={`mt-1 text-[13px] font-medium px-2 py-0.5 rounded-full self-start ${isOpen ? "bg-green-50 text-brand-green" : "bg-orange-50 text-orange-600"}`}>
              {statusText}
            </div>
          </div>
        </Link>
      </div>
    </>
  )
}
