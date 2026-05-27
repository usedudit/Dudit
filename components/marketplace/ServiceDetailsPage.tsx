"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSupabase } from "@/providers/supabase-provider"
import {
  StarIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  CheckIcon,
  ShareIcon,
  HeartIcon,
  MapPinIcon,
} from "@/lib/icons"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { FavoriteButton } from "./FavoriteButton"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, IconPlaceholder } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { ShareModal } from "./ShareModal"
import { VitrineCard } from "./shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useNotification } from "@/hooks/use-notification"
import {
  getPublicAvailableTimeSlots,
  createPublicAppointment,
} from "@/app/actions/marketplace/services"

// ─── Types ─────────────────────────────────────────────────────────────────

interface ServiceDetailsPageClientProps {
  service: any
  staff: Array<{ id: string; name: string; isOwner: boolean }>
  reviews: any[]
  currentUserId?: string | null
  userProfile?: any
  cartCount?: number
}

type BookingStep = "info" | "schedule" | "confirm"

// ─── Helpers ───────────────────────────────────────────────────────────────

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <StarIcon key={i} size={size} strokeWidth={0}
          className={i < Math.round(rating) ? "text-brand-green fill-brand-green" : "text-gray-300 fill-gray-300"} />
      ))}
    </div>
  )
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function generateDateRange(startDate: Date, days: number = 7) {
  const dates = []
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    dates.push({
      date: d,
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      num: d.getDate(),
      day: dayNames[d.getDay()],
      month: d.toLocaleDateString("pt-BR", { month: "short" }),
      isToday: i === 0,
    })
  }
  return dates
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ServiceDetailsPageClient({
  service,
  staff,
  reviews,
  currentUserId: initialUserId,
  userProfile,
  cartCount,
}: ServiceDetailsPageClientProps) {
  const router = useRouter()
  const { user } = useSupabase()
  const { success: notifySuccess, error: notifyError } = useNotification()

  const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
  const [step, setStep] = useState<BookingStep>("info")
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staff[0]?.id || "")
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  useEffect(() => { setIsMounted(true) }, [])
  useEffect(() => { if (!userId && user?.id) setUserId(user.id) }, [userId, user])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const partner = useMemo(() => {
    const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const address = p?.addresses?.[0] || {}
    return {
      id: p?.id || service.partner_id,
      user_id: p?.user_id,
      store_name: p?.store_name || "Profissional",
      city: address?.city || "Brasil",
      state: address?.state || "BR",
      store_avatar: p?.store_image_url || PLACEHOLDER,
      profile_image_url: p?.store_image_url || null,
      banner_url: p?.banner_url || null,
      logo_moderation_status: p?.logo_moderation_status || 'approved',
      banner_moderation_status: p?.banner_moderation_status || 'approved',
      opening_hours: p?.opening_hours || null,
      rating: p?.rating || 0,
      paymentMethods: p?.payment_methods || [],
    }
  }, [service])

  const serviceImages = useMemo(() => {
    const images = (service.images || [])
      .filter((img: string) => typeof img === "string" && img.trim())
      .map((img: string) => getR2ImageUrl(img))
    return images.length > 0 ? images : [PLACEHOLDER]
  }, [service.images])

  const durationMinutes = Number(service.duration_minutes || 60)
  const bufferMinutes = Number(service.buffer_minutes || 0)
  const price = Number(service.price || 0)
  const categoryName = (service as any).service_categories?.name || "Serviço"

  const avgRating = useMemo(() =>
    reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0,
    [reviews]
  )

  const selectedStaff = useMemo(() => staff.find((s) => s.id === selectedStaffId), [staff, selectedStaffId])

  // ─── Date navigation ──────────────────────────────────────────────────────

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const dates = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() + weekOffset * 7)
    return generateDateRange(start, 7)
  }, [today, weekOffset])

  const currentMonth = useMemo(() => {
    if (dates.length === 0) return ""
    return dates[0].date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }, [dates])

  // ─── Fetch slots on date/staff change ─────────────────────────────────────

  useEffect(() => {
    if (!selectedDate || !selectedStaffId || !partner.id) return

    setIsLoadingSlots(true)
    setSelectedTime("")
    getPublicAvailableTimeSlots(
      partner.id,
      selectedStaffId,
      selectedDate,
      durationMinutes,
      bufferMinutes
    ).then((result) => {
      if (result.success) {
        setAvailableSlots(result.slots)
      } else {
        setAvailableSlots([])
      }
      setIsLoadingSlots(false)
    })
  }, [selectedDate, selectedStaffId, partner.id, durationMinutes, bufferMinutes])

  // Auto-select first date
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0].dateStr)
    }
  }, [dates, selectedDate])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleBooking = useCallback(async () => {
    if (!userId) {
      router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
      return
    }

    if (!selectedDate || !selectedTime || !selectedStaffId) {
      notifyError("Erro", "Selecione data, horário e profissional.")
      return
    }

    setIsBooking(true)
    try {
      const result = await createPublicAppointment({
        serviceId: service.id,
        partnerId: partner.id,
        staffId: selectedStaffId,
        staffName: selectedStaff?.name || "Profissional",
        date: selectedDate,
        time: selectedTime,
        serviceName: service.name,
        price,
        durationMinutes,
      })

      if (result.success) {
        notifySuccess("Agendamento confirmado!", `Seu horário foi reservado para ${selectedDate} às ${selectedTime}.`)
        setStep("info")
        setSelectedTime("")
      } else {
        notifyError("Erro ao agendar", result.error || "Tente novamente.")
      }
    } catch {
      notifyError("Erro", "Erro inesperado ao criar agendamento.")
    } finally {
      setIsBooking(false)
    }
  }, [userId, router, selectedDate, selectedTime, selectedStaffId, selectedStaff, service, partner, price, durationMinutes, notifySuccess, notifyError])

  // ─── Booking Panel ────────────────────────────────────────────────────────

  const BookingPanel = (
    <div className="bg-white relative">
      {/* Service Info Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-bold text-brand-dark bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">{categoryName}</span>
        <span className="text-gray-300 text-xs">|</span>
        <span className="text-[13px] font-semibold text-brand-inactive-text">Serviço</span>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-1.5 mb-3">
        <StarIcon size={16} className="text-brand-green fill-brand-green" strokeWidth={0} />
        <span className="text-xs font-medium text-brand-inactive-text">
          {avgRating > 0 ? `${avgRating.toFixed(1)} (${reviews.length} avaliações)` : "Novo"}
        </span>
      </div>

      <h1 className="text-xl sm:text-2xl md:text-[2rem] leading-[1.1] font-medium text-brand-dark mb-4 tracking-tight">
        {service.name}
      </h1>

      {/* Price + Duration */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <p className="text-xl sm:text-2xl md:text-[2rem] leading-none font-medium text-brand-dark">
            {formatCurrency(price)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-brand-inactive-text">
          <ClockIcon size={14} />
          <span>{formatDuration(durationMinutes)}</span>
          {bufferMinutes > 0 && (
            <span className="text-xs text-brand-inactive-text/70">+ {bufferMinutes}min intervalo</span>
          )}
        </div>
      </div>

      {/* ── Staff Selection ── */}
      {staff.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-bold text-brand-dark mb-3">Profissional</label>
          <div className="flex flex-wrap gap-2">
            {staff.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedStaffId(member.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  selectedStaffId === member.id
                    ? "border-brand-green bg-green-50 text-brand-green"
                    : "border-brand-border text-brand-dark hover:border-gray-300 bg-white"
                }`}
              >
                <UserProfileImage fullName={member.name} className="w-6 h-6" />
                {member.name}
                {selectedStaffId === member.id && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Date Selection ── */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="text-sm font-bold text-brand-dark capitalize">{currentMonth}</label>
          <div className="flex gap-3">
            <button
              onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
              disabled={weekOffset === 0}
              className="text-brand-inactive-text hover:text-brand-dark disabled:opacity-30 transition-colors"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="text-brand-dark transition-colors"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center">
          {dates.map((d) => {
            const isSelected = selectedDate === d.dateStr
            return (
              <div
                key={d.dateStr}
                className="flex flex-col gap-2 cursor-pointer group items-center"
                onClick={() => { setSelectedDate(d.dateStr); setSelectedTime("") }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isSelected
                    ? "bg-brand-dark text-white"
                    : "text-brand-dark border border-gray-200 hover:border-brand-dark"
                }`}>
                  {d.num}
                </div>
                <span className={`text-xs font-medium ${
                  isSelected ? "text-brand-dark" : "text-brand-inactive-text"
                }`}>
                  {d.day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Time Slots ── */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="text-sm font-bold text-brand-dark">Horários disponíveis</label>
        </div>

        {!selectedDate ? (
          <div className="text-center py-8">
            <IconPlaceholder
              icon={CalendarIcon}
              title="Selecione uma data"
              subtitle="Escolha uma data acima para ver os horários."
            />
          </div>
        ) : isLoadingSlots ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-brand-inactive-text font-medium">Verificando disponibilidade...</span>
          </div>
        ) : availableSlots.length === 0 ? (
          <div className="text-center py-8">
            <IconPlaceholder
              icon={CalendarIcon}
              title="Nenhum horário disponível"
              subtitle="Tente outra data ou outro profissional."
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedTime(slot)}
                className={`p-2.5 rounded-xl border text-sm font-bold transition-all text-center ${
                  selectedTime === slot
                    ? "border-brand-dark bg-brand-dark text-white"
                    : "border-brand-border hover:border-gray-300 text-brand-dark"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selected Summary ── */}
      <AnimatePresence>
        {selectedTime && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircleIcon size={16} className="text-brand-green" />
                <span className="text-sm font-bold text-brand-dark">Resumo do agendamento</span>
              </div>
              <div className="space-y-1.5 text-sm text-brand-inactive-text">
                <div className="flex justify-between">
                  <span>Profissional</span>
                  <span className="font-bold text-brand-dark">{selectedStaff?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data</span>
                  <span className="font-bold text-brand-dark">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Horário</span>
                  <span className="font-bold text-brand-dark">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duração</span>
                  <span className="font-bold text-brand-dark">{formatDuration(durationMinutes)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-emerald-200 mt-2">
                  <span className="font-bold text-brand-dark">Valor</span>
                  <span className="font-bold text-brand-dark text-base">{formatCurrency(price)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CTA Button ── */}
      <div className="hidden lg:block">
        <Button
          disabled={!selectedTime || isBooking}
          onClick={handleBooking}
          className="w-full mb-4 h-[46px]"
        >
          {isBooking ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Agendando...
            </span>
          ) : !selectedTime ? (
            "Selecione um horário"
          ) : (
            <span className="flex items-center gap-2">
              <CalendarIcon size={18} />
              Confirmar Agendamento
            </span>
          )}
        </Button>
      </div>

      {/* Store Card */}
      <div className="mb-8 mt-4">
        <VitrineCard vitrine={{
          ...partner,
          name: partner.store_name,
          partners: {
            ...partner,
            store_avatar: partner.profile_image_url
          },
          images: partner.banner_url ? [partner.banner_url] : []
        }} />
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={isMounted ? window.location.href : ""}
        title={service.name}
        shareMessage={`🗓️ Olha esse serviço na Dudit!\n\n*${service.name}*\nConfere aqui os detalhes:`}
        label="Link do serviço"
      />

      <MarketplaceHeader
        userProfile={userProfile}
        cartCount={cartCount}
        productName={service.name}
        onShare={() => setShowShareModal(true)}
        favoriteButton={
          <FavoriteButton
            itemId={service.id}
            itemType="servico"
            size="md"
            variant="icon-only"
          />
        }
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="min-h-screen bg-white lg:pt-[50px] font-sans flex flex-col"
      >
        <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
            <Link href="/" prefetch={true} className="hover:text-brand-dark transition-colors">Início</Link>
            <ChevronRightIcon size={10} />
            <Link href="/explorar?type=servicos" prefetch={true} className="hover:text-brand-dark transition-colors">Serviços</Link>
            <ChevronRightIcon size={10} />
            <span className="text-brand-inactive-text truncate max-w-[300px]">{service.name}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            {/* ── Left Column: Gallery + Description ── */}
            <div className="lg:col-span-7">
              {/* Hero Image */}
              <div className="relative bg-brand-gray rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: "4/3" }}>
                <img
                  src={serviceImages[0]}
                  alt={`${service.name} - Serviço disponível em ${partner.city}`}
                  className="w-full h-full object-cover"
                />

                {/* Overlay badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                    <ClockIcon size={12} className="text-brand-dark" />
                    <span className="text-xs font-bold text-brand-dark">{formatDuration(durationMinutes)}</span>
                  </div>
                </div>

                {/* Desktop action buttons */}
                <div className="hidden lg:flex absolute top-4 right-4 gap-2">
                  <FavoriteButton
                    itemId={service.id}
                    itemType="servico"
                    size="lg"
                    variant="overlay"
                  />
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                  >
                    <ShareIcon className="w-4 h-4 text-brand-green" />
                  </button>
                </div>

                {/* Location pill */}
                {partner.city && partner.city !== "Brasil" && (
                  <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                    <MapPinIcon size={12} className="text-brand-green" />
                    <span className="text-xs font-bold text-brand-dark">{partner.city} - {partner.state}</span>
                  </div>
                )}
              </div>

              {/* Mobile booking panel */}
              <div className="lg:hidden mb-6">{BookingPanel}</div>

              {/* Description */}
              <div className="mb-10">
                <h3 className="text-xl font-medium text-brand-dark mb-4">Descrição</h3>
                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                  <p className="text-sm md:text-[0.9375rem] text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {service.description || "Sem descrição."}
                  </p>
                  {!isDescriptionExpanded && service.description?.length > 200 && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
                {service.description?.length > 200 && (
                  <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                    {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </div>

              {/* Reviews */}
              <div className="border-t border-brand-border pt-2">
                <h3 className="text-xl font-medium text-brand-dark mb-6 mt-8">Avaliações do serviço</h3>
                {reviews.length > 0 && (
                  <div className="border border-brand-border rounded-xl p-5 mb-8 flex gap-8 items-center">
                    <div className="text-center shrink-0">
                      <p className="text-5xl font-black text-brand-dark leading-none mb-2">{avgRating.toFixed(1)}</p>
                      <div className="flex justify-center mb-1.5"><StarRow rating={avgRating} size={14} /></div>
                      <p className="text-xs text-brand-inactive-text">média de {reviews.length} avaliações</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviews.filter((r: any) => r.rating === star).length
                        const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-xs text-brand-inactive-text w-3 shrink-0">{star}</span>
                            <StarIcon size={10} strokeWidth={0} className="text-brand-inactive-text fill-gray-400 shrink-0" />
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-green rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-brand-inactive-text w-4 text-right shrink-0">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {reviews.length > 0 ? (
                  <div className="space-y-6">
                    {reviews.map((rev: any, i: number) => (
                      <div key={i} className="border-b border-brand-border pb-6 last:border-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-brand-inactive-text">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-brand-dark">{rev.profiles?.full_name || "Usuário"}</span>
                              <span className="text-xs text-brand-inactive-text shrink-0">
                                {new Date(rev.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                            <div className="mt-1"><StarRow rating={rev.rating} size={11} /></div>
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed ml-12">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png"
                    imageAlt="Sem avaliações"
                    title="Ainda não temos avaliações por aqui"
                    subtitle="Seja o primeiro a contar como foi sua experiência!"
                  />
                )}
              </div>
            </div>

            {/* ── Right Column: Booking Panel (Desktop) ── */}
            <div className="hidden lg:block lg:col-span-5 relative">
              {BookingPanel}
            </div>
          </div>

          {/* Mobile bottom bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-50 flex gap-3 lg:hidden shadow-lg">
            <div className="flex-1 flex flex-col justify-center">
              <span className="text-lg font-bold text-brand-dark leading-none">{formatCurrency(price)}</span>
              <span className="text-xs text-brand-inactive-text">{formatDuration(durationMinutes)}</span>
            </div>
            <Button
              className="flex-1 rounded-full"
              disabled={!selectedTime || isBooking}
              onClick={handleBooking}
            >
              {isBooking ? "Agendando..." : !selectedTime ? "Selecione um horário" : (
                <span className="flex items-center gap-2">
                  <CalendarIcon size={16} />
                  Confirmar
                </span>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  )
}
